'use strict';
const vscode = require('vscode');
const { randomBytes } = require('crypto');
const { TaskState } = require('./state');
const { createAudioPlayer } = require('./native-audio');
const path = require('node:path');
const os = require('node:os');
const { CodexLogDetector, CodexLogReader } = require('./codex-log');
const { CodexEditMonitor } = require('./codex-edits');

const DEFAULT_PREFERENCES = {
  codexMode: 'dark',
  codexFont: '"Arial", "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif',
  codexSound: 'chime.wav'
};

function activate(context) {
  const state = new TaskState();
  let panel, timer, stopped = false, busy = false, pendingOpen = false;
  const storedPreferences = context.globalState.get('preferences', {});
  let preferences = {
    ...DEFAULT_PREFERENCES,
    ...(storedPreferences && typeof storedPreferences === 'object' ? storedPreferences : {})
  };
  if (preferences.codexSound === 'magic.wav') preferences.codexSound = DEFAULT_PREFERENCES.codexSound;
  const config = key => vscode.workspace.getConfiguration('codexTaskNotifier').get(key);
  const output = vscode.window.createOutputChannel('Codex Task Notifier');
  const nativeAudio = createAudioPlayer(vscode.Uri.joinPath(context.extensionUri, 'sounds').fsPath);
  function playNativeSound(sound) {
    if (stopped || !nativeAudio || sound === 'none') return;
    void nativeAudio.play(sound).catch(error => {
      if (stopped) return;
      output.appendLine(`Native audio playback failed (${process.platform}): ${error.message}`);
      void vscode.window.showWarningMessage('Codex Task Notifier could not play the notification sound. See the Codex Task Notifier Output channel for details.');
    });
  }
  let lastError;
  let eventQueue = Promise.resolve();
  const detector = new CodexLogDetector((source, value) => {
    eventQueue = eventQueue.then(() => stopped ? undefined : apply(source, value)).catch(error => {
      output.appendLine(`Notification failed: ${error.message}`);
    });
  }, { heuristic: config('detectionMode') !== 'conservative',
    minimumMs: (Number.isFinite(config('minimumActivitySeconds')) ? config('minimumActivitySeconds') : 10) * 1000 });
  const logPath = config('codexLogPath') || path.join(path.dirname(context.logUri.fsPath), 'openai.chatgpt', 'Codex.log');
  const reader = new CodexLogReader(logPath, detector);
  const editMonitor = config('detectFileEdits') === false ? undefined : new CodexEditMonitor(
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions'), detector);
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
    const fontUri = current.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'fonts/ManufacturingConsent-Regular.ttf')).toString();
    html = html.replace('./fonts/ManufacturingConsent-Regular.ttf', fontUri);
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src ${current.webview.cspSource}; media-src ${current.webview.cspSource}; script-src 'nonce-${nonce}';">`);
    html = html.replace('<script>', `<script nonce="${nonce}">\nconst nativeAudio = ${Boolean(nativeAudio)};\nconst soundBase = ${JSON.stringify(soundBase + '/')};`);
    current.webview.html = html;
  }
  async function apply(source, value) {
    const change = state.accept(source, value);
    if (!change) return;
    output.appendLine(change.finishes ? 'Codex completion detected.' : change.starts ? 'Codex turn started.' : 'Codex tracking reset without completion.');
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
      await reader.poll();
      await editMonitor?.poll();
      lastError = undefined;
    } catch (error) {
      if (lastError !== error.message) output.appendLine(`Codex log read failed: ${error.message}`);
      lastError = error.message;
    } finally { busy = false; if (!stopped) timer = setTimeout(poll, 500); }
  }
  context.subscriptions.push(output,
    vscode.commands.registerCommand('codexStatus.open', () => show()),
    vscode.commands.registerCommand('codexStatus.refresh', () => show(true)),
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
    {dispose() { stopped = true; clearTimeout(timer); detector.dispose(); nativeAudio?.dispose(); panel?.dispose(); }}
  );
  output.appendLine('Automatic Codex log detection active. Existing history is skipped. Reload the window after changing detection settings.');
  void poll();
}
module.exports = { activate };
