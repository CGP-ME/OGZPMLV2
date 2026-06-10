'use strict';

const policy = require('./policy');

function readStdinSync() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function emit(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.path || ti.notebook_path || '';

  if (!target) {
    process.exit(0);
  }

  const check = policy.checkPath(target);
  if (!check.allowed) {
    if (check.reason === 'claude_bridge_ignored') {
      emit(
        `BLOCKED (claude-bridge ignore): ${check.path} is claude-bridge ignore-policy protected. ` +
        `Claude cannot read this through bridge hooks. ` +
        `See trai_brain/claude-bridge/ignore-policy.json for the policy.`,
        2
      );
    }
    if (check.reason === 'outside_repo') {
      emit(`BLOCKED (claude-bridge): ${target} is outside the repo boundary`, 2);
    }
    emit(`BLOCKED (claude-bridge): ${check.reason}`, 2);
  }

  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
