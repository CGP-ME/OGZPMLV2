'use strict';

function createTraceId(prefix = 'trace', now = () => Date.now()) {
  const safePrefix = String(prefix || 'trace').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ts = Number(now());
  const stamp = Number.isFinite(ts) ? ts : Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${safePrefix}_${stamp}_${suffix}`;
}

function isTraceEnabled(ctx = {}) {
  const config = ctx.config || {};
  if (config.evalTraceEnabled !== true) return false;

  const isBacktest = ctx.backtestMode === true
    || config.enableBacktestMode === true
    || config.executionMode === 'backtest';
  if (isBacktest && config.evalTraceBacktest !== true) return false;

  return true;
}

function renderTraceValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return JSON.stringify('[unserializable]');
  }
}

function emitTrace(ctx, event, fields = {}) {
  if (!isTraceEnabled(ctx)) return;
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${renderTraceValue(value)}`);
  console.log(`[EVAL-TRACE][${event}] ${parts.join(' ')}`);
}

module.exports = {
  createTraceId,
  emitTrace,
  isTraceEnabled,
};
