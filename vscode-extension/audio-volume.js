'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function normalizeVolume(value) {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 100;
}

// Attenuate only sample data; preserve headers and metadata in bundled 16-bit PCM WAVs.
function scaleWav(source, volume) {
  const bytes = Buffer.from(source);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }
  let supported = false;
  const data = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error('Truncated WAV file');
    const type = bytes.toString('ascii', offset, offset + 4);
    if (type === 'fmt ') supported = size >= 16 && bytes.readUInt16LE(start) === 1 && bytes.readUInt16LE(start + 14) === 16;
    if (type === 'data') data.push([start, size]);
    offset = start + size + size % 2;
  }
  if (!supported || !data.length) throw new Error('Expected 16-bit PCM WAV audio');
  const gain = normalizeVolume(volume) / 100;
  for (const [start, size] of data) {
    if (size % 2) throw new Error('Invalid PCM sample data');
    for (let offset = start; offset < start + size; offset += 2) {
      bytes.writeInt16LE(Math.round(bytes.readInt16LE(offset) * gain), offset);
    }
  }
  return bytes;
}

function prepareSound(filename, volume) {
  if (normalizeVolume(volume) === 100) return { filename, dispose() {} };
  const bytes = scaleWav(fs.readFileSync(filename), volume);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notifier-audio-'));
  const temporary = path.join(directory, 'sound.wav');
  const dispose = () => {
    fs.rmSync(temporary, { force: true });
    fs.rmdirSync(directory);
  };
  try { fs.writeFileSync(temporary, bytes); }
  catch (error) { dispose(); throw error; }
  return { filename: temporary, dispose };
}

module.exports = { normalizeVolume, scaleWav, prepareSound };
