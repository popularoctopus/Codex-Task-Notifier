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

class SessionRecords {
  constructor(onEvent, options = {}) {
    this.onEvent = onEvent;
    this.detectEdits = options.detectEdits !== false;
    this.onReset = options.onReset;
    this.reset();
  }
  reset() {
    this.partial = ''; this.skipFirstLine = false; this.turnId = undefined;
    this.onReset?.();
  }
  inspect(chunk) {
    this.partial += chunk;
    const lines = this.partial.split('\n');
    this.partial = lines.pop();
    if (this.partial.length > 2 * 1024 * 1024) { this.partial = ''; this.skipFirstLine = true; }
    for (const line of lines) {
      if (this.skipFirstLine) { this.skipFirstLine = false; continue; }
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      const timestamp = Date.parse(record?.timestamp);
      const item = record?.payload;
      if (!Number.isFinite(timestamp) || !item || typeof item !== 'object') continue;
      if (record.type === 'event_msg') {
        if (item.type === 'task_started') {
          this.turnId = item.turn_id;
          // Record timestamps retain milliseconds; started_at/completed_at in
          // the payload can be whole Unix seconds and lose threshold precision.
          this.onEvent('start', timestamp, this.turnId);
        }
        if (item.type === 'agent_message' && item.phase === 'final_answer') this.onEvent('final', timestamp, this.turnId);
        if (item.type === 'task_complete') {
          this.onEvent(typeof item.last_agent_message === 'string' && item.last_agent_message.length ? 'final' : 'interrupted',
            timestamp, item.turn_id || this.turnId);
        }
        if (item.type === 'turn_aborted') this.onEvent('interrupted', timestamp, item.turn_id || this.turnId);
        if (this.detectEdits && item.type === 'patch_apply_begin') this.onEvent('edit', timestamp, item.turn_id || this.turnId);
      }
      if (record.type === 'response_item') {
        if (item.type === 'message' && item.role === 'assistant' && item.phase === 'final_answer') this.onEvent('final', timestamp, this.turnId);
        if (this.detectEdits && isEditCall(item)) this.onEvent('edit', timestamp, this.turnId);
      }
    }
  }
}

// Only read transcripts whose filename matches a thread observed in this
// window's Codex.log. Interpret lifecycle metadata, not conversation text.
class CodexSessionMonitor {
  constructor(directory, detector, options = {}) {
    this.directory = directory;
    this.detector = detector;
    this.fs = options.fs || fs;
    this.now = options.now || Date.now;
    this.detectEdits = options.detectEdits !== false;
    this.paths = new Map();
    this.readers = new Map();
    this.nextScan = 0;
  }
  async discover(threads) {
    const pending = new Set(threads.filter(id => !this.paths.has(id)));
    if (!pending.size || this.now() < this.nextScan) return;
    this.nextScan = this.now() + 1000;
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
    const turns = [...this.detector.turns.values()];
    await this.discover(turns.map(turn => turn.thread));
    const selected = new Set(turns.map(turn => turn.thread));
    for (const thread of this.readers.keys()) if (!selected.has(thread)) this.readers.delete(thread);
    for (const turn of turns) {
      const filename = this.paths.get(turn.thread);
      if (!filename) continue;
      let reader = this.readers.get(turn.thread);
      if (!reader) {
        const records = new SessionRecords((event, timestamp, turnId) => this.detector.session(turn.thread, event, timestamp, turnId), {
          detectEdits: this.detectEdits
        });
        records.onReset = () => this.detector.cancel(this.detector.turns.get(turn.thread), 'transcript-reset');
        reader = new CodexLogReader(filename, records, { fs: this.fs, tailBytes: 1024 * 1024 });
        this.readers.set(turn.thread, reader);
      }
      await reader.poll();
    }
  }
}
module.exports = { CodexSessionMonitor, SessionRecords, isEditCall };
