'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE_NAME = 'fatal-events.jsonl';
const MAX_SANITIZE_DEPTH = 5;
const MAX_SANITIZE_ITEMS = 100;
const ACCESSOR_PLACEHOLDER = '[accessor]';
const UNAVAILABLE_VALUE = '[unavailable]';
const AUDIT_SCOPE_PLACEHOLDER_VALUES = new Set([
  'unknown',
  'undefined',
  'unclassified',
  'null',
  'none',
  'n/a',
  'na'
]);
const SENSITIVE_FIELD_PATTERN_SOURCE = '(?:authorization|cookie|credential|dsn|password|passwd|secret|token|api[_-]?key|private[_-]?key|webhook[_-]?url|deadman[_-]?url|capability|ntfy[_-]?topic)';
const SENSITIVE_KEY_PATTERN = new RegExp(SENSITIVE_FIELD_PATTERN_SOURCE, 'i');
const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'`<>]+/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN = new RegExp(
  `((?:["']?)[A-Za-z0-9_.-]*${SENSITIVE_FIELD_PATTERN_SOURCE}[A-Za-z0-9_.-]*(?:["']?)\\s*[:=]\\s*)`
    + '(?:"(?:\\\\.|[^"])*"|\'(?:\\\\.|[^\'])*\'|[^\\s,;}\\]]+)',
  'gi'
);

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
    const serialized = JSON.stringify(value);
    if (typeof serialized === 'string') return serialized;
  } catch (_err) {
    // Continue to the non-executing type label below.
  }
  try {
    return Object.prototype.toString.call(value);
  } catch (_err) {
    return UNAVAILABLE_VALUE;
  }
}

function safeDataProperty(value, key, includePrototype = false) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return { found: false, value: undefined };
  }

  let current = value;
  for (let level = 0; current && level < 10; level += 1) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch (_err) {
      return { found: true, value: UNAVAILABLE_VALUE };
    }
    if (descriptor) {
      return Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? { found: true, value: descriptor.value }
        : { found: true, value: ACCESSOR_PLACEHOLDER };
    }
    if (!includePrototype) break;
    try {
      current = Object.getPrototypeOf(current);
    } catch (_err) {
      return { found: true, value: UNAVAILABLE_VALUE };
    }
  }
  return { found: false, value: undefined };
}

function isErrorInstance(value) {
  try {
    return value instanceof Error;
  } catch (_err) {
    return false;
  }
}

function ownPropertyDescriptors(value) {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch (_err) {
    return null;
  }
}

function collectSensitiveValues(env = {}) {
  const descriptors = ownPropertyDescriptors(env);
  if (!descriptors) return [];
  return Object.entries(descriptors)
    .filter(([key, descriptor]) => (
      SENSITIVE_KEY_PATTERN.test(key)
      && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && typeof descriptor.value === 'string'
      && descriptor.value.length > 0
    ))
    .map(([, descriptor]) => descriptor.value)
    .sort((left, right) => right.length - left.length);
}

