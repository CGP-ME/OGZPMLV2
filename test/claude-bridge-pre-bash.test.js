const { extractPaths, mutationReason, mercuryFramingReason } = require('../trai_brain/claude-bridge/pre-bash');

describe('claude bridge Bash gate', () => {
  test('allows read-only inspection commands without ignored paths', () => {
    expect(mutationReason('git status --short --branch')).toBeNull();
    expect(mutationReason('rg -n "needle" core test')).toBeNull();
    expect(mutationReason('npx jest test/claude-bridge-policy.test.js --runInBand')).toBeNull();
  });

  test('blocks shell mutation bypasses that avoid Edit and Write hooks', () => {
    expect(mutationReason('mv .claude/hookify.no-emojis.local.md .claude/hookify-disabled/'))
      .toBe('mutating_command:mv');
    expect(mutationReason('cat x > .claude/hookify.no-emojis.local.md')).toBe('output_redirection');
    expect(mutationReason('git restore -- .claude/hookify.no-emojis.local.md')).toBe('git_mutation');
    expect(mutationReason('git reset --hard HEAD')).toBe('git_mutation');
    expect(mutationReason('npm audit fix --force')).toBe('package_mutation');
    expect(mutationReason('node -e "require(\'fs\').writeFileSync(\'x\', \'y\')"')).toBe('inline_runtime');
  });

  test('routes git publish commands through Warden instead of blocking forever', () => {
    expect(mutationReason('git add core/OrderExecutor.js')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git commit -m "Fixed thing"')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git push origin claude/new_beginnings')).toBe('warden_gated_git_mutation');
  });

  test('still detects ignored read paths for allowed read commands', () => {
    expect(extractPaths('cat data/state.json')).toEqual(['data/state.json']);
    expect(extractPaths('nl -ba core/TRAIDecisionModule.js')).toEqual(['core/TRAIDecisionModule.js']);
    expect(extractPaths('rg -n "needle" core test')).toEqual(['core', 'test']);
  });

  test('allows only adversarial Mercury ask dispatch framing', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Find a concrete state where this lies or creates a silent failure."'
    )).toBeNull();
  });

  test('blocks verification-framed Mercury ask dispatches', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Verify vector 1 is closed."'
    )).toBe('verification_framing:verify');
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. What changed since pass 1?"'
    )).toBe('verification_framing:what_changed');
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Is vector 1 closed?"'
    )).toBe('verification_framing:is_closed');
  });

  test('blocks Mercury ask dispatches without a visible break-my-fix frame', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Find bugs in this fix."'
    )).toBe('missing_break_my_fix');
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "$(cat prompt.md)"'
    )).toBe('missing_break_my_fix');
  });

  test('does not apply Mercury ask framing rules to other Mercury tools', () => {
    expect(mercuryFramingReason('node trai_brain/mercury-bridge/indexer.js')).toBeNull();
  });
});
