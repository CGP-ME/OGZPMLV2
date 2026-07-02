const {
  extractPaths,
  mutationReason,
  mercuryFramingReason,
  gitMutationScope,
} = require('../trai_brain/claude-bridge/pre-bash');
const { spawnSync } = require('child_process');
const path = require('path');

const PRE_BASH = path.join(__dirname, '../trai_brain/claude-bridge/pre-bash.js');

function runPreBash(input) {
  return spawnSync(process.execPath, [PRE_BASH], {
    cwd: path.join(__dirname, '..'),
    input,
    encoding: 'utf8',
  });
}

describe('claude bridge Bash gate', () => {
  test('allows read-only inspection commands without ignored paths', () => {
    expect(mutationReason('git status --short --branch')).toBeNull();
    expect(mutationReason('rg -n "needle" core test')).toBeNull();
    expect(mutationReason('npx jest test/claude-bridge-policy.test.js --runInBand')).toBeNull();
    expect(mutationReason('node --check trai_brain/claude-bridge/pre-bash.js')).toBeNull();
    expect(mutationReason('node trai_brain/claude-bridge/cli.js record-proof ogz-meta/cognition-history/proof.json')).toBeNull();
  });

  test('blocks shell mutation bypasses that avoid Edit and Write hooks', () => {
    expect(mutationReason('mv .claude/hookify.no-emojis.local.md .claude/hookify-disabled/'))
      .toBe('mutating_command:mv');
    expect(mutationReason('cat x > .claude/hookify.no-emojis.local.md')).toBe('output_redirection');
    expect(mutationReason('git restore -- .claude/hookify.no-emojis.local.md')).toBe('git_mutation');
    expect(mutationReason('git reset --hard HEAD')).toBe('git_mutation');
    expect(mutationReason('npm audit fix --force')).toBe('package_mutation');
    expect(mutationReason('node -e "require(\'fs\').writeFileSync(\'x\', \'y\')"')).toBe('inline_runtime');
    expect(mutationReason('awk -i inplace "{ print $0 }" file.txt')).toBe('in_place_edit');
    expect(mutationReason('./rm data/state.json')).toBe('mutating_command:rm');
    expect(mutationReason('/bin/rm data/state.json')).toBe('mutating_command:rm');
    expect(mutationReason('/usr/bin/rm data/state.json')).toBe('mutating_command:rm');
    expect(mutationReason('../cp source target')).toBe('mutating_command:cp');
  });

  test('blocks interpreter and shell escape hatches that can mutate outside edit gates', () => {
    expect(mutationReason('bash -c "cat package.json"')).toBe('shell_runtime:bash');
    expect(mutationReason('sh scripts/audit.sh')).toBe('shell_runtime:sh');
    expect(mutationReason('eval "cat package.json"')).toBe('shell_eval:eval');
    expect(mutationReason('. ./scripts/env.sh')).toBe('shell_eval:.');
    expect(mutationReason('node scripts/audit.js')).toBe('script_runtime:node');
    expect(mutationReason('python3 scripts/audit.py')).toBe('script_runtime:python3');
    expect(mutationReason('env NODE_ENV=test node scripts/audit.js')).toBe('script_runtime:node');
    expect(mutationReason('command rm data/state.json')).toBe('mutating_command:rm');
    expect(mutationReason('sudo cat data/state.json')).toBe('privileged_wrapper:sudo');
    expect(mutationReason('doas cat data/state.json')).toBe('privileged_wrapper:doas');
    expect(mutationReason('sudo env rm data/state.json')).toBe('privileged_wrapper:sudo');
    expect(mutationReason('nohup env command rm data/state.json')).toBe('mutating_command:rm');
  });

  test('blocks read-command mutation escapes in find and xargs', () => {
    expect(mutationReason('find . -name "*.bak" -delete')).toBe('find_delete');
    expect(mutationReason('find . -name "*.bak" -exec rm {} ;')).toBe('find_exec_mutation');
    expect(mutationReason('rg -l "needle" core | xargs rm')).toBe('xargs_mutation');
    expect(mutationReason('find core -type f -exec grep -n needle {} ;')).toBeNull();
  });

  test('blocks archive extraction while keeping archive inspection available', () => {
    expect(mutationReason('tar -tf archive.tar')).toBeNull();
    expect(mutationReason('tar -xf archive.tar')).toBe('archive_extract:tar');
    expect(mutationReason('tar --extract --file archive.tar')).toBe('archive_extract:tar');
    expect(mutationReason('unzip -l archive.zip')).toBeNull();
    expect(mutationReason('unzip archive.zip')).toBe('archive_extract:unzip');
  });

  test('routes git publish commands through Warden instead of blocking forever', () => {
    expect(mutationReason('git add core/OrderExecutor.js')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git commit -m "Fixed thing"')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git push origin claude/new_beginnings')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git -C repo add .')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git -c core.editor=vim commit -m "Fixed thing"')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git --git-dir=.git commit -m "Fixed thing"')).toBe('warden_gated_git_mutation');
    expect(mutationReason('env GIT_DIR=.git git -c core.editor=vim commit -m "Fixed thing"')).toBe('warden_gated_git_mutation');
    expect(mutationReason('command git -C repo push origin main')).toBe('warden_gated_git_mutation');
    expect(mutationReason('git -C repo restore -- file.js')).toBe('git_mutation');
    expect(mutationReason('git -C repo status --short')).toBeNull();
  });

  test('scopes Warden git mutations by command intent', () => {
    expect(gitMutationScope('git add core/OrderExecutor.js test/order-executor.test.js')).toEqual({
      kind: 'paths',
      paths: ['core/OrderExecutor.js', 'test/order-executor.test.js'],
    });
    expect(gitMutationScope('git add .')).toEqual({ kind: 'broad' });
    expect(gitMutationScope('git add -A')).toEqual({ kind: 'broad' });
    expect(gitMutationScope('git commit -m "Fixed thing"')).toEqual({ kind: 'staged' });
    expect(gitMutationScope('git push origin main')).toEqual({ kind: 'push' });
  });

  test('still detects ignored read paths for allowed read commands', () => {
    expect(extractPaths('cat data/state.json')).toEqual(['data/state.json']);
    expect(extractPaths('nl -ba core/TRAIDecisionModule.js')).toEqual(['core/TRAIDecisionModule.js']);
    expect(extractPaths('rg -n "needle" core test')).toEqual(['core', 'test']);
  });

  test('blocks protected bridge session-state reads through Bash', () => {
    const result = runPreBash(JSON.stringify({
      session_id: 'session-a',
      tool_input: { command: 'cat .claude/session-state/read-ledger.json' },
    }));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('claude_bridge_protected_state');
  });

  test('Warden git mutation gate requires hook session identity', () => {
    const result = runPreBash(JSON.stringify({
      tool_input: { command: 'git add AGENTS.md' },
    }));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('missing session identity');
  });

  test('allows only adversarial Mercury ask dispatch framing', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Find a concrete state where this lies or creates a silent failure."'
    )).toBeNull();
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Use the current dirty git diff and current repo state. Find any way this fails."'
    )).toBeNull();
    expect(mutationReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Find a concrete state where this lies or creates a silent failure."'
    )).toBeNull();
    expect(mutationReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Find a concrete state where this lies." && rm data/state.json'
    )).toBe('mutating_command:rm');
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

  test('does not block scoped Mercury ask dispatches after the required frame', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Patch target: core/EvalRuleEngine.js:109-173. Find a failure."'
    )).toBeNull();
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Look at core/EvalRuleEngine.js:109-173 and test/eval-rule-engine.test.js."'
    )).toBeNull();
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. Attack lines 109-173."'
    )).toBeNull();
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Mercury, break my fix. $(cat prompt.md)"'
    )).toBeNull();
  });

  test('blocks Mercury ask dispatches without a visible break-my-fix frame', () => {
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Find bugs in this fix."'
    )).toBe('missing_break_my_fix');
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "$(cat prompt.md)"'
    )).toBe('missing_break_my_fix');
    expect(mercuryFramingReason(
      'node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "Can you explain why this had to break my fix before?"'
    )).toBe('missing_break_my_fix');
  });

  test('does not apply Mercury ask framing rules to other Mercury tools', () => {
    expect(mercuryFramingReason('node trai_brain/mercury-bridge/indexer.js')).toBeNull();
  });

  test('fails closed when hook input is missing or malformed', () => {
    const missing = runPreBash('');
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('missing hook input');

    const malformed = runPreBash('{not-json');
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).toContain('malformed hook input');

    const missingCommand = runPreBash(JSON.stringify({ tool_input: {} }));
    expect(missingCommand.status).toBe(2);
    expect(missingCommand.stderr).toContain('missing Bash command');
  });
});
