'use strict';
class TaskState {
  constructor() { this.sources = new Map(); this.state = 'ready'; }
  reset() {
    if (this.state !== 'done') return false;
    this.state = 'ready';
    return true;
  }
  accept(source, value) {
    if (!value || !['working', 'done'].includes(value.state) ||
        typeof value.updatedAt !== 'string' || !value.updatedAt.length || value.updatedAt.length > 128) return null;
    const old = this.sources.get(source);
    if (old?.key === value.updatedAt && old.state === value.state) return null;
    const starts = value.state === 'working' && (old?.state !== 'working' || old.key !== value.updatedAt);
    const finishes = old?.state === 'working' && value.state === 'done';
    this.sources.set(source, { key: value.updatedAt, state: value.state });
    if (starts) this.state = 'working';
    if (finishes) this.state = [...this.sources.values()].some(s => s.state === 'working') ? 'working' : 'done';
    // Stored Done on first load must not change Ready or trigger a notification.
    return starts || finishes ? { state: this.state, starts, finishes } : null;
  }
}
module.exports = { TaskState };
