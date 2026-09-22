'use strict';
class TaskState {
  constructor() { this.sources = new Map(); this.state = 'ready'; }
  reset() {
    if (this.state !== 'done') return false;
    this.state = 'ready';
    return true;
  }
  accept(source, value) {
    if (!value || !['thinking', 'working', 'done', 'cancelled'].includes(value.state) ||
        typeof value.updatedAt !== 'string' || !value.updatedAt.length || value.updatedAt.length > 128) return null;
    const old = this.sources.get(source);
    if (value.state === 'cancelled') {
      this.sources.delete(source);
      this.state = this.activeState() || 'ready';
      return { state: this.state, starts: false, finishes: false };
    }
    if (old?.key === value.updatedAt && old.state === value.state) return null;
    const active = state => state === 'thinking' || state === 'working';
    const starts = active(value.state) && !active(old?.state);
    const finishes = active(old?.state) && value.state === 'done';
    this.sources.set(source, { key: value.updatedAt, state: value.state });
    if (active(value.state) || finishes) this.state = this.activeState() || 'done';
    // Stored Done on first load must not change Ready or trigger a notification.
    return active(value.state) || finishes ? { state: this.state, starts, finishes } : null;
  }
  activeState() {
    const sources = [...this.sources.values()];
    return sources.some(s => s.state === 'working') ? 'working' :
      sources.some(s => s.state === 'thinking') ? 'thinking' : undefined;
  }
}
module.exports = { TaskState };
