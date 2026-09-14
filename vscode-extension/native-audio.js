'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');
const { WindowsAudioPlayer } = require('./windows-audio');

const SOUNDS = new Set(['magic.wav','flute.wav','marimba.wav','scifi.wav','positive.wav','software.wav']);

class PosixAudioPlayer {
  constructor(directory, platform) {
    this.directory = directory;
    this.platform = platform;
    this.commands = platform === 'darwin' ? ['/usr/bin/afplay'] : ['pw-play', 'paplay', 'aplay'];
    this.preferred = undefined;
    this.active = undefined;
    this.disposed = false;
  }
  stop() {
    const request = this.active;
    if (!request) return;
    request.cancelled = true;
    request.child?.kill('SIGKILL');
    this.active = undefined;
  }
  async play(name) {
    if (this.disposed) return false;
    this.stop();
    const sound = SOUNDS.has(name) ? name : 'positive.wav';
    const filename = path.join(this.directory, sound);
    const request = { cancelled: false };
    this.active = request;
    const commands = this.preferred
      ? [this.preferred, ...this.commands.filter(command => command !== this.preferred)] : this.commands;
    const failures = [];
    try {
      for (const command of commands) {
        if (request.cancelled) return false;
        try {
          // Fixed commands and allowlisted absolute asset paths; never use a shell.
          await new Promise((resolve, reject) => {
            request.child = execFile(command, [filename],
              { shell: false, windowsHide: true, timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 16384 },
              (error, stdout, stderr = '') => {
                if (error) reject(new Error(stderr.trim() || error.message));
                else resolve();
              });
          });
          if (request.cancelled) return false;
          this.preferred = command;
          return true;
        } catch (error) {
          if (request.cancelled) return false;
          failures.push(`${command}: ${error.message}`);
        } finally { request.child = undefined; }
      }
      const help = this.platform === 'linux'
        ? 'Install pw-play (PipeWire), paplay (PulseAudio), or aplay (ALSA), and check your desktop audio output.'
        : 'Check your macOS audio output and that /usr/bin/afplay can play the bundled WAV files.';
      throw new Error(`${sound}: ${help} ${failures.join('; ')}`);
    } finally {
      if (this.active === request) this.active = undefined;
    }
  }
  dispose() {
    this.disposed = true;
    this.stop();
  }
}

function createAudioPlayer(directory, platform = process.platform) {
  if (platform === 'win32') return new WindowsAudioPlayer(directory);
  if (platform === 'darwin' || platform === 'linux') return new PosixAudioPlayer(directory, platform);
  return undefined;
}

module.exports = { createAudioPlayer };
