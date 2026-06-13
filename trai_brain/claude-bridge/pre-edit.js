'use strict';

const fs = require('fs');
const path = require('path');
const policy = require('./policy');
const ledger = require('./read-ledger');
const taskContract = require('./task-contract');
const { emit, readHookInput, sessionIdFromHookInput } = require('./hook-input');

function run() {
  const input = readHookInput('claude-bridge edit');
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || ti.notebook_path || '';

  if (!target) emit('BLOCKED (claude-bridge): tool_input.file_path missing', 2);

  const check = policy.checkPath(target, { operation: 'write' });
  if (!check.allowed) {
    if (check.reason === 'claude_bridge_protected_write') {
      emit(
        `BLOCKED (claude-bridge protected write): ${check.path} is part of the enforcement surface. ` +
        `Bridge hooks cannot edit their own policy, hooks, or command definitions.`,
        2
      );
    }
    if (check.reason === 'claude_bridge_ignored') {
      emit(
        `BLOCKED (claude-bridge ignore): ${check.path} is claude-bridge ignore-policy protected. ` +
        `Claude cannot read this path through bridge hooks. ` +
        `If this path must be edited, surface the policy decision to Trey before proceeding.`,
        2
      );
    }
    if (check.reason === 'outside_repo') {
      emit(`BLOCKED (claude-bridge): ${target} is outside the repo boundary`, 2);
    }
    emit(`BLOCKED (claude-bridge): ${check.reason}`, 2);
  }

  const rel = check.path;
  const taskCheck = taskContract.checkPathAllowed('write', rel);
  if (!taskCheck.allowed) {
    emit(
      `BLOCKED (claude task-contract): write ${taskCheck.path || rel} violates active task ${taskCheck.taskId}. ` +
      `${taskCheck.reason}${taskCheck.matched ? ` (${taskCheck.matched})` : ''}.`,
      2
    );
  }

  const absPath = path.isAbsolute(target) ? target : path.resolve(policy.REPO_ROOT, target);
  const fileExists = fs.existsSync(absPath);

  if (!fileExists) {
    process.stdout.write(JSON.stringify({ ok: true, reason: 'new_file' }));
    process.exit(0);
  }

  const sessionId = sessionIdFromHookInput(input);
  if (!sessionId) {
    emit('BLOCKED (claude-bridge forced-read): missing session identity. Read ledger policy fails closed.', 2);
  }

  if (!ledger.hasReadFile(rel, { sessionId })) {
    const reads = ledger.listReads({ sessionId });
    const recent = reads.slice(-5).map((r) => `  - ${r.file}:${r.start}-${r.end === Number.MAX_SAFE_INTEGER ? 'EOF' : r.end}`).join('\n');
    emit(
      `BLOCKED (claude-bridge forced-read): ${rel} has not been Read in this session. ` +
      `Required action: Read(file_path="${rel}") before Edit/Write. ` +
      `Recent reads (last 5):\n${recent || '  (none)'}\n` +
      `Ledger: .claude/session-state/read-ledger.json (TTL ${ledger.TTL_SECONDS}s).`,
      2
    );
  }

  process.stdout.write(JSON.stringify({ ok: true, reason: 'read_verified', rel }));
  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
