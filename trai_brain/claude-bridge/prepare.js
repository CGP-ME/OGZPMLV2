'use strict';

const priorFixes = require('./prior-fixes');
const { readHookInput } = require('./hook-input');

function run() {
  const input = readHookInput('claude-bridge prepare');
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
