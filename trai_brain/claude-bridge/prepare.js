'use strict';

const priorFixes = require('./prior-fixes');

function readStdinSync() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const prompt = input.prompt || input.user_prompt || '';
  if (!prompt) {
    process.exit(0);
  }
  const matches = priorFixes.topMatches(prompt, 3);
  const block = priorFixes.formatBlock(matches);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: block,
    },
  }));
  process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
