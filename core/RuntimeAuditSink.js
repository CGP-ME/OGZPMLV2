'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE_NAME = 'fatal-events.jsonl';

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

function sanitizeValue(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[invalid-date]' : value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || '',
      stack: value.stack || null,
    };
  }
  if (typeof value !== 'object') return safeString(value);
  if (seen.has(value)) return '[circular]';
  if (depth >= 5) return '[depth-limit]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1, seen));
  }

  const out = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, 100)) {
    const item = Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : '[accessor]';
    const sanitized = sanitizeValue(item, depth + 1, seen);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function normalizeThrowable(input) {
  if (input instanceof Error) {
    return {
      name: input.name || 'Error',
      message: input.message || '',
      stack: input.stack || null,
      raw: null,
    };
  }

  return {
    name: input && input.constructor && input.constructor.name ? input.constructor.name : typeof input,
    message: safeString(input),
    stack: input && typeof input === 'object' && typeof input.stack === 'string' ? input.stack : null,
    raw: sanitizeValue(input),
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
  }

  buildRecord(eventType, input, context = {}) {
    const throwable = normalizeThrowable(input);
    const env = this.env || {};

    return {
      timestamp: isoTimestamp(this.clock),
      eventType: String(eventType || 'runtimeFatal'),
      message: throwable.message,
      name: throwable.name,
      stack: throwable.stack,
      raw: throwable.raw,
      runtimeScope: context.runtimeScope || 'unknown',
      configFingerprint: context.configFingerprint || null,
      scope: {
        executionMode: context.executionMode || null,
        brokerId: context.brokerId || null,
        accountId: context.accountId || null,
        assetClass: context.assetClass || null,
        symbol: context.symbol || null,
        timeframe: context.timeframe || null,
        scopeKey: context.scopeKey || null,
      },
      env: {
        pid: this.pid,
        nodeVersion: this.nodeVersion,
        pm2Id: env.pm_id || env.PM2_ID || null,
        pm2Name: env.name || env.pm2_name || env.PM2_NAME || null,
        nodeAppInstance: env.NODE_APP_INSTANCE || null,
        cwd: this.cwd,
      },
      context: sanitizeValue(context.extra || {}),
    };
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
        error: err && err.message ? err.message : safeString(err),
      };
    }
  }

  writeFailureFallback(eventType, input, err) {
    try {
      const throwable = normalizeThrowable(input);
      const fallback = {
        timestamp: isoTimestamp(this.clock),
        eventType: String(eventType || 'runtimeFatal'),
        auditSinkFailure: true,
        auditFilePath: this.filePath,
        auditError: err && err.message ? err.message : safeString(err),
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
