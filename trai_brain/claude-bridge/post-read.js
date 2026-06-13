'use strict';

const policy = require('./policy');
const ledger = require('./read-ledger');
const { readHookInput, sessionIdFromHookInput } = require('./hook-input');

function run() {
  const input = readHookInput('claude-bridge post-read');
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || '';
  if (!target) process.exit(0);
  const sessionId = sessionIdFromHookInput(input);
  if (!sessionId) {
    process.stderr.write('BLOCKED (claude-bridge post-read): missing session identity. Read ledger policy fails closed.\n');
    process.exit(2);
  }

  const check = policy.checkPath(target);
  if (!check.allowed) process.exit(0);

  const offset = Number.isInteger(ti.offset) ? ti.offset : 1;
  const limit = Number.isInteger(ti.limit) ? ti.limit : null;
  const end = limit ? offset + limit - 1 : Number.MAX_SAFE_INTEGER;

  ledger.recordRead({ file: check.path, start: offset, end, sessionId });
  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
