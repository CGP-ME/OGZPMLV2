'use strict';

const DEFAULT_DASHBOARD_DEPTH_MIN_INTERVAL_MS = 1000;

function resolveDashboardDepthMinIntervalMs(rawValue = process.env.DASHBOARD_DEPTH_MIN_INTERVAL_MS) {
  if (rawValue == null || rawValue === '') return DEFAULT_DASHBOARD_DEPTH_MIN_INTERVAL_MS;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`[DashboardDepth] DASHBOARD_DEPTH_MIN_INTERVAL_MS must be a positive integer millisecond value, received ${String(rawValue)}`);
  }

  return parsed;
}

class DashboardDepthCoalescer {
  constructor({
    minIntervalMs = DEFAULT_DASHBOARD_DEPTH_MIN_INTERVAL_MS,
    sendFrame,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 1) {
      throw new Error(`[DashboardDepth] minIntervalMs must be a positive integer, received ${String(minIntervalMs)}`);
    }
    if (typeof sendFrame !== 'function') {
      throw new Error('[DashboardDepth] DashboardDepthCoalescer requires sendFrame');
    }

    this.minIntervalMs = minIntervalMs;
    this.sendFrame = sendFrame;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.lastSentAt = new Map();
    this.lastGlobalSentAt = 0;
    this.pending = new Map();
    this.timers = new Map();
  }

  queue(symbol, frame, canSend = () => true) {
    if (!symbol || !frame || frame.type !== 'depth_update') return false;
    if (typeof canSend !== 'function' || !canSend()) return false;

    const now = Number(this.now());
    const lastSentAt = this.lastSentAt.get(symbol) || 0;
    const waitMs = this._waitMs(now, lastSentAt);

    if (waitMs === 0) {
      this._clearTimer(symbol);
      this.pending.delete(symbol);
      return this._send(symbol, frame, now, canSend);
    }

    this.pending.set(symbol, { frame, canSend });
    if (!this.timers.has(symbol)) {
      this._schedule(symbol, waitMs);
    }

    return false;
  }

  clear() {
    for (const timer of this.timers.values()) {
      this.clearTimer(timer);
    }
    this.timers.clear();
    this.pending.clear();
    this.lastSentAt.clear();
    this.lastGlobalSentAt = 0;
  }

  _waitMs(now, lastSentAt) {
    const symbolWaitMs = Math.max(0, this.minIntervalMs - (now - lastSentAt));
    const globalWaitMs = Math.max(0, this.minIntervalMs - (now - this.lastGlobalSentAt));
    return Math.max(symbolWaitMs, globalWaitMs);
  }

  _schedule(symbol, waitMs) {
    const timer = this.setTimer(() => {
      this.timers.delete(symbol);
      const pending = this.pending.get(symbol);
      if (!pending) return;

      const now = Number(this.now());
      const lastSentAt = this.lastSentAt.get(symbol) || 0;
      const nextWaitMs = this._waitMs(now, lastSentAt);
      if (nextWaitMs > 0) {
        this._schedule(symbol, nextWaitMs);
        return;
      }

      this.pending.delete(symbol);
      this._send(symbol, pending.frame, now, pending.canSend);
    }, Math.max(1, waitMs));
    if (timer && typeof timer.unref === 'function') timer.unref();
    this.timers.set(symbol, timer);
  }

  _clearTimer(symbol) {
    const timer = this.timers.get(symbol);
    if (!timer) return;
    this.clearTimer(timer);
    this.timers.delete(symbol);
  }

  _send(symbol, frame, sentAt, canSend) {
    if (typeof canSend === 'function' && !canSend()) return false;
    if (this.sendFrame(symbol, frame, sentAt) !== true) return false;
    this.lastSentAt.set(symbol, sentAt);
    this.lastGlobalSentAt = sentAt;
    return true;
  }
}

module.exports = {
  DEFAULT_DASHBOARD_DEPTH_MIN_INTERVAL_MS,
  DashboardDepthCoalescer,
  resolveDashboardDepthMinIntervalMs,
};
