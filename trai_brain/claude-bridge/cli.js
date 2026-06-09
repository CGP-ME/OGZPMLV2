#!/usr/bin/env node
'use strict';

const subcommand = process.argv[2];

const HANDLERS = {
  'prepare': './prepare',
  'pre-edit': './pre-edit',
  'pre-read': './pre-read',
  'pre-bash': './pre-bash',
  'post-read': './post-read',
  'ignore-check': './pre-read',
};

function showUsage() {
  process.stderr.write(`claude-bridge CLI
Usage: node trai_brain/claude-bridge/cli.js <subcommand>

Subcommands:
  prepare         UserPromptSubmit handler — injects prior-fixes context
  pre-edit        PreToolUse(Edit|Write|NotebookEdit) — forced-read + ignore gate
  pre-read        PreToolUse(Read) — ignore gate
  pre-bash        PreToolUse(Bash) — ignore gate on read-style commands
  post-read       PostToolUse(Read) — appends to session read-ledger
  ignore-check    Standalone ignore policy check (alias for pre-read)
`);
}

if (!subcommand || !HANDLERS[subcommand]) {
  showUsage();
  process.exit(1);
}

const handler = require(HANDLERS[subcommand]);
if (typeof handler.run !== 'function') {
  process.stderr.write(`claude-bridge: handler ${subcommand} has no run() export\n`);
  process.exit(1);
}
handler.run();
