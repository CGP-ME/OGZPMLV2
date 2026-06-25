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
  finalAnswerEvidenceFailures,
  summarizeToolTelemetry,
  formatToolTelemetry,
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
    expect(hasFileLineCitation('See src/services/order-router.ts:12-20.')).toBe(true);
    expect(hasFileLineCitation('See tools/audit_runner.py:44.')).toBe(true);
    expect(hasFileLineCitation('See internal/broker/router.go:101-119.')).toBe(true);
    expect(hasFileLineCitation('C:\\src\\file.js:12-20')).toBe(true);
    expect(hasFileLineCitation('See C:\\src\\ogz\\core\\router.ts:12-20.')).toBe(true);
    expect(hasFileLineCitation('See My Folder/core/router.ts:12-20.')).toBe(true);
    expect(hasFileLineCitation('This looks clean from the current evidence.')).toBe(false);
    expect(hasToolHandleCitation('See 【run_check†L1-L9】.')).toBe(true);
    expect(hasToolHandleCitation('See trai_brain/mercury-bridge/react-loop.js:257-264.')).toBe(false);
    expect(hasUnsupportedRunCheckClaim('The run_check result proves a test failed. test/foo.test.js:1-2')).toBe(true);
    expect(hasUnsupportedRunCheckClaim('The run_check helper is implemented at trai_brain/mercury-bridge/tool-adapter.js:1000-1040.')).toBe(false);
    expect(hasUnsupportedRunCheckClaim(
      'The run_check result is in ogz-meta/cognition-history/mercury-execution/2026-06-23T20-08-44-993Z-run-tests.log:1-20.'
    )).toBe(false);
  });

  test('tool-handle citation normalizer converts same-sentence repo path handles', () => {
    const normalized = normalizeToolHandleCitations(
      'The code in `trai brain\\mercury-bridge\\tool-adapter.ts` is guarded 【open_file†L209-L221】.'
    );

    expect(normalized).toContain('trai brain\\mercury-bridge\\tool-adapter.ts:209-221');
    expect(hasFileLineCitation(normalized)).toBe(true);
  });

  test('tool-handle citation normalizer converts same-paragraph repo path handles', () => {
    const normalized = normalizeToolHandleCitations(
      'The `mercury.config.json` file was updated to remove stale guidance. The relevant lines show the new wording and removal of the old phrase.【open_file†L65-L68】'
    );

    expect(normalized).toContain('mercury.config.json:65-68');
    expect(hasFileLineCitation(normalized)).toBe(true);
  });

  test('citation normalizer converts file plus lines prose into literal repo citations', () => {
    const normalized = normalizeToolHandleCitations(
      'File: `trai_brain/mercury-bridge/tool-adapter.py` Lines: 1073-1082'
    );

    expect(normalized).toBe('trai_brain/mercury-bridge/tool-adapter.py:1073-1082');
    expect(hasFileLineCitation(normalized)).toBe(true);
  });

  test('citation normalizer converts path lines prose into literal repo citations', () => {
    const normalized = normalizeToolHandleCitations(
      '`mercury.config.json` lines 68-69 show the new wording.'
    );

    expect(normalized).toContain('mercury.config.json:68-69');
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

  test('final answer evidence failures identify exact citation gate reasons', () => {
    expect(finalAnswerEvidenceFailures('Looks good.')).toEqual(['missing_file_line_citation']);
    expect(finalAnswerEvidenceFailures(
      'The gate is in trai_brain/mercury-bridge/react-loop.js:1-3 and the tool said 【open_file†L1-L3】.'
    )).toEqual(['tool_handle_citation']);
    expect(finalAnswerEvidenceFailures(
      'The run_check result proves it failed. trai_brain/mercury-bridge/react-loop.js:1-3'
    )).toEqual(['uncited_run_check_claim']);
    expect(finalAnswerEvidenceFailures(
      'The run_check artifact is ogz-meta/cognition-history/mercury-execution/check.log:1-9 and code is trai_brain/mercury-bridge/react-loop.js:1-3.'
    )).toEqual([]);
  });

  test('tool telemetry summarizes invocation count, success, failure, and evidence artifacts', () => {
    const telemetry = summarizeToolTelemetry([
      {
        toolName: 'grep',
        toolArgs: { query: 'marker' },
        toolResult: { matches: [{ file: 'core/foo.js', line: 7 }] },
      },
      {
        toolName: 'open_file',
        toolArgs: { path: 'core/foo.js', start_line: 7 },
        toolResult: { file: 'core/foo.js', start_line: 7, end_line: 12, text: '...' },
      },
      {
        toolName: 'run_check',
        toolArgs: { command: ['npx', '--no-install', 'jest'] },
        toolResult: {
          source: 'run_check',
          exit_code: 0,
          artifact_citation: 'ogz-meta/cognition-history/mercury-execution/focused.log:1-40',
        },
      },
      {
        toolName: 'run_check',
        toolArgs: { command: ['npx', '--no-install', 'jest', 'broken.test.js'] },
        toolResult: {
          source: 'run_check',
          exit_code: 1,
          artifact_citation: 'ogz-meta/cognition-history/mercury-execution/broken.log:1-40',
        },
      },
      {
        toolName: 'git_show',
        toolArgs: { ref: 'HEAD', path: 'missing.js' },
        toolResult: { error: 'git show failed' },
      },
      {
        toolName: 'open_file',
        toolArgs: { path: 'missing-result.js' },
        toolResult: null,
      },
    ]);

    expect(telemetry.total).toBe(6);
    expect(telemetry.succeeded).toBe(3);
    expect(telemetry.failed).toBe(3);
    expect(telemetry.byTool.open_file).toEqual({ calls: 2, succeeded: 1, failed: 1 });
    expect(telemetry.byTool.run_check).toEqual({ calls: 2, succeeded: 1, failed: 1 });
    expect(telemetry.byTool.git_show).toEqual({ calls: 1, succeeded: 0, failed: 1 });
    expect(telemetry.filesOpened).toEqual(['core/foo.js:7-12']);
    expect(telemetry.runCheckArtifacts).toEqual([
      'ogz-meta/cognition-history/mercury-execution/focused.log:1-40',
      'ogz-meta/cognition-history/mercury-execution/broken.log:1-40',
    ]);
    expect(telemetry.runChecks).toEqual([
      {
        profile: 'run_check',
        command: 'npx --no-install jest',
        exit_code: 0,
        signal: '',
        timed_out: false,
        status: 'passed',
        artifact_citation: 'ogz-meta/cognition-history/mercury-execution/focused.log:1-40',
        error: '',
      },
      {
        profile: 'run_check',
        command: 'npx --no-install jest broken.test.js',
        exit_code: 1,
        signal: '',
        timed_out: false,
        status: 'failed',
        artifact_citation: 'ogz-meta/cognition-history/mercury-execution/broken.log:1-40',
        error: '',
      },
    ]);
    expect(formatToolTelemetry(telemetry)).toContain('tool_calls=6');
    expect(formatToolTelemetry(telemetry)).toContain('run_check_artifacts=2');
    expect(formatToolTelemetry(telemetry)).toContain('run_checks=passed:run_check exit_code=0 artifact=ogz-meta/cognition-history/mercury-execution/focused.log:1-40');
    expect(formatToolTelemetry(telemetry)).toContain('failed:run_check exit_code=1 artifact=ogz-meta/cognition-history/mercury-execution/broken.log:1-40');
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
    expect(result.toolTelemetry).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      byTool: {},
      filesOpened: [],
      runCheckArtifacts: [],
      runChecks: [],
    });
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

  test('returns final answer with quality warnings when tool-handle citations remain', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The test passed here 【run_check†L1-L9】 and the gate is in trai_brain/mercury-bridge/react-loop.js:331-348.',
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

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('The test passed here');
    expect(result.answerQuality.flags).toEqual(expect.arrayContaining([
      'tool_handle_citation',
      'uncited_run_check_claim',
    ]));
    expect(client.messageSnapshots).toHaveLength(1);
  });

  test('returns final answer with quality warnings when run_check claims do not cite the execution artifact', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The run_check result proves the suite failed, and the gate is in trai_brain/mercury-bridge/react-loop.js:331-348.',
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

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('The run_check result proves the suite failed');
    expect(result.answerQuality.flags).toEqual(expect.arrayContaining(['uncited_run_check_claim']));
    expect(client.messageSnapshots).toHaveLength(1);
  });

  test('returns uncited final answer with quality warnings without coaching a retry', async () => {
    const client = createClient([
      { role: 'assistant', content: 'I could not break it.' },
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
    expect(result.answer).toBe('I could not break it.');
    expect(result.answerQuality.flags).toEqual(['missing_file_line_citation']);
    expect(client.messageSnapshots).toHaveLength(1);
  });

  test('returns uncited prose with quality warnings', async () => {
    const client = createClient([
      { role: 'assistant', content: 'Looks good.' },
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
    expect(result.answer).toBe('Looks good.');
    expect(result.answerQuality.flags).toEqual(['missing_file_line_citation']);
  });

  test('returns final answer with quality warning when it contradicts successful tool execution', async () => {
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

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('git_diff is not exposed to Mercury');
    expect(result.answerQuality.flags).toEqual(expect.arrayContaining([
      'tool_availability_contradiction:git_diff',
    ]));
  });

  test('returns final answer with quality warning when Mercury claims an already-used tool is unavailable', async () => {
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

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('git_diff is not exposed to Mercury');
    expect(result.answerQuality.flags).toEqual(expect.arrayContaining([
      'tool_availability_contradiction:git_diff',
    ]));
  });

  test('returns final answer with quality warnings on unsupported test outcome and conceptual proof claims', async () => {
    const client = createClient([
      {
        role: 'assistant',
        content: 'The test fails. Conceptual reproduction, no additional evidence needed. test/mercury-index-scope.test.js:347-368',
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

    expect(result.termination).toBe('answer_given');
    expect(result.answer).toContain('The test fails');
    expect(result.answerQuality.flags).toEqual(expect.arrayContaining([
      'unsupported_test_outcome_claim',
      'conceptual_proof_claim',
    ]));
    expect(client.messageSnapshots).toHaveLength(1);
  });

  test('repeated tool calls continue without bridge synthesis coaching', async () => {
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

    expect(result.termination).toBe('answer_given');
    expect(toolAdapter.execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(client.messageSnapshots)).not.toMatch(/repeating the same tool call|synthesize|hurry|rush/i);
  });
});
