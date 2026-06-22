'use strict';

const {
  runReactLoop,
  extractDirtyDiffChangedFiles,
  getDirtyDiffGateError,
} = require('../trai_brain/mercury-bridge/react-loop');

function dirtyContext() {
  return [{
    source: 'ogz-meta/mercury-review-input/dirty-diff.md',
    kind: 'dirty_diff',
    similarity: 1,
    text: [
      'Neutral dirty-diff context for the current break-my-fix review.',
      '',
      '## git diff --cached --name-only',
      'test/new-file.test.js',
      '',
      '## git diff --name-only',
      'core/MaxProfitManager.js',
      'config/trading.config.json',
      '',
      '## git diff --cached --no-ext-diff --',
      '(none)',
      '',
      '## git diff --no-ext-diff --',
      '(patch)',
    ].join('\n'),
  }];
}

function toolCall(name, args, id) {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe('Mercury break-my-fix ReAct dirty diff gate', () => {
  test('extracts cached and worktree changed files from dirty diff context', () => {
    expect([...extractDirtyDiffChangedFiles(dirtyContext())]).toEqual([
      'test/new-file.test.js',
      'core/MaxProfitManager.js',
      'config/trading.config.json',
    ]);
  });

  test('blocks broad search until tracked changed files are opened', () => {
    const changedFiles = new Set(['core/MaxProfitManager.js']);
    const openedFiles = new Set();

    expect(getDirtyDiffGateError({
      toolName: 'grep',
      toolArgs: { query: 'TODO' },
      changedFiles,
      openedFiles,
    })).toMatch(/open every tracked changed file/);

    expect(getDirtyDiffGateError({
      toolName: 'open_file',
      toolArgs: { path: 'core/MaxProfitManager.js' },
      changedFiles,
      openedFiles,
    })).toBeNull();
  });

  test('returns tool error instead of executing broad tools before changed files are opened', async () => {
    const executed = [];
    const client = {
      calls: 0,
      async generateWithTools() {
        this.calls += 1;
        if (this.calls === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [toolCall('grep', { query: 'TODO' }, 'call_1')],
          };
        }
        if (this.calls === 2) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              toolCall('open_file', { path: 'test/new-file.test.js', start_line: 1, end_line: 20 }, 'call_2'),
              toolCall('open_file', { path: 'core/MaxProfitManager.js', start_line: 1, end_line: 20 }, 'call_3'),
              toolCall('open_file', { path: 'config/trading.config.json', start_line: 1, end_line: 20 }, 'call_4'),
            ],
          };
        }
        return {
          role: 'assistant',
          content: 'NO_CONCRETE_BREAK_FOUND\nChanged files opened first.',
        };
      },
    };
    const toolAdapter = {
      buildToolSchema() {
        return [];
      },
      async execute(name, args) {
        executed.push({ name, args });
        return { file: args.path, start_line: args.start_line, end_line: args.end_line, text: 'ok' };
      },
    };

    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: 'Mercury, break my fix.',
      starterContext: dirtyContext(),
      maxIterations: 4,
      verbose: false,
    });

    expect(result.answer).toContain('NO_CONCRETE_BREAK_FOUND');
    expect(result.history[0].toolName).toBe('grep');
    expect(result.history[0].toolResult.error).toMatch(/open every tracked changed file/);
    expect(executed.map((call) => call.args.path)).toEqual([
      'test/new-file.test.js',
      'core/MaxProfitManager.js',
      'config/trading.config.json',
    ]);
  });
});
