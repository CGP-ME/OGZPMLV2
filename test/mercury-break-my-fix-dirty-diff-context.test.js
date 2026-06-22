'use strict';

const {
  buildBreakMyFixDirtyDiffContext,
} = require('../trai_brain/mercury-bridge/ask');

function fakeGit(outputs) {
  return (args) => {
    const key = args.join(' ');
    if (!Object.prototype.hasOwnProperty.call(outputs, key)) {
      throw new Error(`unexpected git command: ${key}`);
    }
    return outputs[key];
  };
}

describe('Mercury break-my-fix dirty diff context', () => {
  test('injects neutral tracked dirty diff context for plain break-my-fix reviews', () => {
    const context = buildBreakMyFixDirtyDiffContext({
      gitReader: fakeGit({
        'status --short --untracked-files=no': ' M core/MaxProfitManager.js\n',
        'diff --cached --name-only': '',
        'diff --name-only': 'core/MaxProfitManager.js\n',
        'diff --cached --no-ext-diff --': '',
        'diff --no-ext-diff --': 'diff --git a/core/MaxProfitManager.js b/core/MaxProfitManager.js\n+changed\n',
      }),
    });

    expect(context.source).toBe('ogz-meta/mercury-review-input/dirty-diff.md');
    expect(context.similarity).toBe(1);
    expect(context.text).toContain('This is not a conclusion or a scope limit.');
    expect(context.text).toContain('M core/MaxProfitManager.js');
    expect(context.text).toContain('core/MaxProfitManager.js');
    expect(context.text).toContain('+changed');
    expect(context.text).toContain('Untracked files are intentionally omitted');
  });

  test('does not invent dirty files when the tracked diff is empty', () => {
    const context = buildBreakMyFixDirtyDiffContext({
      gitReader: fakeGit({
        'status --short --untracked-files=no': '',
        'diff --cached --name-only': '',
        'diff --name-only': '',
        'diff --cached --no-ext-diff --': '',
        'diff --no-ext-diff --': '',
      }),
    });

    expect(context.text).toContain('## git status --short --untracked-files=no\n(clean)');
    expect(context.text).toContain('## git diff --name-only\n(none)');
    expect(context.text).toContain('## git diff --no-ext-diff --\n(none)');
  });
});
