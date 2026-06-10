const { extractPaths, mutationReason } = require('../trai_brain/claude-bridge/pre-bash');

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
  });
});
