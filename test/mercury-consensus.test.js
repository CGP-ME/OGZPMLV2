'use strict';

const {
  consensusRequested,
  parseConsensusAnswer,
  buildMercuryRecheckPrompt,
  formatAdversarialReviewPacket,
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
    expect(prompt).toContain('CONSENSUS_BLOCKING: yes | no');
    expect(prompt).toContain('RECHECK_PROMPT: <exact prompt to send Mercury next, or none>');
    expect(prompt).toContain('Mercury run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-01.jsonl:3');
    expect(prompt).toContain('open_file:1/1/0');
    expect(prompt).toContain('No concrete break found. core/Foo.js:10-12');
  });

  test('parses blocking Fable critiques into a Mercury recheck prompt', () => {
    const answer = [
      'VERDICT: needs_more_evidence',
      'CONSENSUS_BLOCKING: yes',
      'RATIONALE: Mercury did not cite the spawn site.',
      'DISAGREEMENT: Mercury claimed env cannot override P0 without citing execSync.',
      'REQUIRED_RECHECK: open ogz-meta/anchor-runner.js:188-197',
      'RECHECK_PROMPT: Mercury, recheck the P0 spawn env path. Open ogz-meta/anchor-runner.js:188-197 and prove whether process.env can override the P0 overlay.',
      'NEXT_CHECK: run parent-env proof command',
    ].join('\n');

    const parsed = parseConsensusAnswer(answer);
    expect(parsed).toMatchObject({
      verdict: 'needs_more_evidence',
      blocking: true,
      disagreement: 'Mercury claimed env cannot override P0 without citing execSync.',
      requiredRecheck: 'open ogz-meta/anchor-runner.js:188-197',
      nextCheck: 'run parent-env proof command',
    });
    expect(buildMercuryRecheckPrompt({
      originalQuery: 'Mercury, break my fix.',
      mercuryAnswer: 'No break found.',
      fableAnswer: answer,
      parsedConsensus: parsed,
    })).toBe('Mercury, recheck the P0 spawn env path. Open ogz-meta/anchor-runner.js:188-197 and prove whether process.env can override the P0 overlay.');
  });

  test('parses formatted blocking fields and fails closed when the field is missing', () => {
    expect(parseConsensusAnswer([
      '  **VERDICT:** agree',
      '  **CONSENSUS_BLOCKING:** yes',
      '  **RECHECK_PROMPT:** Mercury, recheck formatted fields.',
    ].join('\n'))).toMatchObject({
      verdict: 'agree',
      blocking: true,
      recheckPrompt: 'Mercury, recheck formatted fields.',
      parseWarnings: [],
    });

    expect(parseConsensusAnswer([
      'VERDICT: agree',
      'RATIONALE: forgot the blocking field',
      'RECHECK_PROMPT: none',
    ].join('\n'))).toMatchObject({
      verdict: 'agree',
      blocking: true,
      parseWarnings: ['missing_consensus_blocking_field'],
    });

    expect(parseConsensusAnswer('`CONSENSUS_BLOCKING`: yes')).toMatchObject({
      blocking: true,
      parseWarnings: ['missing_consensus_blocking_field'],
    });
    expect(parseConsensusAnswer('> CONSENSUS_BLOCKING: yes')).toMatchObject({
      blocking: true,
      parseWarnings: ['missing_consensus_blocking_field'],
    });
  });

  test('fallback Mercury recheck prompt carries parse warnings and full Fable critique', () => {
    const fableAnswer = [
      'VERDICT: agree',
      'RATIONALE: forgot the blocking field',
      'NEXT_CHECK: inspect parser behavior',
    ].join('\n');
    const parsed = parseConsensusAnswer(fableAnswer);

    const prompt = buildMercuryRecheckPrompt({
      originalQuery: 'Mercury, break my fix.',
      mercuryAnswer: 'No break found.',
      fableAnswer,
      parsedConsensus: parsed,
    });

    expect(prompt).toContain('Fable critique:');
    expect(prompt).toContain('forgot the blocking field');
    expect(prompt).toContain('Required recheck:');
    expect(prompt).toContain('inspect parser behavior');
  });

  test('builds a visible adversarial review packet with Mercury, Fable, and recheck data', () => {
    const packet = formatAdversarialReviewPacket({
      originalQuery: 'Mercury, break my fix.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 4,
        answer: 'No break found. core/Foo.js:1-2',
      },
      consensus: {
        answer: [
          'VERDICT: needs_more_evidence',
          'CONSENSUS_BLOCKING: yes',
          'DISAGREEMENT: Missing spawn-site proof.',
          'REQUIRED_RECHECK: inspect ogz-meta/anchor-runner.js:188-197',
          'RECHECK_PROMPT: Mercury, inspect the spawn site.',
          'NEXT_CHECK: none',
        ].join('\n'),
        parsed: {
          verdict: 'needs_more_evidence',
          blocking: true,
          disagreement: 'Missing spawn-site proof.',
          requiredRecheck: 'inspect ogz-meta/anchor-runner.js:188-197',
          recheckPrompt: 'Mercury, inspect the spawn site.',
          nextCheck: 'none',
        },
        recheckPrompt: 'Mercury, inspect the spawn site.',
        recheck: {
          termination: 'answer_given',
          iterations: 2,
          answer: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
        },
      },
    });

    expect(packet).toContain('1. ORIGINAL PROMPT');
    expect(packet).toContain('2. MERCURY PASS 1');
    expect(packet).toContain('3. FABLE ADVERSARIAL REVIEW');
    expect(packet).toContain('4. MERCURY RECHECK');
    expect(packet).toContain('Missing spawn-site proof.');
    expect(packet).toContain('Spawn site uses execSync');
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
      parsed: {
        verdict: 'agree',
        blocking: false,
      },
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
