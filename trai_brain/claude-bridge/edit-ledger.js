'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./policy');

const EDIT_LEDGER_PATH = path.join(REPO_ROOT, '.claude', 'session-state', 'edit-ledger.json');

function load() {
  if (!fs.existsSync(EDIT_LEDGER_PATH)) {
    return { edits: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(EDIT_LEDGER_PATH, 'utf8'));
    return { edits: Array.isArray(data.edits) ? data.edits : [] };
  } catch (_) {
    return { edits: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(EDIT_LEDGER_PATH), { recursive: true });
  fs.writeFileSync(EDIT_LEDGER_PATH, JSON.stringify(data, null, 2));
}

function recordEdit(file) {
  const data = load();
  if (!data.edits.some((entry) => entry.file === file)) {
    data.edits.push({ file, ts: Math.floor(Date.now() / 1000) });
    save(data);
  }
}

function listEditedFiles() {
  return load().edits.map((entry) => entry.file).filter(Boolean);
}

function reset() {
  save({ edits: [] });
}

module.exports = { EDIT_LEDGER_PATH, recordEdit, listEditedFiles, reset };
