'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { CodexLogReader } = require('./codex-log');

function isEditCall(item) {
  if (!item || !['function_call', 'custom_tool_call'].includes(item.type)) return false;
  if (item.name === 'apply_patch' || item.name === 'functions.apply_patch') return true;
  if (item.name !== 'exec' && item.name !== 'functions.exec') return false;
  if (typeof item.input !== 'string') return false;
  // Recognize direct code-mode calls without interpreting quoted code examples,
  // shell strings, or comments as actual edits. Never execute transcript code.
  const code = item.input.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  return /\btools\s*\.\s*apply_patch\s*\(/.test(code);
}

class EditRecords {
  constructor(onEdit) { this.onEdit = onEdit; this.reset(); }
  reset() { this.partial = ''; this.skipFirstLine = false; }
  inspect(chunk) {
    this.partial += chunk;
    const lines = this.partial.split('\n');
    this.partial = lines.pop();
    if (this.partial.length > 2 * 1024 * 1024) { this.partial = ''; this.skipFirstLine = true; }
    for (const line of lines) {
      if (this.skipFirstLine) { this.skipFirstLine = false; continue; }
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (record.type !== 'response_item' || !isEditCall(record.payload)) continue;
      const timestamp = Date.parse(record.timestamp);
      if (Number.isFinite(timestamp)) this.onEdit(timestamp);
    }
  }
}

// Only read transcripts whose filename matches a thread observed in this
// window's Codex.log. Ignore conversation text and tool outputs entirely.
class CodexEditMonitor {
  constructor(directory, detector, options = {}) {
    this.directory = directory;
    this.detector = detector;
    this.fs = options.fs || fs;
    this.now = options.now || Date.now;
    this.paths = new Map();
    this.readers = new Map();
    this.nextScan = 0;
  }
  async discover(threads) {
    const pending = new Set(threads.filter(id => !this.paths.has(id)));
    if (!pending.size || this.now() < this.nextScan) return;
    this.nextScan = this.now() + 10000;
    const dirs = [{ name: this.directory, depth: 0 }];
    let budget = 2048;
    while (dirs.length && pending.size && budget-- > 0) {
      const dir = dirs.pop();
      let entries;
      try { entries = await this.fs.readdir(dir.name, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const filename = path.join(dir.name, entry.name);
        if (entry.isDirectory() && dir.depth < 3) dirs.push({ name: filename, depth: dir.depth + 1 });
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        for (const thread of pending) {
          if (!/^[a-f0-9-]{36}$/i.test(thread) || !entry.name.endsWith('-' + thread + '.jsonl')) continue;
          this.paths.set(thread, filename);
          pending.delete(thread);
        }
      }
    }
  }
  async poll() {
    const turns = [...this.detector.turns.values()].filter(turn =>
      !turn.visible && (!turn.done || this.now() - turn.activeSince < 60000));
    await this.discover(turns.map(turn => turn.thread));
    const selected = new Set(turns.map(turn => turn.thread));
    for (const thread of this.readers.keys()) if (!selected.has(thread)) this.readers.delete(thread);
    for (const turn of turns) {
      const filename = this.paths.get(turn.thread);
      if (!filename) continue;
      let reader = this.readers.get(turn.thread);
      if (!reader) {
        const records = new EditRecords(timestamp => this.detector.edited(turn.thread, timestamp));
        reader = new CodexLogReader(filename, records, { fs: this.fs, tailBytes: 1024 * 1024 });
        this.readers.set(turn.thread, reader);
      }
      await reader.poll();
    }
  }
}
module.exports = { CodexEditMonitor, EditRecords, isEditCall };
