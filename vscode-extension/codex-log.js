'use strict';
const fs = require('node:fs/promises');
const { StringDecoder } = require('node:string_decoder');

// Codex.log and session JSONL are private formats. Use known lifecycle markers,
// never arbitrary assistant text or read-state/diff heuristics for completion.
class CodexLogDetector {
  constructor(emit, options = {}) {
    this.emit = emit;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.minimumMs = options.minimumMs ?? 10000;
    this.now = options.now || Date.now;
    this.turns = new Map();
    this.sequence = 0;
    this.reset();
  }
  reset() {
    for (const turn of this.turns.values()) this.cancel(turn, 'reset');
    this.turns.clear();
    this.partial = '';
  }
  dispose() { this.reset(); this.disposed = true; }
  inspect(chunk) {
    if (this.disposed) return;
    this.partial += chunk;
    const lines = this.partial.split(/\r?\n/);
    this.partial = lines.pop();
    if (this.partial.length > 1024 * 1024) this.partial = '';
    for (const line of lines) this.line(line);
  }
  active() { return [...this.turns.values()].filter(turn => !turn.done); }
  start(thread, timestamp, turnId, transcript = false) {
    if (this.disposed) return;
    const previous = this.turns.get(thread);
    this.cancel(previous, 'superseded', timestamp);
    const turn = { key: 'log:' + (++this.sequence), thread, turnId, done: false,
      working: false, startedAt: Number.isFinite(timestamp) ? timestamp : this.now(), transcript };
    this.turns.set(thread, turn);
    this.emit(thread, { state: 'thinking', updatedAt: turn.key + ':input' });
    this.scheduleWorking(turn);
    return turn;
  }
  showWorking(turn) {
    if (this.disposed || turn.working || turn.done) return;
    turn.working = true;
    this.clearTimer(turn.activationTimer);
    this.emit(turn.thread, { state: 'working', updatedAt: turn.key + ':working' });
  }
  scheduleWorking(turn) {
    this.clearTimer(turn.activationTimer);
    if (turn.working || turn.done) return;
    const remaining = this.minimumMs - (this.now() - turn.startedAt);
    if (remaining <= 0) this.showWorking(turn);
    else turn.activationTimer = this.setTimer(() => this.showWorking(turn), remaining);
  }
  matches(turn, timestamp, turnId) {
    return turn && !turn.done && Number.isFinite(timestamp) && timestamp >= turn.startedAt &&
      (!turnId || !turn.turnId || turnId === turn.turnId);
  }
  edited(thread, timestamp, turnId) {
    const turn = this.turns.get(thread);
    if (!this.disposed && this.matches(turn, timestamp, turnId)) this.showWorking(turn);
  }
  cancel(turn, reason = 'interrupted', timestamp = this.now()) {
    if (!turn || turn.done) return;
    turn.done = true;
    turn.endedAt = Number.isFinite(timestamp) ? timestamp : this.now();
    this.clearTimer(turn.activationTimer);
    this.emit(turn.thread, { state: 'cancelled', updatedAt: turn.key + ':' + reason });
  }
  finish(turn, timestamp) {
    if (!turn || turn.done) return;
    // Duration is measured at the final record, not when the poll finds it.
    // Even an editing turn returns quietly to Ready if its final is too quick.
    if (timestamp - turn.startedAt < this.minimumMs) return this.cancel(turn, 'quick', timestamp);
    turn.done = true;
    turn.endedAt = timestamp;
    this.clearTimer(turn.activationTimer);
    this.emit(turn.thread, { state: 'done', updatedAt: turn.key + ':done' });
  }
  session(thread, event, timestamp, turnId) {
    if (this.disposed || !Number.isFinite(timestamp)) return;
    let turn = this.turns.get(thread);
    // Only follow threads first observed in this window, never historical turns.
    if (!turn || timestamp < turn.startedAt) return;
    if (event === 'start') {
      if (turn.done && timestamp <= turn.endedAt) return;
      if (turnId && turnId === turn.turnId) {
        if (!turn.done && !turn.transcript) {
          turn.transcript = true;
          turn.startedAt = timestamp;
          this.scheduleWorking(turn);
        }
        return;
      }
      if (!turn.done && !turn.transcript && !turn.turnId) {
        turn.turnId = turnId;
        turn.transcript = true;
        turn.startedAt = timestamp;
        this.scheduleWorking(turn);
      } else this.start(thread, timestamp, turnId, true);
      return;
    }
    if (!this.matches(turn, timestamp, turnId)) return;
    if (turnId) turn.turnId = turnId;
    if (event === 'final') this.finish(turn, timestamp);
    if (event === 'interrupted') this.cancel(turn, 'interrupted', timestamp);
    if (event === 'edit') this.edited(thread, timestamp, turnId);
  }
  line(line) {
    if (this.disposed) return;
    const field = name => line.match(new RegExp('(?:^|\\s)' + name + '=([^\\s]+)'))?.[1];
    const thread = field('conversationId') || field('threadId');
    const turnId = field('turnId');
    const timestamp = Date.parse(line.slice(0, 23));
    if (line.includes('Reasoning summary turn-start config resolved') && thread) {
      this.start(thread, timestamp, turnId);
      return;
    }
    const turn = this.turns.get(thread);
    if (line.includes('Reasoning summary item completed') && turn && !turn.done &&
        (!turn.turnId || turn.turnId === turnId)) {
      if (turnId) turn.turnId = turnId;
    }
    if (line.includes('Request failed') && field('method') === 'turn/start') this.cancel(turn);
    // These are host lifecycle failures, not recoverable streaming retries or
    // unrelated tool/server errors. The latter must not finish an active turn.
    if (/\[CodexMcpConnection\].*(?:Codex process (?:fatal error|error)|Failed to (?:start|spawn) Codex process|Codex app-server (?:process exited|connection closed))/.test(line)) {
      for (const active of this.active()) this.cancel(active);
    }
  }
}

// Read only appended bytes; skip historical records at activation. Rotation,
// truncation, split UTF-8 and split lines are handled independently of parsing.
class CodexLogReader {
  constructor(filename, detector, options = {}) {
    this.filename = filename;
    this.detector = detector;
    this.fs = options.fs || fs;
    this.tailBytes = options.tailBytes;
    this.offset = undefined;
    this.identity = undefined;
    this.decoder = new StringDecoder('utf8');
  }
  async poll() {
    let handle;
    try {
      handle = await this.fs.open(this.filename, 'r');
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      if (this.offset === undefined) {
        this.offset = this.tailBytes === undefined ? stat.size : Math.max(0, stat.size - this.tailBytes);
        this.identity = identity;
        if (this.tailBytes === undefined) return;
        if (this.offset > 0) this.detector.skipFirstLine = true;
      }
      if (identity !== this.identity || stat.size < this.offset) {
        this.detector.reset();
        this.decoder = new StringDecoder('utf8');
        this.offset = 0;
        this.identity = identity;
      }
      // Bound work per poll, without dropping unread records.
      const end = Math.min(stat.size, this.offset + 1024 * 1024);
      while (this.offset < end) {
        const buffer = Buffer.alloc(Math.min(65536, end - this.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        this.detector.inspect(this.decoder.write(buffer.subarray(0, bytesRead)));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (this.identity !== undefined) {
        this.detector.reset();
        this.decoder = new StringDecoder('utf8');
        this.identity = undefined;
        this.offset = 0;
      }
      // Missing at startup is normal. When created later, consume from byte 0.
      if (this.offset === undefined) this.offset = 0;
    } finally { await handle?.close(); }
  }
}
module.exports = { CodexLogDetector, CodexLogReader };
