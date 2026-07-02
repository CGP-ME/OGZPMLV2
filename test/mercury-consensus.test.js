'use strict';

const {
  consensusRequested,
  buildConsensusPrompt,
  runFableConsensus,
  consensusFailure,
} = require('../trai_brain/mercury-bridge/consensus');
const { parseArgs } = require('../trai_brain/mercury-bridge/ask');

describe('Mercury Fable consensus', () => {
  test('CLI consensus flags expose default-on consensus and explicit opt-out', () => {
    expect(parseArgs(['node', 'ask.js', '--agentic', 'break this'])).toMatchObject({
      agentic: true,
      consensus: false,
      consensusExplicit: false,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--consensus', 'break this'])).toMatchObject({
      consensus: true,
      consensusExplicit: true,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--no-consensus', 'break this'])).toMatchObject({
      consensus: false,
      consensusExplicit: true,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--check-providers'])).toMatchObject({
      checkProviders: true,
      query: '',
    });
  });

  test('consensusRequested honors explicit run flag over config default', () => {
    expect(consensusRequested({ consensusExplicit: true, consensus: true })).toBe(true);
    expect(consensusRequested({ consensusExplicit: true, consensus: false })).toBe(false);
    expect(consensusRequested({})).toBe(true);
  });

  test('buildConsensusPrompt fences Fable to Mercury evidence instead of fresh claims', () => {
    const prompt = buildConsensusPrompt({
      query: 'Mercury, break my fix.',
      runLedgerCitation: 'ogz-meta/cognition-history/mercury-runs/2026-07-01.jsonl:3',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 4,
        answer: 'No concrete break found. core/Foo.js:10-12',
        toolTelemetry: {
          byTool: {
            open_file: { calls: 1, succeeded: 1, failed: 0 },
          },
          filesOpened: ['core/Foo.js:10-12'],
          runCheckArtifacts: [],
          runChecks: [],
        },
      },
    });

    expect(prompt).toContain('You do not have repo tools');
    expect(prompt).toContain('Do not invent file:line citations');
    expect(prompt).toContain('Mercury run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-01.jsonl:3');
    expect(prompt).toContain('open_file:1/1/0');
    expect(prompt).toContain('No concrete break found. core/Foo.js:10-12');
  });

  test('runFableConsensus uses an injected client and does not require a real provider call', async () => {
    const calls = [];
    const fakeClient = {
      initialize: jest.fn(async () => {
        calls.push('initialize');
      }),
      generateResponse: jest.fn(async (prompt, maxTokens) => {
        calls.push(['generateResponse', maxTokens, prompt.includes('Mercury answer:')]);
        return 'VERDICT: agree\nCONSENSUS_BLOCKING: no\nRATIONALE: evidence is cited.\nGAPS: none\nNEXT_CHECK: none';
      }),
    };

    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 1,
        answer: 'No concrete break found. core/Foo.js:1-2',
      },
      createClient: jest.fn(() => fakeClient),
      now: jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1250),
    });

    expect(calls).toEqual([
      'initialize',
      ['generateResponse', 2000, true],
    ]);
    expect(result).toMatchObject({
      enabled: true,
      ok: true,
      provider: 'claude-code',
      model: 'claude-fable-5',
      latencyMs: 250,
    });
    expect(result.answer).toContain('VERDICT: agree');
  });

  test('consensusFailure preserves visible error metadata', () => {
    expect(consensusFailure(new Error('quota exceeded'))).toMatchObject({
      enabled: true,
      ok: false,
      provider: 'claude-code',
      model: 'claude-fable-5',
      error: {
        name: 'Error',
        message: 'quota exceeded',
      },
    });
  });
});
