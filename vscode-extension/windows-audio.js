'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');
const { normalizeVolume, prepareSound } = require('./audio-volume');

const SOUNDS = new Set(['chime.wav','positive.wav','software.wav','flute.wav','marimba.wav','scifi.wav']);
// The script is fixed. Pass the allowlisted asset path as data, never as shell code.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$player = New-Object System.Media.SoundPlayer
try {
  $player.SoundLocation = $env:CODEX_NOTIFIER_SOUND_FILE
  $player.Load()
  $player.PlaySync()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  $player.Dispose()
}
`;

class WindowsAudioPlayer {
  constructor(directory) {
    this.directory = directory;
    this.active = undefined;
    this.disposed = false;
  }
  stop() {
    if (!this.active) return;
    this.active.cancelled = true;
    this.active.child?.kill();
    this.active = undefined;
  }
  play(name, volume = 100) {
    if (this.disposed) return Promise.resolve(false);
    this.stop();
    volume = normalizeVolume(volume);
    if (volume === 0) return Promise.resolve(false);
    const sound = SOUNDS.has(name) ? name : 'chime.wav';
    const request = { cancelled: false };
    this.active = request;
    return new Promise((resolve, reject) => {
      let prepared;
      const finish = (error, stdout, stderr = '') => {
        try { prepared?.dispose(); } catch (cleanupError) { error ||= cleanupError; }
        if (this.active === request) this.active = undefined;
        if (request.cancelled) return resolve(false);
        if (error) return reject(new Error(`${sound}: ${stderr.trim() || error.message}`));
        resolve(true);
      };
      try {
        prepared = prepareSound(path.join(this.directory, sound), volume);
        request.child = execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-OutputFormat', 'Text', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
          { windowsHide: true, shell: false, timeout: 15000, maxBuffer: 16384,
            env: { ...process.env, CODEX_NOTIFIER_SOUND_FILE: prepared.filename } }, finish);
      } catch (error) {
        finish(error);
      }
    });
  }
  dispose() {
    this.disposed = true;
    this.stop();
  }
}

module.exports = { WindowsAudioPlayer };
