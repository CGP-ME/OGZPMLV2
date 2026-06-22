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
        'status --short': ' M core/MaxProfitManager.js\n?? ogz-meta/ledger/intake.md\n',
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
    expect(context.text).toContain('?? ogz-meta/ledger/intake.md');
    expect(context.text).toContain('core/MaxProfitManager.js');
    expect(context.text).toContain('+changed');
  });

  test('does not invent dirty files when the tracked diff is empty', () => {
    const context = buildBreakMyFixDirtyDiffContext({
      gitReader: fakeGit({
        'status --short': '',
        'diff --cached --name-only': '',
        'diff --name-only': '',
        'diff --cached --no-ext-diff --': '',
        'diff --no-ext-diff --': '',
      }),
    });

    expect(context.text).toContain('## git status --short\n(clean)');
    expect(context.text).toContain('## git diff --name-only\n(none)');
    expect(context.text).toContain('## git diff --no-ext-diff --\n(none)');
  });
});
