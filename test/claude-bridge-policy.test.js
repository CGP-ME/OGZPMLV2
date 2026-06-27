const fs = require('fs');
const path = require('path');

const policyPath = path.join(__dirname, '..', 'trai_brain', 'claude-bridge', 'policy.js');
const ignorePolicyPath = path.join(__dirname, '..', 'trai_brain', 'claude-bridge', 'ignore-policy.json');

describe('claude bridge policy ownership', () => {
  test('does not import Mercury runtime modules', () => {
    const source = fs.readFileSync(policyPath, 'utf8');
    expect(source).not.toMatch(/mercury-bridge/);
    expect(source).not.toMatch(/mercury\.config/);
  });

  test('uses Claude-owned cloned ignore policy', () => {
    const ignorePolicy = require(ignorePolicyPath);
    const policy = require('../trai_brain/claude-bridge/policy');

    expect(ignorePolicy.snapshotSource).toBe('mercury.ignore');
    expect(ignorePolicy.ignoredDirectories).toContain('data/');
    expect(policy.checkPath('data/state.json')).toEqual({
      allowed: false,
      reason: 'claude_bridge_ignored',
      path: 'data/state.json',
    });
  });

  test('allows Claude-owned intake without allowing broader ignored session history', () => {
    const policy = require('../trai_brain/claude-bridge/policy');

    expect(policy.checkPath('.claude/memory/MEMORY.md').allowed).toBe(true);
    expect(policy.checkPath('.claude/session-state/read-ledger.json')).toEqual({
      allowed: false,
      reason: 'claude_bridge_protected_state',
      path: '.claude/session-state/read-ledger.json',
    });
    expect(policy.checkPath('ogz-meta/ledger/intake.md').allowed).toBe(true);
    expect(policy.checkPath('ogz-meta/ledger/uncommitted-deepsearch-drop.md').allowed).toBe(true);
    expect(policy.checkPath('ogz-meta/specs/curated-spec.md').allowed).toBe(true);
    expect(policy.checkPath('ogz-meta/cognition-history/mercury/old-response.md')).toEqual({
      allowed: false,
      reason: 'claude_bridge_ignored',
      path: 'ogz-meta/cognition-history/mercury/old-response.md',
    });
    expect(policy.checkPath('ogz-meta/sessions/session.md')).toEqual({
      allowed: true,
      reason: 'claude_owned',
      path: 'ogz-meta/sessions/session.md',
    });
    expect(policy.checkPath('ogz-meta/sessions/session.md', { operation: 'write' })).toEqual({
      allowed: true,
      reason: 'claude_owned',
      path: 'ogz-meta/sessions/session.md',
    });
    expect(policy.checkPath('other/sessions/session.md')).toEqual({
      allowed: false,
      reason: 'claude_bridge_ignored',
      path: 'other/sessions/session.md',
    });
    expect(policy.checkPath('other/sessions/session.md', { operation: 'write' })).toEqual({
      allowed: false,
      reason: 'claude_bridge_ignored',
      path: 'other/sessions/session.md',
    });
  });

  test('blocks writes to the Claude bridge enforcement surface', () => {
    const policy = require('../trai_brain/claude-bridge/policy');

    for (const protectedPath of [
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.claude/hooks/enforce-pipeline.sh',
      '.claude/hookify.no-emojis.local.md',
      '.claude/commands/recorder.md',
      '.claude/session-state/read-ledger.json',
      'trai_brain/claude-bridge/pre-bash.js',
      'trai_brain/claude-bridge/policy.js',
    ]) {
      expect(policy.checkPath(protectedPath, { operation: 'write' })).toEqual({
        allowed: false,
        reason: 'claude_bridge_protected_write',
        path: protectedPath,
      });
    }
  });

  test('keeps enforcement surface readable for audit', () => {
    const policy = require('../trai_brain/claude-bridge/policy');

    expect(policy.checkPath('.claude/settings.json', { operation: 'read' }).allowed).toBe(true);
    expect(policy.checkPath('trai_brain/claude-bridge/pre-bash.js', { operation: 'read' }).allowed).toBe(true);
  });
});
