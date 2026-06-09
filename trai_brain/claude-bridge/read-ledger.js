'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { REPO_ROOT } = require('./policy');

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
    return { reads: [], identity: gitContext() };
  }
  try {
    const data = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    if (!Array.isArray(data.reads)) data.reads = [];
    const cutoff = nowSec() - TTL_SECONDS;
    data.reads = data.reads.filter((r) => r.ts >= cutoff);
    return data;
  } catch (_) {
    return { reads: [], identity: gitContext() };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
}

function recordRead({ file, start, end }) {
  const data = load();
  data.identity = gitContext();
  data.reads.push({
    file,
    start: Number.isInteger(start) ? start : 1,
    end: Number.isInteger(end) ? end : Number.MAX_SAFE_INTEGER,
    ts: nowSec(),
  });
  save(data);
}

function hasReadFile(file) {
  const data = load();
  return data.reads.some((r) => r.file === file);
}

function hasReadRange(file, start, end) {
  const data = load();
  return data.reads.some((r) => {
    if (r.file !== file) return false;
    return r.start <= start && r.end >= end;
  });
}

function listReads() { return load().reads; }
function reset() { save({ reads: [], identity: gitContext() }); }

module.exports = { recordRead, hasReadFile, hasReadRange, listReads, reset, LEDGER_PATH, TTL_SECONDS };
