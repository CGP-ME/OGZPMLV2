'use strict';

const {
  runReactLoop,
  hasFileLineCitation,
  hasToolHandleCitation,
  hasUnsupportedRunCheckClaim,
  previewUncitedAnswer,
  normalizeToolHandleCitations,
  compactAssistantMessageForHistory,
  stringifyToolResultForHistory,
  findToolAvailabilityContradiction,
  hasUnsupportedTestOutcomeClaim,
  hasConceptualProofClaim,
} = require('../trai_brain/mercury-bridge/react-loop');

function createToolAdapter() {
  return {
    buildToolSchema: jest.fn(() => []),
    execute: jest.fn(),
  };
}

function createClient(responses) {
  const snapshots = [];
  return {
    messageSnapshots: snapshots,
    generateWithTools: jest.fn(async (messages) => {
      snapshots.push(JSON.parse(JSON.stringify(messages)));
      const response = responses.shift();
      if (!response) {
        throw new Error('test client exhausted responses');
      }
      return response;
    }),
  };
}

describe('Mercury ReAct loop evidence gates', () => {
  test('file-line citation detector accepts repo citations and rejects uncited prose', () => {
    expect(hasFileLineCitation('See trai_brain/mercury-bridge/react-loop.js:257-264.')).toBe(true);
    expect(hasFileLineCitation('See trai_brain/mercury-bridge/react-loop.js:257‑264.')).toBe(true);
    expect(hasFileLineCitation('This looks clean from the current evidence.')).toBe(false);
    expect(hasToolHandleCitation('See 【run_check†L1-L9】.')).toBe(true);
    expect(hasToolHandleCitation('See trai_brain/mercury-bridge/react-loop.js:257-264.')).toBe(false);
    expect(hasUnsupportedRunCheckClaim('The run_check result proves a test failed. test/foo.test.js:1-2')).toBe(true);
    expect(hasUnsupportedRunCheckClaim(
      'The run_check result is in ogz-meta/cognition-history/mercury-execution/2026-06-23T20-08-44-993Z-run-tests.log:1-20.'
    )).toBe(false);
  });

  test('tool-handle citation normalizer converts same-sentence repo path handles', () => {
    const normalized = normalizeToolHandleCitations(
      'The code in `trai_brain/mercury-bridge/tool-adapter.js` is guarded 【open_file†L209-L221】.'
    );

    expect(normalized).toContain('trai_brain/mercury-bridge/tool-adapter.js:209-221');
    expect(hasFileLineCitation(normalized)).toBe(true);
  });

  test('citation normalizer converts file plus lines prose into literal repo citations', () => {
    const normalized = normalizeToolHandleCitations(
      'File: `trai_brain/mercury-bridge/tool-adapter.js` Lines: 1073-1082'
    );

    expect(normalized).toBe('trai_brain/mercury-bridge/tool-adapter.js:1073-1082');
    expect(hasFileLineCitation(normalized)).toBe(true);
  });

  test('uncited answer preview is compact and bounded for failed proof debugging', () => {
    const preview = previewUncitedAnswer(`\nLooks clean.\n${'x'.repeat(700)}`);

    expect(preview).toMatch(/^Looks clean\. /);
    expect(preview.length).toBeLessThanOrEqual(503);
    expect(preview).toMatch(/\.\.\.$/);
  });

  test('tool-call and tool-result history is compacted before the next Mercury request', async () => {
    const giantArgument = JSON.stringify({
      command: ['node', '-e', 'x'.repeat(5000)],
      profile: 'oversized-proof',
    });
    const client = createClient([
      {
        role: 'assistant',
        tool_calls: [{
          id: 'call-big',
          type: 'function',
          function: {
            name: 'run_check',
            arguments: giantArgument,
          },
        }],
      },
      {
        role: 'assistant',
        content: 'The context budget is guarded at trai_brain/mercury-bridge/react-loop.js:43-89.',
      },
    ]);
    const toolAdapter = createToolAdapter();
    toolAdapter.execute.mockResolvedValue({
      source: 'run_check',
      stdout: 'y'.repeat(15000),
    });

    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: 'Mercury, break my fix.',
    });

    expect(result.termination).toBe('answer_given');
    const secondRequest = client.messageSnapshots[1];
    const assistantHistory = secondRequest.find((message) => message.role === 'assistant' && message.tool_calls);
    const toolHistory = secondRequest.find((message) => message.role === 'tool');

    expect(assistantHistory.tool_calls[0].function.arguments.length).toBeLessThan(giantArgument.length);
    expect(assistantHistory.tool_calls[0].function.arguments).toContain('_mercury_context_compacted');
    expect(assistantHistory.tool_calls[0].function.arguments).not.toContain('x'.repeat(3000));
    expect(toolHistory.content).toContain('_mercury_context_compacted');
    expect(toolHistory.content).not.toContain('y'.repeat(13000));
  });

  test('history compaction helpers are no-ops for small payloads', () => {
    const toolCall = {
      id: 'call-small',
      function: {
        name: 'grep',
        arguments: JSON.stringify({ query: 'marker' }),
      },
    };

    expect(compactAssistantMessageForHistory({ role: 'assistant', tool_calls: [toolCall] }).tool_calls[0])
      .toEqual(toolCall);
    expect(stringifyToolResultForHistory({ ok: true })).toBe('{"ok":true}');
  });

  test('tool availability contradiction detector rejects claims disproven by successful tool use', () => {
    const history = [
      { toolName: 'git_diff', toolResult: { files: ['CHANGELOG.md'] } },
    ];

    expect(findToolAvailabilityContradiction(
      'git_diff is registered, but it is not exposed to Mercury and cannot be invoked. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      history
    )).toBe('git_diff');
    expect(findToolAvailabilityContradiction(
      'git_diff is exposed and was used successfully. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      history
    )).toBe(null);
    expect(findToolAvailabilityContradiction(
      'git_diff is fully implemented, registered, and usable. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      history
    )).toBe(null);
    expect(findToolAvailabilityContradiction(
      'git_diff is exposed and usable. The real problem is that current diffs may omit unstaged changes. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      history
    )).toBe(null);
  });

  test('unsupported proof detectors reject unexecuted test outcomes and conceptual breaks', () => {
    expect(hasUnsupportedTestOutcomeClaim(
      'The test now fails because the diff target is wrong. test/mercury-index-scope.test.js:347-368',
      [{ toolName: 'open_file', toolResult: { text: 'test body' } }]
    )).toBe(true);
    expect(hasUnsupportedTestOutcomeClaim(
      'The test now fails because the diff target is wrong. test/mercury-index-scope.test.js:347-368',
      [{ toolName: 'jest', toolResult: { status: 'failed' } }]
    )).toBe(false);
    expect(hasUnsupportedTestOutcomeClaim(
      'The focused test passed after the runner executed it. test/mercury-index-scope.test.js:347-368',
      [{ toolName: 'run_check', toolResult: { source: 'run_check', exit_code: 0 } }]
    )).toBe(false);
    expect(hasConceptualProofClaim('Reproduction steps are conceptual; no additional evidence needed.')).toBe(true);
    expect(hasConceptualProofClaim('The cited code path is reachable. core/foo.js:10-20')).toBe(false);
  });


  test('accepts a final answer only when it contains file-line evidence', async () => {
    const client = createClient([
      { role: 'assistant', content: 'The loop returns cited answers at trai_brain/mercury-bridge/react-loop.js:257-264.' },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    expect(result.termination).toBe('answer_given');
    expect(result.iterations).toBe(1);
    expect(result.answer).toContain('trai_brain/mercury-bridge/react-loop.js:257-264');
  });

  test('normalizes tool-handle citations before accepting a final answer', async () => {
    const client = createClient([
      { role: 'assistant', content: 'The code in `trai_brain/mercury-bridge/tool-adapter.js` is guarded 【open_file†L209-L221】.' },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('trai_brain/mercury-bridge/tool-adapter.js:209-221');
  });

  test('repairs final answers that still contain tool-handle citations', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The test passed here 【run_check†L1-L9】 and the gate is in trai_brain/mercury-bridge/react-loop.js:331-348.',
      },
      {
        role: 'assistant',
        content: 'The gate rejects tool handles at trai_brain/mercury-bridge/react-loop.js:331-348.',
      },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });
    const repairMessage = client.messageSnapshots[1].find((message) => (
      message.role === 'user' && message.content.includes('tool-handle citations')
    ));

    expect(repairMessage).toBeTruthy();
    expect(result.termination).toBe('answer_given');
    expect(result.answer).not.toContain('【run_check');
  });

  test('repairs run_check claims that do not cite the execution artifact', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The run_check result proves the suite failed, and the gate is in trai_brain/mercury-bridge/react-loop.js:331-348.',
      },
      {
        role: 'assistant',
        content: 'The suite failure is cited at ogz-meta/cognition-history/mercury-execution/run-tests.log:1-20 and the gate is in trai_brain/mercury-bridge/react-loop.js:331-348.',
      },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });
    const repairMessage = client.messageSnapshots[1].find((message) => (
      message.role === 'user' && message.content.includes('run_check result without citing')
    ));

    expect(repairMessage).toBeTruthy();
    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('ogz-meta/cognition-history/mercury-execution/run-tests.log:1-20');
  });

  test('repairs one uncited final answer before accepting cited proof', async () => {
    const client = createClient([
      { role: 'assistant', content: 'I could not break it.' },
      { role: 'assistant', content: 'I could not break it after reading trai_brain/mercury-bridge/react-loop.js:257-264.' },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    const repairMessage = client.messageSnapshots[1].at(-1);

    expect(result.termination).toBe('answer_given');
    expect(result.iterations).toBe(2);
    expect(repairMessage.role).toBe('user');
    expect(repairMessage.content).toContain('missing file:line citations');
    expect(repairMessage.content).toContain('path/to/file.js:123-130');
    expect(repairMessage.content).toContain('Tool-handle citations like `【open_file†L1-L2】`');
    expect(repairMessage.content).toContain('bare phrases like "lines 12-14" do not count');
  });

  test('fails closed when Mercury still returns uncited prose after repair', async () => {
    const client = createClient([
      { role: 'assistant', content: 'Looks good.' },
      { role: 'assistant', content: 'Still looks good.' },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    expect(result.termination).toBe('citation_missing');
    expect(result.answer).toContain('missing file:line citations');
    expect(result.answer).toContain('Rejected answer preview: Still looks good.');
  });

  test('repairs final answers that contradict successful tool execution', async () => {
    const client = createClient([
      {
        role: 'assistant',
        tool_calls: [{
          id: 'call-1',
          function: {
            name: 'git_diff',
            arguments: JSON.stringify({ target: 'current' }),
          },
        }],
      },
      {
        role: 'assistant',
        content: 'git_diff is not exposed to Mercury, so it cannot be invoked. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      },
      {
        role: 'assistant',
        content: 'git_diff was invoked successfully, so the availability claim is false. trai_brain/mercury-bridge/react-loop.js:253-259',
      },
    ]);
    const toolAdapter = createToolAdapter();
    toolAdapter.execute.mockResolvedValue({ files: ['CHANGELOG.md'] });

    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 4,
      verbose: false,
    });

    const repairMessage = client.messageSnapshots[2].at(-1);

    expect(result.termination).toBe('answer_given');
    expect(repairMessage.content).toContain('already executed git_diff successfully');
    expect(repairMessage.content).toContain('Do not claim a tool is unavailable after using it');
  });

  test('fails closed when Mercury repeats a tool availability contradiction after repair', async () => {
    const client = createClient([
      {
        role: 'assistant',
        tool_calls: [{
          id: 'call-1',
          function: {
            name: 'git_diff',
            arguments: JSON.stringify({ target: 'current' }),
          },
        }],
      },
      {
        role: 'assistant',
        content: 'git_diff is not exposed to Mercury. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      },
      {
        role: 'assistant',
        content: 'git_diff still cannot be invoked. trai_brain/mercury-bridge/tool-adapter.js:1006-1013',
      },
    ]);
    const toolAdapter = createToolAdapter();
    toolAdapter.execute.mockResolvedValue({ files: ['CHANGELOG.md'] });

    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 4,
      verbose: false,
    });

    expect(result.termination).toBe('self_contradiction');
    expect(result.answer).toContain('contradicted successful git_diff tool use');
  });

  test('repairs unsupported test outcome and conceptual proof claims', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The test fails. Conceptual reproduction, no additional evidence needed. test/mercury-index-scope.test.js:347-368',
      },
      {
        role: 'assistant',
        content: 'The exact runtime outcome cannot be proven from available tool results. test/mercury-index-scope.test.js:347-368',
      },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    const repairMessage = client.messageSnapshots[1].at(-1);

    expect(result.termination).toBe('answer_given');
    expect(repairMessage.content).toContain('Do not claim a test passes or fails unless a test-run tool result is in the history');
    expect(repairMessage.content).toContain('Do not use conceptual reproduction');
  });

  test('fails closed when unsupported proof claims repeat after repair', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The test fails. Conceptual reproduction, no additional evidence needed. test/mercury-index-scope.test.js:347-368',
      },
      {
        role: 'assistant',
        content: 'The test still fails. No additional evidence required. test/mercury-index-scope.test.js:347-368',
      },
    ]);

    const result = await runReactLoop({
      client,
      toolAdapter: createToolAdapter(),
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 3,
      verbose: false,
    });

    expect(result.termination).toBe('unsupported_proof_claim');
    expect(result.answer).toContain('unsupported test/conceptual proof claim');
  });

  test('loop-detection repair message does not pressure Mercury to rush', async () => {
    const repeatedToolCall = {
      id: 'call-1',
      function: {
        name: 'grep',
        arguments: JSON.stringify({ query: 'marker' }),
      },
    };
    const client = createClient([
      { role: 'assistant', tool_calls: [repeatedToolCall] },
      { role: 'assistant', tool_calls: [{ ...repeatedToolCall, id: 'call-2' }] },
      { role: 'assistant', tool_calls: [{ ...repeatedToolCall, id: 'call-3' }] },
      { role: 'assistant', content: 'Insufficient evidence after reading trai_brain/mercury-bridge/react-loop.js:199-210.' },
    ]);
    const toolAdapter = createToolAdapter();
    toolAdapter.execute.mockResolvedValue({ matches: [] });

    const result = await runReactLoop({
      client,
      toolAdapter,
      userQuery: 'Mercury, break my fix.',
      systemPrompt: 'test system',
      maxIterations: 5,
      verbose: false,
    });

    const loopRepairMessage = client.messageSnapshots[3].at(-1);

    expect(result.termination).toBe('answer_given');
    expect(loopRepairMessage.content).toContain('If that call cannot add new evidence');
    expect(loopRepairMessage.content).not.toMatch(/stop searching|provide your final answer now|hurry|rush/i);
  });
});
