'use strict';
const vscode = require('vscode');
const { randomBytes } = require('crypto');
const { TaskState } = require('./state');
const STATUS_FILE = '.codex-task-status.json';

function activate(context) {
  const state = new TaskState();
  let panel, timer, stopped = false, busy = false, pendingOpen = false;
  let preferences = context.globalState.get('preferences', {});
  const config = key => vscode.workspace.getConfiguration('codexTaskNotifier').get(key);
  const output = vscode.window.createOutputChannel('Codex Task Notifier');
  const lastErrors = new Map();
  function send(extra = {}) {
    return panel?.webview.postMessage({ type: 'status', state: state.state, preferences, ...extra });
  }
  async function show(refresh = false) {
    if (panel) {
      if (refresh) await render();
      panel.reveal(panel.viewColumn, false);
      return;
    }
    panel = vscode.window.createWebviewPanel('codexStatus.board', 'Codex Task Notifier',
      vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri] });
    const current = panel;
    current.onDidDispose(() => { if (panel === current) panel = undefined; });
    current.webview.onDidReceiveMessage(message => {
      if (message?.type === 'ready') send();
      if (message?.type === 'instructions') void instructions();
      if (message?.type === 'preferences' && message.values && typeof message.values === 'object') {
        const clean = {};
        for (const key of ['codexMode','codexFont','codexSound']) {
          if (typeof message.values[key] === 'string' && message.values[key].length < 200) clean[key] = message.values[key];
        }
        preferences = clean;
        void context.globalState.update('preferences', clean);
      }
      if (message?.type === 'audioError') {
        void vscode.window.showWarningMessage('Codex Task Notifier could not play audio. Open the board and click Play to enable or test sound.');
      }
    });
    await render();
  }
  async function render() {
    const current = panel;
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'index.html'));
    if (!current || current !== panel) return;
    const nonce = randomBytes(16).toString('hex');
    const soundBase = current.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'sounds')).toString();
    let html = Buffer.from(bytes).toString('utf8');
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; media-src ${current.webview.cspSource}; script-src 'nonce-${nonce}';">`);
    html = html.replace('<script>', `<script nonce="${nonce}">\nconst soundBase = ${JSON.stringify(soundBase + '/')};`);
    current.webview.html = html;
  }
  async function apply(source, value) {
    const change = state.accept(source, value);
    if (!change) return;
    if (change.starts && config('autoOpen')) pendingOpen = true;
    if (pendingOpen && vscode.window.state.focused) { pendingOpen = false; await show(); }
    if (change.state === 'done') pendingOpen = false;
    send({ completed: change.finishes });
    if (change.finishes && config('notifications')) {
      void vscode.window.showInformationMessage('Codex task completed.', 'Open board').then(choice => {
        if (choice) void show();
      });
    }
  }
  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      const uris = (vscode.workspace.workspaceFolders || []).map(folder => vscode.Uri.joinPath(folder.uri, STATUS_FILE));
      const legacy = config('legacyStatusFile');
      if (legacy) uris.push(vscode.Uri.file(legacy));
      for (const uri of uris) {
        const key = uri.toString();
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > 16384) throw new Error('Status file exceeds 16 KB');
          const value = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8').replace(/^\uFEFF/, ''));
          if (!stopped) await apply(key, value);
          lastErrors.delete(key);
        } catch (error) {
          if (error.code !== 'FileNotFound' && lastErrors.get(key) !== error.message) {
            output.appendLine(`Status read failed: ${error.message}`);
            lastErrors.set(key, error.message);
          }
        }
      }
    } finally { busy = false; if (!stopped) timer = setTimeout(poll, 500); }
  }
  async function instructions() {
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content:
`# Codex Task Notifier setup

Add the following block to your workspace root AGENTS.md. Review existing notifier
instructions and replace the old status-script block to avoid duplicate notifications.
This command does not modify your instructions automatically. Start a new Codex task
after saving. In a multi-root workspace, add the block to each project using the notifier.
Optionally ignore ${STATUS_FILE} in Git.

## Codex Task Notifier

Before substantive work, write ${STATUS_FILE} in this workspace root as JSON:
{"state":"working","updatedAt":"<new unique timestamp or task identifier>"}
Only when all requested work and validation are complete, immediately before the final
response, write the same file with state "done" and a new unique updatedAt string.
Never mark unfinished, blocked, or interrupted work done. Use normal file tools;
no shell, PowerShell, Python, server, or platform-specific path is required.
Only the primary agent writes this file. Keep task content and personal data out of it.
The file represents one task stream per workspace root; concurrent tasks in the same
root are last-writer-wins. These instructions do not override sandbox permissions.
` });
    await vscode.window.showTextDocument(document);
  }
  context.subscriptions.push(output,
    vscode.commands.registerCommand('codexStatus.open', () => show()),
    vscode.commands.registerCommand('codexStatus.refresh', () => show(true)),
    vscode.commands.registerCommand('codexStatus.instructions', instructions),
    vscode.commands.registerCommand('codexStatus.test', async () => {
      await show();
      await apply('manual-test', {state:'working', updatedAt:randomBytes(8).toString('hex')});
      const testTimer = setTimeout(() => {
        if (!stopped) void apply('manual-test', {state:'done', updatedAt:randomBytes(8).toString('hex')});
      }, 2000);
      context.subscriptions.push({dispose() { clearTimeout(testTimer); }});
    }),
    vscode.window.onDidChangeWindowState(event => {
      if (event.focused && pendingOpen) { pendingOpen = false; void show(); }
    }),
    {dispose() { stopped = true; clearTimeout(timer); panel?.dispose(); }}
  );
  void poll();
}
module.exports = { activate };
