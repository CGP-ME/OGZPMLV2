'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./policy');
const { normalizeSessionId, sessionIdFromHookInput } = require('./hook-input');

const EDIT_LEDGER_PATH = path.join(REPO_ROOT, '.claude', 'session-state', 'edit-ledger.json');
const EDIT_LEDGER_LOCK_PATH = `${EDIT_LEDGER_PATH}.lock`;
const LOCK_WAIT_MS = 2000;

function load() {
  if (!fs.existsSync(EDIT_LEDGER_PATH)) {
    return { edits: [], sessions: {} };
  }
  try {
    const data = JSON.parse(fs.readFileSync(EDIT_LEDGER_PATH, 'utf8'));
    return {
      edits: Array.isArray(data.edits) ? data.edits : [],
      sessions: data.sessions && typeof data.sessions === 'object' && !Array.isArray(data.sessions)
        ? data.sessions
        : {},
    };
  } catch (_) {
    return { edits: [], sessions: {} };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(EDIT_LEDGER_PATH), { recursive: true });
  const tmpPath = `${EDIT_LEDGER_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, EDIT_LEDGER_PATH);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLedgerLock(fn) {
  fs.mkdirSync(path.dirname(EDIT_LEDGER_LOCK_PATH), { recursive: true });
  const start = Date.now();
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(EDIT_LEDGER_LOCK_PATH, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - start >= LOCK_WAIT_MS) {
        throw new Error(`edit ledger lock unavailable after ${LOCK_WAIT_MS}ms: ${EDIT_LEDGER_LOCK_PATH}`);
      }
      sleepSync(25);
    }
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(EDIT_LEDGER_LOCK_PATH);
  }
}

function ensureSessionBucket(data, sessionId) {
  if (!data.sessions[sessionId] || typeof data.sessions[sessionId] !== 'object') {
    data.sessions[sessionId] = { edits: [] };
  }
  if (!Array.isArray(data.sessions[sessionId].edits)) {
    data.sessions[sessionId].edits = [];
  }
  return data.sessions[sessionId].edits;
}

function recordEdit(file, sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    throw new Error('edit ledger requires explicit session identity');
  }
  withLedgerLock(() => {
    const data = load();
    const ts = Math.floor(Date.now() / 1000);
    if (!data.edits.some((entry) => entry.file === file)) {
      data.edits.push({ file, ts, sessionId: normalizedSessionId });
    }
    const sessionEdits = ensureSessionBucket(data, normalizedSessionId);
    if (!sessionEdits.some((entry) => entry.file === file)) {
      sessionEdits.push({ file, ts });
    }
    save(data);
  });
}

function listEditedFiles(options = {}) {
  const sessionId = normalizeSessionId(options.sessionId);
  const data = load();
  const edits = sessionId
    ? data.sessions[sessionId]?.edits || []
    : data.edits;
  return edits.map((entry) => entry.file).filter(Boolean);
}

function reset() {
  save({ edits: [], sessions: {} });
}

module.exports = {
  EDIT_LEDGER_PATH,
  EDIT_LEDGER_LOCK_PATH,
  sessionIdFromHookInput,
  recordEdit,
  listEditedFiles,
  reset,
};