function redactText(value, env = {}) {
  let redacted = typeof value === 'string' ? value : safeString(value);
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
  let isDate = false;
  try {
    isDate = value instanceof Date;
  } catch (_err) {
    isDate = false;
  }
  if (isDate) {
    try {
      return Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString();
    } catch (_err) {
      return '[invalid-date]';
    }
  }
  if (isErrorInstance(value)) {
    return normalizeThrowable(value, env, depth, seen);
  }
  if (typeof value === 'symbol') return '[symbol]';
  if (typeof value === 'function') return '[function]';
  if (typeof value !== 'object') return redactText(safeString(value), env);
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_SANITIZE_DEPTH) return '[depth-limit]';

  seen.add(value);
  const descriptors = ownPropertyDescriptors(value);
  if (!descriptors) return UNAVAILABLE_VALUE;

  let isArray = false;
  try {
    isArray = Array.isArray(value);
  } catch (_err) {
    isArray = false;
  }
  if (isArray) {
    return Object.entries(descriptors)
      .filter(([key]) => /^(?:0|[1-9]\d*)$/.test(key))
      .sort(([left], [right]) => Number(left) - Number(right))
      .slice(0, MAX_SANITIZE_ITEMS)
      .map(([key, descriptor]) => {
        const item = Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ? descriptor.value
          : ACCESSOR_PLACEHOLDER;
        return sanitizeValue(item, depth + 1, seen, env, key);
      });
  }

  const out = {};
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, MAX_SANITIZE_ITEMS)) {
    const item = Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : ACCESSOR_PLACEHOLDER;
    const sanitized = sanitizeValue(item, depth + 1, seen, env, key);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function cleanAuditScopeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return safeString(value);
    }
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (AUDIT_SCOPE_PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function normalizeThrowable(input, env = {}, depth = 0, seen = new WeakSet()) {
  if (isErrorInstance(input)) {
    if (seen.has(input)) {
      return {
        name: 'Error',
        message: '[circular-error]',
        stack: null,
        code: null,
        cause: null,
        raw: null,
      };
    }
    if (depth >= MAX_SANITIZE_DEPTH) {
      return {
        name: 'Error',
        message: '[depth-limit]',
        stack: null,
        code: null,
        cause: null,
        raw: null,
      };
    }
    seen.add(input);
    const nameProperty = safeDataProperty(input, 'name', true);
    const messageProperty = safeDataProperty(input, 'message', true);
    const stackProperty = safeDataProperty(input, 'stack', true);
    const codeProperty = safeDataProperty(input, 'code', true);
    const causeProperty = safeDataProperty(input, 'cause', false);
    return {
      name: redactText(nameProperty.found ? nameProperty.value : 'Error', env),
      message: redactText(messageProperty.found ? messageProperty.value : '', env),
      stack: stackProperty.found
        && typeof stackProperty.value === 'string'
        && stackProperty.value !== ACCESSOR_PLACEHOLDER
        && stackProperty.value !== UNAVAILABLE_VALUE
        ? redactText(stackProperty.value, env)
        : null,
      code: codeProperty.found && codeProperty.value !== undefined && codeProperty.value !== null
        ? redactText(codeProperty.value, env)
        : null,
      cause: causeProperty.found && causeProperty.value !== undefined && depth < 4
        ? normalizeThrowable(causeProperty.value, env, depth + 1, seen)
        : null,
      raw: null,
    };
  }

  const raw = sanitizeValue(input, depth, seen, env);
  const rawObject = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  return {
    name: Array.isArray(raw) ? 'Array' : typeof input,
    message: redactText(safeString(raw), env),
    stack: rawObject && typeof rawObject.stack === 'string'
      ? rawObject.stack
      : null,
    code: rawObject && rawObject.code !== undefined && rawObject.code !== null
      ? redactText(rawObject.code, env)
      : null,
    cause: null,
    raw,
  };
}

function normalizeThrowableSafely(input, env = {}) {
  try {
    return normalizeThrowable(input, env);
  } catch (_err) {
    return {
      name: 'Error',
      message: '[unavailable diagnostic]',
      stack: null,
      code: null,
      cause: null,
      raw: null,
    };
  }
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
    this.env = Object.prototype.hasOwnProperty.call(options, 'env')
      ? options.env
      : process.env;
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
    const throwable = normalizeThrowableSafely(input, env);
    const sanitizedContext = sanitizeValue(context, 0, new WeakSet(), env);
    const safeContext = sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext)
      ? sanitizedContext
      : {};
    const envValue = (key) => {
      const property = safeDataProperty(env, key, false);
      return property.found ? sanitizeValue(property.value, 0, new WeakSet(), env, key) : null;
    };

    return {
      timestamp: isoTimestamp(this.clock),
      eventType: redactText(eventType || 'runtimeFatal', env),
      message: throwable.message,
      name: throwable.name,
      stack: throwable.stack,
      code: throwable.code,
      cause: throwable.cause,
      raw: throwable.raw,
      processRole: cleanAuditScopeValue(safeContext.processRole) || this.processRole,
      phase: cleanAuditScopeValue(safeContext.phase) || this.phase,
      sourceReceiptId: cleanAuditScopeValue(safeContext.sourceReceiptId) || this.sourceReceiptId,
      runtimeScope: cleanAuditScopeValue(safeContext.runtimeScope),
      configFingerprint: cleanAuditScopeValue(safeContext.configFingerprint),
      scope: {
        executionMode: cleanAuditScopeValue(safeContext.executionMode),
        brokerId: cleanAuditScopeValue(safeContext.brokerId),
        accountId: cleanAuditScopeValue(safeContext.accountId),
        assetClass: cleanAuditScopeValue(safeContext.assetClass),
        symbol: cleanAuditScopeValue(safeContext.symbol),
        timeframe: cleanAuditScopeValue(safeContext.timeframe),
        scopeKey: cleanAuditScopeValue(safeContext.scopeKey),
      },
      env: {
        pid: this.pid,
        nodeVersion: this.nodeVersion,
        pm2Id: envValue('pm_id') || envValue('PM2_ID'),
        pm2Name: envValue('name') || envValue('pm2_name') || envValue('PM2_NAME'),
        nodeAppInstance: envValue('NODE_APP_INSTANCE'),
        cwd: this.cwd,
      },
      context: safeContext.extra || {},
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
    try {
      const env = this.env || {};
      if (isErrorInstance(value)) {
        const throwable = normalizeThrowableSafely(value, env);
        return throwable.stack || throwable.message || throwable.name || '[unavailable diagnostic]';
      }
      return redactText(safeString(sanitizeValue(value, 0, new WeakSet(), env)), env);
    } catch (_err) {
      return '[unavailable diagnostic]';
    }
  }

  capture(eventType, input, context = {}) {
    let record = null;
    try {
      record = this.buildRecord(eventType, input, context);
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
      return { success: true, filePath: this.filePath, record };
    } catch (err) {
      this.writeFailureFallback(eventType, input, err, context, record);
      const sinkError = normalizeThrowableSafely(err, this.env || {});
      return {
        success: false,
        filePath: this.filePath,
        record,
        error: sinkError.message,
      };
    }
  }

  writeFailureFallback(eventType, input, err, context = {}, record = null) {
    try {
      const env = this.env || {};
      const throwable = record || normalizeThrowableSafely(input, env);
      const sinkError = normalizeThrowableSafely(err, env);
      const sanitizedContext = sanitizeValue(context, 0, new WeakSet(), env);
      const safeContext = sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext)
        ? sanitizedContext
        : {};
      const fallback = {
        timestamp: isoTimestamp(this.clock),
        eventType: record?.eventType || redactText(eventType || 'runtimeFatal', env),
        auditSinkFailure: true,
        auditFilePath: redactText(this.filePath, env),
        auditError: sinkError.message,
        message: throwable.message,
        name: throwable.name,
        code: throwable.code,
        cause: throwable.cause,
        processRole: record?.processRole || cleanAuditScopeValue(safeContext.processRole) || this.processRole,
        phase: record?.phase || cleanAuditScopeValue(safeContext.phase) || this.phase,
        sourceReceiptId: record?.sourceReceiptId
          || cleanAuditScopeValue(safeContext.sourceReceiptId)
          || this.sourceReceiptId,
        runtimeScope: record?.runtimeScope || cleanAuditScopeValue(safeContext.runtimeScope),
        pid: this.pid,
      };
      fs.writeSync(this.stderrFd, `[FATAL-AUDIT-FAILED] ${JSON.stringify(fallback)}\n`);
    } catch (_fallbackErr) {
      // Nothing else is safe to do in a fatal-path failure.
    }
  }
}

module.exports = RuntimeAuditSink;
