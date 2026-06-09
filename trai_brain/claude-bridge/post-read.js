'use strict';

const policy = require('./policy');
const ledger = require('./read-ledger');

function readStdinSync() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || '';
  if (!target) process.exit(0);

  const check = policy.checkPath(target);
  if (!check.allowed) process.exit(0);

  const offset = Number.isInteger(ti.offset) ? ti.offset : 1;
  const limit = Number.isInteger(ti.limit) ? ti.limit : null;
  const end = limit ? offset + limit - 1 : Number.MAX_SAFE_INTEGER;

  ledger.recordRead({ file: check.path, start: offset, end });
  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
