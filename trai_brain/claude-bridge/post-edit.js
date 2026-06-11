'use strict';

const policy = require('./policy');
const editLedger = require('./edit-ledger');

function readStdinSync() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || ti.notebook_path || '';

  if (!target) process.exit(0);

  const check = policy.checkPath(target, { operation: 'write' });
  if (check.allowed) {
    editLedger.recordEdit(check.path);
  }

  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
