'use strict';
const fs = require('node:fs/promises');
const { StringDecoder } = require('node:string_decoder');

// Codex.log is a private format. Only interpret known markers, never log content
// or arbitrary assistant text. Unidentified broadcasts are ambiguous with >1 turn.
class CodexLogDetector {
  constructor(emit, options = {}) {
    this.emit = emit;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.heuristic = options.heuristic !== false;
    this.minimumMs = options.minimumMs ?? 0;
    this.now = options.now || Date.now;
    this.turns = new Map();
    this.sequence = 0;
    this.reset();
  }
  reset() {
    for (const turn of this.turns.values()) {
      this.clearTimer(turn.timer);
      this.clearTimer(turn.activationTimer);
      if (!turn.done && turn.visible) this.emit(turn.thread, { state: 'cancelled', updatedAt: turn.key + ':reset' });
    }
    this.turns.clear();
    this.partial = '';
  }
  dispose() { this.reset(); this.disposed = true; }
  inspect(chunk) {
    if (this.disposed) return;
    this.partial += chunk;
    const lines = this.partial.split(/\r?\n/);
    this.partial = lines.pop();
    // A corrupt or unexpectedly huge line must not grow memory indefinitely.
    if (this.partial.length > 1024 * 1024) this.partial = '';
    for (const line of lines) this.line(line);
  }
  active() { return [...this.turns.values()].filter(turn => !turn.done); }
  showWorking(turn) {
    if (this.disposed || turn.visible || turn.done) return;
    turn.visible = true;
    this.clearTimer(turn.activationTimer);
    this.emit(turn.thread, { state: 'working', updatedAt: turn.key + ':start' });
  }
  scheduleWorking(turn) {
    this.clearTimer(turn.activationTimer);
    if (turn.visible || turn.done || turn.read) return;
    const remaining = this.minimumMs - (this.now() - turn.activeSince);
    if (remaining <= 0) this.showWorking(turn);
    else turn.activationTimer = this.setTimer(() => this.showWorking(turn), remaining);
  }
  edited(thread, timestamp) {
    const turn = this.turns.get(thread);
    if (!turn || this.disposed || !Number.isFinite(turn.startedAt) || timestamp < turn.startedAt) return;
    if (!turn.visible) {
      // A short edit may have completed before the transcript poll caught it.
      const done = turn.done;
      turn.done = false;
      this.showWorking(turn);
      if (done) this.finish(turn);
    }
  }
  finish(turn) {
    if (!turn || turn.done) return;
    turn.done = true;
    this.clearTimer(turn.timer);
    this.clearTimer(turn.activationTimer);
    if (turn.visible) this.emit(turn.thread, { state: 'done', updatedAt: turn.key + ':done' });
  }
  line(line) {
    const field = name => line.match(new RegExp('(?:^|\\s)' + name + '=([^\\s]+)'))?.[1];
    const thread = field('conversationId') || field('threadId');
    const turnId = field('turnId');
    if (line.includes('Reasoning summary turn-start config resolved') && thread) {
      const previous = this.turns.get(thread);
      // Preserve a just-finished chat turn even if the next turn starts before
      // its quiet timer fires. No global time-based suppression of completions.
      if (previous && !previous.done) {
        if (previous.read && this.heuristic) this.finish(previous);
        else {
          this.clearTimer(previous.timer);
          this.clearTimer(previous.activationTimer);
          if (previous.visible) this.emit(previous.thread, { state: 'cancelled', updatedAt: previous.key + ':superseded' });
        }
      }
      const turn = { key: 'log:' + (++this.sequence), thread, turnId, done: false, read: false, items: new Set(),
        visible: false, startedAt: Date.parse(line.slice(0, 23)), activeSince: this.now() };
      this.turns.set(thread, turn);
      this.scheduleWorking(turn);
      return;
    }
    let turn = thread ? this.turns.get(thread) : undefined;
    if (turnId && turn?.turnId && turn.turnId !== turnId) return;
    if (line.includes('Reasoning summary item completed')) {
      if (!turn) return;
      const itemId = field('itemId');
      if (itemId && turn.items.has(itemId)) return;
      if (itemId) turn.items.add(itemId);
      if (turnId) turn.turnId = turnId;
      // Further reasoning invalidates the earlier read-state hint; quiet alone
      // is not proof of completion, particularly during a long tool execution.
      turn.read = false;
      this.clearTimer(turn.timer);
      // A read-state pause can mean an approval prompt, not the end of work.
      // New reasoning in this same turn reopens it and permits another alert.
      if (turn.done) {
        turn.done = false;
        turn.key = 'log:' + (++this.sequence);
        turn.activeSince = this.now();
        if (turn.visible) this.emit(turn.thread, { state: 'working', updatedAt: turn.key + ':resume' });
      }
      this.scheduleWorking(turn);
      return;
    }
    const read = line.includes('method=thread-read-state-changed');
    const strong = line.includes('requestKind=turn-diff-capture-complete');
    if (!read && !strong) return;
    if (!thread) {
      const active = this.active();
      if (active.length !== 1) return;
      turn = active[0];
    }
    if (!turn || turn.done) return;
    if (strong) {
      // Git capture logs can arrive late and contain multiple commands. Without
      // an exact turn ID, require the current turn's read-state hint first.
      if ((turnId && turn.turnId === turnId) || turn.read) this.finish(turn);
      return;
    }
    turn.read = true;
    this.clearTimer(turn.activationTimer);
    this.clearTimer(turn.timer);
    if (this.heuristic) turn.timer = this.setTimer(() => this.finish(turn), 3000);
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
      // Missing at startup is normal. When created later, consume from byte 0.
      if (this.offset === undefined) this.offset = 0;
    } finally { await handle?.close(); }
  }
}
module.exports = { CodexLogDetector, CodexLogReader };
