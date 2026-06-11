'use strict';

function readStdinSync() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function emit(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function readHookInput(hookName) {
  const raw = readStdinSync();
  if (!raw.trim()) {
    emit(`BLOCKED (${hookName}): missing hook input. Hook policy fails closed.`, 2);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (_) {
    emit(`BLOCKED (${hookName}): malformed hook input. Hook policy fails closed.`, 2);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    emit(`BLOCKED (${hookName}): invalid hook input. Hook policy fails closed.`, 2);
  }

  return input;
}

module.exports = { emit, readHookInput };
