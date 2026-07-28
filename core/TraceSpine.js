'use strict';

const TRACE_EVENT_MAX_BUFFERED_BYTES_LIMIT = 16777216;
const TRACE_EVENT_MAX_ARRAY_ITEMS = 100;
const TRACE_EVENT_MAX_OBJECT_KEYS = 100;
const TRACE_SCOPE_KEYS = ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'scopeKey'];
const TRACE_REQUIRED_SCOPE_KEYS = ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode'];

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
  if (value instanceof Date) {
    return JSON.stringify(Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString());
  }
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return JSON.stringify('[unserializable]');
  }
}

function sanitizeTracePayload(value, depth = 0, seen = new WeakSet()) {
  try {
    return sanitizeTracePayloadUnsafe(value, depth, seen);
  } catch (_err) {
    return '[unserializable]';
  }
}

function sanitizeTracePayloadUnsafe(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString();
  if (typeof value !== 'object') return String(value);

  if (seen.has(value)) return '[circular]';
  if (depth >= 5) return '[depth-limit]';
  seen.add(value);

  if (Array.isArray(value)) {
    const out = [];
    const maxIndex = Math.min(value.length, TRACE_EVENT_MAX_ARRAY_ITEMS);
    for (let index = 0; index < maxIndex; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      const item = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : '[accessor]';
      const sanitized = sanitizeTracePayload(item, depth + 1, seen);
      if (sanitized !== undefined) out.push(sanitized);
    }
    return out;
  }

  const out = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, TRACE_EVENT_MAX_OBJECT_KEYS)) {
    const item = Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : '[accessor]';
    const sanitized = sanitizeTracePayload(item, depth + 1, seen);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function warnTraceOnce(ctx, flagName, message) {
  try {
    if (ctx && ctx[flagName]) return;
    if (ctx) ctx[flagName] = true;
  } catch (_err) {
    // A frozen/proxied ctx must not make observability throw into trade flow.
  }
  console.warn(message);
}

function safeTraceEntries(ctx, fields) {
  try {
    return Object.entries(fields || {});
  } catch (err) {
    warnTraceOnce(ctx, '_traceFieldRenderWarned', `[EVAL-TRACE] trace fields render failed: ${err.message}`);
    return [];
  }
}

function coerceTraceFields(ctx, fields) {
  const sanitizedFields = sanitizeTracePayload(fields);
  if (sanitizedFields && typeof sanitizedFields === 'object' && !Array.isArray(sanitizedFields)) {
    return stampTraceScope(ctx, sanitizedFields);
  }
  if (sanitizedFields !== undefined) {
    warnTraceOnce(ctx, '_tracePayloadSanitizeWarned', '[EVAL-TRACE] trace_event payload sanitize failed: fields were not object-serializable');
  }
  return stampTraceScope(ctx, {});
}

function traceFieldValue(record, key) {
  if (!record || typeof record !== 'object') return null;
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function firstTraceScopeField(payloadFields, key) {
  const direct = traceFieldValue(payloadFields, key);
  if (direct !== null) return direct;

  const scope = payloadFields.scope;
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    return traceFieldValue(scope, key);
  }

  return null;
}

function readRunnerTraceScope(ctx) {
  const runner = ctx && ctx.runner;
  if (!runner || typeof runner.getCandleScopeEnvelope !== 'function') return {};
  try {
    const ctxTimeframe = typeof ctx?.candleTimeframe === 'string' && ctx.candleTimeframe.trim() !== ''
      ? ctx.candleTimeframe.trim()
      : null;
    const scope = runner.getCandleScopeEnvelope({ timeframe: ctxTimeframe });
    if (scope && typeof scope === 'object' && !Array.isArray(scope)) return scope;
  } catch (err) {
    warnTraceOnce(ctx, '_traceScopeEnvelopeWarned', `[EVAL-TRACE] trace scope envelope read failed: ${err.message}`);
  }
  return {};
}

function currentTraceScope(ctx) {
  const cfg = (ctx && ctx.config) || {};
  const runnerScope = readRunnerTraceScope(ctx);
  const routerEnabled = ctx?.runner && typeof ctx.runner.isSessionRoutingActive === 'function'
    ? ctx.runner.isSessionRoutingActive() === true
    : ctx?.runner?.sessionRouter?.enabled === true;
  const configScopeAllowed = !routerEnabled;

  return {
    symbol: traceFieldValue(runnerScope, 'symbol')
      || traceFieldValue(ctx?.marketData, 'symbol')
      || null,
    timeframe: traceFieldValue(runnerScope, 'timeframe')
      || (configScopeAllowed ? (traceFieldValue(cfg, 'timeframe') || traceFieldValue(ctx, 'candleTimeframe')) : null),
    brokerId: traceFieldValue(runnerScope, 'brokerId')
      || (configScopeAllowed ? traceFieldValue(cfg, 'brokerId') : null),
    accountId: traceFieldValue(runnerScope, 'accountId')
      || traceFieldValue(cfg, 'accountId'),
    assetClass: traceFieldValue(runnerScope, 'assetClass')
      || (configScopeAllowed ? traceFieldValue(cfg, 'assetClass') : null),
    executionMode: cfg.enableBacktestMode === true
      ? 'backtest'
      : (traceFieldValue(runnerScope, 'executionMode')
        || (configScopeAllowed ? traceFieldValue(cfg, 'executionMode') : null)),
    scopeKey: traceFieldValue(runnerScope, 'scopeKey')
      || (configScopeAllowed ? traceFieldValue(cfg, 'scopeKey') : null),
  };
}

function stampTraceScope(ctx, fields) {
  const out = { ...fields };
  const scope = currentTraceScope(ctx);
  for (const key of TRACE_SCOPE_KEYS) {
    if (firstTraceScopeField(out, key) === null && scope[key] !== null) {
      out[key] = scope[key];
    }
  }
  const routerEnabled = ctx?.runner && typeof ctx.runner.isSessionRoutingActive === 'function'
    ? ctx.runner.isSessionRoutingActive() === true
    : ctx?.runner?.sessionRouter?.enabled === true;
  if (routerEnabled) {
    const missingScopeFields = TRACE_REQUIRED_SCOPE_KEYS.filter(key => firstTraceScopeField(out, key) === null);
    if (missingScopeFields.length > 0) {
      out.scopeStatus = out.scopeStatus || 'missing_runtime_scope';
      out.missingScopeFields = out.missingScopeFields || missingScopeFields;
    }
  }
  return out;
}

function resolveTraceEventMaxBufferedBytes(ctx) {
  const value = ctx?.config?.traceEventMaxBufferedBytes;
  if (Number.isFinite(value) && value > 0 && value <= TRACE_EVENT_MAX_BUFFERED_BYTES_LIMIT) {
    return value;
  }
  warnTraceOnce(
    ctx,
    '_traceEventBackpressureConfigWarned',
    `[EVAL-TRACE] trace_event dashboard send skipped: invalid traceEventMaxBufferedBytes ${renderTraceValue(value)}`
  );
  return null;
}

function emitTraceEventToDashboard(ctx, event, fields, fieldsCoerced = false) {
  try {
    emitTraceEventToDashboardUnsafe(ctx, event, fields, fieldsCoerced);
  } catch (err) {
    warnTraceOnce(ctx, '_traceEventUnexpectedWarned', `[EVAL-TRACE] trace_event dashboard emit failed: ${err.message}`);
  }
}

function emitTraceEventToDashboardUnsafe(ctx, event, fields, fieldsCoerced = false) {
  const ws = ctx && ctx.dashboardWs;
  if (!ws || ws.readyState !== 1 || typeof ws.send !== 'function') return;

  const maxBufferedBytes = resolveTraceEventMaxBufferedBytes(ctx);
  if (maxBufferedBytes === null) return;

  if (
    typeof ws.bufferedAmount !== 'number'
    || !Number.isFinite(ws.bufferedAmount)
  ) {
    warnTraceOnce(
      ctx,
      '_traceEventBackpressureUnknownWarned',
      `[EVAL-TRACE] trace_event dashboard send skipped: invalid bufferedAmount ${renderTraceValue(ws.bufferedAmount)}`
    );
    return;
  }

  if (ws.bufferedAmount > maxBufferedBytes) {
    warnTraceOnce(
      ctx,
      '_traceEventBackpressureWarned',
      `[EVAL-TRACE] trace_event dashboard send skipped: bufferedAmount ${ws.bufferedAmount} > ${maxBufferedBytes}`
    );
    return;
  }

  const payloadFields = fieldsCoerced ? fields : coerceTraceFields(ctx, fields);

  const payload = {
    type: 'trace_event',
    timestamp: Date.now(),
    event,
    traceId: payloadFields.traceId || null,
    signalId: payloadFields.signalId || null,
    decisionId: payloadFields.decisionId || null,
    symbol: firstTraceScopeField(payloadFields, 'symbol'),
    timeframe: firstTraceScopeField(payloadFields, 'timeframe'),
    brokerId: firstTraceScopeField(payloadFields, 'brokerId'),
    accountId: firstTraceScopeField(payloadFields, 'accountId'),
    assetClass: firstTraceScopeField(payloadFields, 'assetClass'),
    executionMode: firstTraceScopeField(payloadFields, 'executionMode'),
    scopeKey: firstTraceScopeField(payloadFields, 'scopeKey'),
    action: payloadFields.action || null,
    positionEffect: traceFieldValue(payloadFields, 'positionEffect'),
    fields: payloadFields,
  };

  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    warnTraceOnce(ctx, '_traceEventSendWarned', `[EVAL-TRACE] trace_event dashboard send failed: ${err.message}`);
  }
}

function emitTrace(ctx, event, fields = {}) {
  if (!isTraceEnabled(ctx)) return;
  const traceFields = coerceTraceFields(ctx, fields);
  const parts = safeTraceEntries(ctx, traceFields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${renderTraceValue(value)}`);
  console.log(`[EVAL-TRACE][${event}] ${parts.join(' ')}`);
  emitTraceEventToDashboard(ctx, event, traceFields, true);
}

module.exports = {
  createTraceId,
  emitTrace,
  isTraceEnabled,
  sanitizeTracePayload,
};
