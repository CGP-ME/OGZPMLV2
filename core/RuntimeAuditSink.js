'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE_NAME = 'fatal-events.jsonl';
const AUDIT_SCOPE_PLACEHOLDER_VALUES = new Set([
  'unknown',
  'undefined',
  'unclassified',
  'null',
  'none',
  'n/a',
  'na'
]);
const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|credential|dsn|password|passwd|secret|token|api[_-]?key|private[_-]?key|webhook[_-]?url|deadman[_-]?url|capability)/i;
const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'`<>]+/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN = /\b((?:authorization|cookie|credential|dsn|password|passwd|secret|token|api[_-]?key|private[_-]?key|webhook[_-]?url|deadman[_-]?url|capability)[A-Za-z0-9_-]*\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

function defaultAuditFilePath(cwd = process.cwd()) {
  return path.resolve(cwd, 'data', 'runtime-audit', DEFAULT_FILE_NAME);
}

function isoTimestamp(clock) {
  try {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  } catch (_err) {
    // Fatal audit must not throw while the process is already failing.
  }
  return new Date().toISOString();
}

function safeString(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return Object.prototype.toString.call(value);
  }
}

function collectSensitiveValues(env = {}) {
  return Object.entries(env)
    .filter(([key, value]) => SENSITIVE_KEY_PATTERN.test(key) && typeof value === 'string' && value.length > 0)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

function redactText(value, env = {}) {
  let redacted = String(value ?? '');
  for (const secretValue of collectSensitiveValues(env)) {
    if (redacted.includes(secretValue)) {
      redacted = redacted.split(secretValue).join('[REDACTED]');
    }
  }
  return redacted
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1[REDACTED]')
    .replace(URL_PATTERN, '[REDACTED_URL]');
}

function sanitizeValue(value, depth = 0, seen = new WeakSet(), env = {}, keyHint = '') {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value, env);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString();
  if (value instanceof Error) {
    return normalizeThrowable(value, env, depth, seen);
  }
  if (typeof value !== 'object') return redactText(safeString(value), env);
  if (seen.has(value)) return '[circular]';
  if (depth >= 5) return '[depth-limit]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1, seen, env));
  }

  const out = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, 100)) {
    const item = Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : '[accessor]';
    const sanitized = sanitizeValue(item, depth + 1, seen, env, key);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function cleanAuditScopeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (AUDIT_SCOPE_PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function normalizeThrowable(input, env = {}, depth = 0, seen = new WeakSet()) {
  if (input instanceof Error) {
    if (seen.has(input)) {
      return {
        name: redactText(input.name || 'Error', env),
        message: '[circular-error]',
        stack: null,
        code: null,
        cause: null,
        raw: null,
      };
    }
    seen.add(input);
    return {
      name: redactText(input.name || 'Error', env),
      message: redactText(input.message || '', env),
      stack: input.stack ? redactText(input.stack, env) : null,
      code: input.code ? redactText(input.code, env) : null,
      cause: input.cause !== undefined && depth < 4
        ? normalizeThrowable(input.cause, env, depth + 1, seen)
        : null,
      raw: null,
    };
  }

  return {
    name: redactText(input && input.constructor && input.constructor.name ? input.constructor.name : typeof input, env),
    message: redactText(safeString(sanitizeValue(input, 0, new WeakSet(), env)), env),
    stack: input && typeof input === 'object' && typeof input.stack === 'string'
      ? redactText(input.stack, env)
      : null,
    code: input && typeof input === 'object' && input.code ? redactText(input.code, env) : null,
    cause: null,
    raw: sanitizeValue(input, 0, new WeakSet(), env),
  };
}

function isPathInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveAuditFilePath(options) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const fallback = defaultAuditFilePath(cwd);
  const candidate = options.filePath
    ? path.resolve(options.filePath)
    : (options.dir
      ? path.resolve(options.dir, DEFAULT_FILE_NAME)
      : (options.dataDir
        ? path.resolve(options.dataDir, 'runtime-audit', DEFAULT_FILE_NAME)
        : fallback));

  if (options.allowOutsideRepo === true) return candidate;
  return isPathInside(cwd, candidate) ? candidate : fallback;
}

class RuntimeAuditSink {
  constructor(options = {}) {
    this.filePath = resolveAuditFilePath(options);
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this.env = options.env || process.env;
    this.cwd = options.cwd || process.cwd();
    this.nodeVersion = options.nodeVersion || process.version;
    this.pid = options.pid || process.pid;
    this.stderrFd = Number.isInteger(options.stderrFd) ? options.stderrFd : 2;
    this.processRole = cleanAuditScopeValue(options.processRole);
    this.phase = cleanAuditScopeValue(options.phase) || 'bootstrap';
    this.sourceReceiptId = cleanAuditScopeValue(options.sourceReceiptId)
      || `bootstrap:${this.processRole || 'process'}:${this.pid}:${isoTimestamp(this.clock)}`;
  }

  buildRecord(eventType, input, context = {}) {
    const env = this.env || {};
    const throwable = normalizeThrowable(input, env);

    return {
      timestamp: isoTimestamp(this.clock),
      eventType: String(eventType || 'runtimeFatal'),
      message: throwable.message,
      name: throwable.name,
      stack: throwable.stack,
      code: throwable.code,
      cause: throwable.cause,
      raw: throwable.raw,
      processRole: cleanAuditScopeValue(context.processRole) || this.processRole,
      phase: cleanAuditScopeValue(context.phase) || this.phase,
      sourceReceiptId: cleanAuditScopeValue(context.sourceReceiptId) || this.sourceReceiptId,
      runtimeScope: cleanAuditScopeValue(context.runtimeScope),
      configFingerprint: context.configFingerprint || null,
      scope: {
        executionMode: cleanAuditScopeValue(context.executionMode),
        brokerId: cleanAuditScopeValue(context.brokerId),
        accountId: cleanAuditScopeValue(context.accountId),
        assetClass: cleanAuditScopeValue(context.assetClass),
        symbol: cleanAuditScopeValue(context.symbol),
        timeframe: cleanAuditScopeValue(context.timeframe),
        scopeKey: cleanAuditScopeValue(context.scopeKey),
      },
      env: {
        pid: this.pid,
        nodeVersion: this.nodeVersion,
        pm2Id: env.pm_id || env.PM2_ID || null,
        pm2Name: env.name || env.pm2_name || env.PM2_NAME || null,
        nodeAppInstance: env.NODE_APP_INSTANCE || null,
        cwd: this.cwd,
      },
      context: sanitizeValue(context.extra || {}, 0, new WeakSet(), env),
    };
  }

  setPhase(phase) {
    this.phase = cleanAuditScopeValue(phase) || this.phase;
  }

  setSourceReceiptId(sourceReceiptId) {
    this.sourceReceiptId = cleanAuditScopeValue(sourceReceiptId) || this.sourceReceiptId;
  }

  setDataDir(dataDir) {
    if (!dataDir) return this.filePath;
    try {
      this.filePath = resolveAuditFilePath({ cwd: this.cwd, dataDir });
    } catch (error) {
      this.writeFailureFallback('auditOutputRebindFailed', error, error);
    }
    return this.filePath;
  }

  redactForOutput(value) {
    const env = this.env || {};
    if (value instanceof Error) {
      const throwable = normalizeThrowable(value, env);
      return throwable.stack || throwable.message;
    }
    return redactText(safeString(sanitizeValue(value, 0, new WeakSet(), env)), env);
  }

  capture(eventType, input, context = {}) {
    let record = null;
    try {
      record = this.buildRecord(eventType, input, context);
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
      return { success: true, filePath: this.filePath, record };
    } catch (err) {
      this.writeFailureFallback(eventType, input, err);
      return {
        success: false,
        filePath: this.filePath,
        record,
        error: redactText(err && err.message ? err.message : safeString(err), this.env || {}),
      };
    }
  }

  writeFailureFallback(eventType, input, err) {
    try {
      const env = this.env || {};
      const throwable = normalizeThrowable(input, env);
      const fallback = {
        timestamp: isoTimestamp(this.clock),
        eventType: String(eventType || 'runtimeFatal'),
        auditSinkFailure: true,
        auditFilePath: this.filePath,
        auditError: redactText(err && err.message ? err.message : safeString(err), env),
        message: throwable.message,
        name: throwable.name,
        pid: this.pid,
      };
      fs.writeSync(this.stderrFd, `[FATAL-AUDIT-FAILED] ${JSON.stringify(fallback)}\n`);
    } catch (_fallbackErr) {
      // Nothing else is safe to do in a fatal-path failure.
    }
  }
}

module.exports = RuntimeAuditSink;
