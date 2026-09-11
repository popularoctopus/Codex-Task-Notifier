'use strict';
const vscode = require('vscode');
const { randomBytes } = require('crypto');
const { TaskState } = require('./state');
const { WindowsAudioPlayer } = require('./windows-audio');
const STATUS_FILE = '.codex-task-status.json';

function activate(context) {
  const state = new TaskState();
  let panel, timer, stopped = false, busy = false, pendingOpen = false;
  let preferences = context.globalState.get('preferences', {});
  const config = key => vscode.workspace.getConfiguration('codexTaskNotifier').get(key);
  const output = vscode.window.createOutputChannel('Codex Task Notifier');
  const nativeAudio = process.platform === 'win32'
    ? new WindowsAudioPlayer(vscode.Uri.joinPath(context.extensionUri, 'sounds').fsPath) : undefined;
  function playNativeSound(sound) {
    if (stopped || !nativeAudio) return;
    void nativeAudio.play(sound).catch(error => {
      if (stopped) return;
      output.appendLine(`Windows audio playback failed: ${error.message}`);
      void vscode.window.showWarningMessage('Codex Task Notifier could not play the Windows sound. See the Codex Task Notifier Output channel for details.');
    });
  }
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
      if (message?.type === 'reset' && state.reset()) send();
      if (message?.type === 'instructions') void instructions();
      if (message?.type === 'playSound') playNativeSound(message.sound);
      if (message?.type === 'preferences' && message.values && typeof message.values === 'object') {
        const clean = {};
        for (const key of ['codexMode','codexFont','codexSound']) {
          if (typeof message.values[key] === 'string' && message.values[key].length < 200) clean[key] = message.values[key];
        }
        preferences = clean;
        void context.globalState.update('preferences', clean);
      }
      if (message?.type === 'audioError') {
        const detail = ['sound','name','message'].map(key =>
          typeof message[key] === 'string' ? message[key].replace(/[\r\n]/g, ' ').slice(0, 500) : '').filter(Boolean).join(': ');
        output.appendLine(`Audio playback failed: ${detail || 'Unknown error'}`);
        if (message.name === 'NotAllowedError') {
          void vscode.window.showWarningMessage('Codex Task Notifier: click Enable sounds in the board settings to enable completion sounds. Repeat after closing or refreshing the board.');
        } else {
          void vscode.window.showWarningMessage('Codex Task Notifier could not play audio. See the Codex Task Notifier Output channel for details.');
        }
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
    html = html.replace('<script>', `<script nonce="${nonce}">\nconst nativeAudio = ${Boolean(nativeAudio)};\nconst soundBase = ${JSON.stringify(soundBase + '/')};`);
    current.webview.html = html;
  }
  async function apply(source, value) {
    const change = state.accept(source, value);
    if (!change) return;
    if (change.starts && config('autoOpen')) pendingOpen = true;
    if (pendingOpen) {
      pendingOpen = false;
      try { await show(); }
      catch (error) { pendingOpen = true; throw error; }
    }
    if (change.finishes) playNativeSound(preferences.codexSound);
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
`# Paste this into Codex

Set up Codex Task Notifier once for all my workspaces using global Codex instructions.
Use AGENTS.md in the active Codex home directory (CODEX_HOME when set, otherwise
~/.codex). Create it if needed, preserve unrelated instructions, and replace old
notifier rules. If AGENTS.override.md takes precedence there, update its notifier
rules too so the global rules are effective without changing unrelated instructions.
Do not add notifier rules to workspace AGENTS.md files. Check the current workspace's
applicable instruction files for old notifier rules and remove only those blocks.

Add these global rules: Resolve the current task's workspace root from the current
environment for each task. Never hard-code the setup workspace or reuse a path from
an earlier task. If no workspace root is available, skip the status update and report
that briefly.
Before substantive work, write ${STATUS_FILE} in that workspace root as JSON:
{"state":"working","updatedAt":"<new unique timestamp or task identifier>"}
Only after all requested work and validation are complete, immediately before the
final response, write the same file with state "done" and a new unique updatedAt.
Never mark unfinished, blocked, or interrupted work done. Only the primary agent
updates the file, using ordinary file tools. Keep task content and personal data
out of it. If a status update fails, report it briefly and continue authorized work.
Respect existing sandbox permissions and approval requirements.

Include in the global rules: In each Git workspace, ensure ${STATUS_FILE} is
ignored in the workspace root .gitignore without duplicating an existing matching rule.

Validate the setup and report which global instruction files were updated. Remind me
to start a new Codex session in other workspaces so they load the global rules.
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
    {dispose() { stopped = true; clearTimeout(timer); nativeAudio?.dispose(); panel?.dispose(); }}
  );
  void poll();
}
module.exports = { activate };
