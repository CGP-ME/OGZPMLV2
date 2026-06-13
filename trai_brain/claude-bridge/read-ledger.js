'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { REPO_ROOT } = require('./policy');
const { normalizeSessionId } = require('./hook-input');

const LEDGER_PATH = path.join(REPO_ROOT, '.claude', 'session-state', 'read-ledger.json');
const TTL_SECONDS = 3600;

function nowSec() { return Math.floor(Date.now() / 1000); }

function gitContext() {
  try {
    const branch = execSync('git branch --show-current', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return { branch, commit };
  } catch (_) {
    return { branch: 'unknown', commit: 'unknown' };
  }
}

function load() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return { reads: [], sessions: {}, identity: gitContext() };
  }
  try {
    const data = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    if (!Array.isArray(data.reads)) data.reads = [];
    if (!data.sessions || typeof data.sessions !== 'object' || Array.isArray(data.sessions)) data.sessions = {};
    const cutoff = nowSec() - TTL_SECONDS;
    data.reads = data.reads.filter((r) => r.ts >= cutoff);
    for (const session of Object.values(data.sessions)) {
      if (!session || typeof session !== 'object') continue;
      if (!Array.isArray(session.reads)) session.reads = [];
      session.reads = session.reads.filter((r) => r.ts >= cutoff);
    }
    return data;
  } catch (_) {
    return { reads: [], sessions: {}, identity: gitContext() };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
}

function ensureSessionBucket(data, sessionId) {
  if (!data.sessions[sessionId] || typeof data.sessions[sessionId] !== 'object') {
    data.sessions[sessionId] = { reads: [] };
  }
  if (!Array.isArray(data.sessions[sessionId].reads)) {
    data.sessions[sessionId].reads = [];
  }
  return data.sessions[sessionId].reads;
}

function buildReadEntry({ file, start, end }) {
  return {
    file,
    start: Number.isInteger(start) ? start : 1,
    end: Number.isInteger(end) ? end : Number.MAX_SAFE_INTEGER,
    ts: nowSec(),
  };
}

function recordRead({ file, start, end, sessionId }) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    throw new Error('read ledger requires explicit session identity');
  }
  const data = load();
  data.identity = gitContext();
  const entry = buildReadEntry({ file, start, end });
  data.reads.push({ ...entry, sessionId: normalizedSessionId });
  ensureSessionBucket(data, normalizedSessionId).push(entry);
  save(data);
}

function listReads(options = {}) {
  const sessionId = normalizeSessionId(options.sessionId);
  const data = load();
  return sessionId ? (data.sessions[sessionId]?.reads || []) : data.reads;
}

function hasReadFile(file, options = {}) {
  return listReads(options).some((r) => r.file === file);
}

function hasReadRange(file, start, end, options = {}) {
  return listReads(options).some((r) => {
    if (r.file !== file) return false;
    return r.start <= start && r.end >= end;
  });
}

function reset() { save({ reads: [], sessions: {}, identity: gitContext() }); }

module.exports = { recordRead, hasReadFile, hasReadRange, listReads, reset, LEDGER_PATH, TTL_SECONDS };
