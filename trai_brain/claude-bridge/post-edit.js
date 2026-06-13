'use strict';

const policy = require('./policy');
const editLedger = require('./edit-ledger');
const { readHookInput } = require('./hook-input');

function run() {
  const input = readHookInput('claude-bridge post-edit');
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || ti.notebook_path || '';
  const sessionId = editLedger.sessionIdFromHookInput(input);

  if (!target) process.exit(0);
  if (!sessionId) {
    process.stderr.write('BLOCKED (claude-bridge post-edit): missing session identity. Edit ledger policy fails closed.\n');
    process.exit(2);
  }

  const check = policy.checkPath(target, { operation: 'write' });
  if (check.allowed) {
    editLedger.recordEdit(check.path, sessionId);
  }

  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
