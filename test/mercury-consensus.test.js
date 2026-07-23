'use strict';

const {
  adversarialReviewRequested,
  reviewModeRequested,
  consensusRequested,
  parseConsensusAnswer,
  buildMercuryRecheckPrompt,
  buildMercuryRecheckPrompts,
  formatAdversarialReviewPacket,
  buildConsensusPrompt,
  runFableConsensus,
  consensusFailure,
  normalizeReviewIntent,
} = require('../trai_brain/mercury-bridge/consensus');
const { parseArgs, buildMercuryIntentPrompt } = require('../trai_brain/mercury-bridge/ask');

describe('Mercury Fable consensus', () => {
  test('CLI adversarial review flags expose explicit controls while preserving consensus aliases', () => {
    expect(parseArgs(['node', 'ask.js', '--agentic', 'break this'])).toMatchObject({
      agentic: true,
      adversarialReview: false,
      adversarialReviewExplicit: false,
      consensus: false,
      consensusExplicit: false,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--adversarial-review', 'break this'])).toMatchObject({
      adversarialReview: true,
      adversarialReviewExplicit: true,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--no-adversarial-review', 'break this'])).toMatchObject({
      adversarialReview: false,
      adversarialReviewExplicit: true,
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

    expect(parseArgs(['node', 'ask.js', '--agentic', '--architecture', 'review the system'])).toMatchObject({
      agentic: true,
      reviewIntent: 'architecture',
      query: 'review the system',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--planning', 'plan the lane'])).toMatchObject({
      agentic: true,
      reviewIntent: 'planning',
      query: 'plan the lane',
    });
  });

  test('consensusRequested honors explicit run flag over config default', () => {
    expect(consensusRequested({ consensusExplicit: true, consensus: true })).toBe(true);
    expect(consensusRequested({ consensusExplicit: true, consensus: false })).toBe(false);
    expect(consensusRequested({})).toBe(false);
    expect(adversarialReviewRequested({ adversarialReviewExplicit: true, adversarialReview: true })).toBe(true);
    expect(adversarialReviewRequested({ adversarialReviewExplicit: true, adversarialReview: false })).toBe(false);
    expect(reviewModeRequested({ adversarialReviewExplicit: true, adversarialReview: true })).toBe('adversarial_review');
    expect(reviewModeRequested({ consensusExplicit: true, consensus: true })).toBe('consensus');
  });

  test('malformed MERCURY_ADVERSARIAL_REVIEW env does not crash review selection', () => {
    const previous = process.env.MERCURY_ADVERSARIAL_REVIEW;
    try {
      process.env.MERCURY_ADVERSARIAL_REVIEW = '';
      expect(() => adversarialReviewRequested({})).not.toThrow();
      expect(adversarialReviewRequested({})).toBe(false);

      process.env.MERCURY_ADVERSARIAL_REVIEW = 'maybe';
      expect(() => adversarialReviewRequested({})).not.toThrow();
      expect(adversarialReviewRequested({})).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.MERCURY_ADVERSARIAL_REVIEW;
      } else {
        process.env.MERCURY_ADVERSARIAL_REVIEW = previous;
      }
    }
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

    expect(prompt).toContain('READ-ONLY AUDIT. Do not edit code.');
    expect(prompt).toContain('You do not have repo tools');
    expect(prompt).toContain('Do not invent file:line citations');
    expect(prompt).toContain('CONSENSUS_BLOCKING: yes | no');
    expect(prompt).toContain('RECHECK_PROMPT: <exact prompt to send Mercury next, or none>');
    expect(prompt).toContain('Mercury run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-01.jsonl:3');
    expect(prompt).toContain('open_file:1/1/0');
    expect(prompt).toContain('No concrete break found. core/Foo.js:10-12');
  });

  test('architecture mode changes Mercury framing and Fable output contract', () => {
    expect(normalizeReviewIntent('architecture')).toBe('architecture');
    expect(normalizeReviewIntent('planning')).toBe('planning');
    expect(normalizeReviewIntent('')).toBe('adversarial');

    const mercuryPrompt = buildMercuryIntentPrompt('Design the engineering runtime.', 'architecture');
    expect(mercuryPrompt).toContain('MERCURY ARCHITECTURE MODE');
    expect(mercuryPrompt).toContain('not a break-my-fix verdict run');
    expect(mercuryPrompt).toContain('Design the engineering runtime.');

    const prompt = buildConsensusPrompt({
      query: 'Design the engineering runtime.',
      reviewIntent: 'architecture',
      runLedgerCitation: 'ogz-meta/cognition-history/mercury-runs/2026-07-23.jsonl:1',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 4,
        answer: 'Architecture proposal with evidence.',
        toolTelemetry: {
          byTool: { open_file: { calls: 1, succeeded: 1, failed: 0 } },
          filesOpened: ['run-empire-v2.js:1-5'],
          runCheckArtifacts: [],
          runChecks: [],
        },
      },
    });

    expect(prompt).toContain('READ-ONLY ARCHITECTURE REVIEW');
    expect(prompt).toContain('evolved Mercury+Fable architecture report');
    expect(prompt).toContain('EVOLVED_ARCHITECTURE');
    expect(prompt).not.toContain('CONSENSUS_BLOCKING: yes | no');
    expect(prompt).not.toContain('RECHECK_PROMPT: <exact prompt to send Mercury next, or none>');
  });

  test('planning mode changes Mercury framing and Fable output contract', () => {
    const mercuryPrompt = buildMercuryIntentPrompt('Plan this migration.', 'planning');
    expect(mercuryPrompt).toContain('MERCURY PLANNING MODE');
    expect(mercuryPrompt).toContain('implementation plan');

    const prompt = buildConsensusPrompt({
      query: 'Plan this migration.',
      reviewIntent: 'planning',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 2,
        answer: 'Plan with caveats.',
      },
    });

    expect(prompt).toContain('READ-ONLY PLANNING REVIEW');
    expect(prompt).toContain('IMPLEMENTATION_PLAN');
    expect(prompt).toContain('ROLLBACK_PLAN');
    expect(prompt).not.toContain('CONSENSUS_BLOCKING: yes | no');
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
      parseWarnings: ['missing_adversarial_review_blocking_field'],
    });

    expect(parseConsensusAnswer('`CONSENSUS_BLOCKING`: yes')).toMatchObject({
      blocking: true,
      parseWarnings: ['missing_adversarial_review_blocking_field'],
    });
    expect(parseConsensusAnswer('> CONSENSUS_BLOCKING: yes')).toMatchObject({
      blocking: true,
      parseWarnings: ['missing_adversarial_review_blocking_field'],
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
    expect(prompt).toContain('READ-ONLY AUDIT. Do not edit code.');
    expect(prompt).toContain('forgot the blocking field');
    expect(prompt).toContain('Required recheck:');
    expect(prompt).toContain('inspect parser behavior');
  });

  test('splits multiple Fable recheck prompts so caller can cap them at two', () => {
    const parsed = parseConsensusAnswer([
      'VERDICT: needs_more_evidence',
      'CONSENSUS_BLOCKING: yes',
      'RECHECK_PROMPT: - Mercury, recheck file A.',
      '- Mercury, recheck file B.',
      '- Mercury, recheck file C.',
    ].join('\n'));

    const prompts = buildMercuryRecheckPrompts({
      originalQuery: 'Mercury, break my fix.',
      mercuryAnswer: 'No break found.',
      fableAnswer: 'critique',
      parsedConsensus: parsed,
    });

    expect(prompts).toEqual([
      'Mercury, recheck file A.',
      'Mercury, recheck file B.',
      'Mercury, recheck file C.',
    ]);
    expect(prompts.slice(0, 2)).toHaveLength(2);
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
        recheckPrompts: ['Mercury, inspect the spawn site.'],
        rechecks: [{
          termination: 'answer_given',
          iterations: 2,
          answer: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
        }],
      },
    });

    expect(packet).toContain('1. Original Prompt');
    expect(packet).toContain('2. Mercury Pass 1');
    expect(packet).toContain('3. Fable Review');
    expect(packet).toContain('4. Mercury Recheck');
    expect(packet).toContain('5. Final Resolution');
    expect(packet).toContain('Missing spawn-site proof.');
    expect(packet).toContain('Spawn site uses execSync');
  });

  test('architecture packet is synthesis-oriented and does not require Mercury rechecks', () => {
    const packet = formatAdversarialReviewPacket({
      reviewIntent: 'architecture',
      originalQuery: 'Design the runtime.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 3,
        answer: 'Mercury architecture pass.',
      },
      consensus: {
        answer: [
          'VERDICT: architecture_synthesis',
          'MERCURY_CRITIQUE: too thin',
          'EVOLVED_ARCHITECTURE: event-sourced runtime',
        ].join('\n'),
        parsed: {
          verdict: 'architecture_synthesis',
          blocking: true,
        },
      },
    });

    expect(packet).toContain('MODE: architecture');
    expect(packet).toContain('VERDICT: synthesis');
    expect(packet).toContain('Fable Synthesis Review');
    expect(packet).toContain('architecture_synthesis_complete');
    expect(packet).not.toContain('Mercury Recheck');
    expect(packet).not.toContain('needs_more_evidence');
  });

  test('runFableConsensus uses an injected client and does not require a real provider call', async () => {
    const calls = [];
    const fakeClient = {
      initialize: jest.fn(async () => {
        calls.push('initialize');
      }),
      generateResponse: jest.fn(async (prompt, maxTokens) => {
        calls.push(['generateResponse', maxTokens, prompt.includes('Mercury answer:')]);
        return 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nRATIONALE: evidence is cited.\nDISAGREEMENT: none\nREQUIRED_RECHECK: none\nRECHECK_PROMPT: none\nNEXT_CHECK: none';
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
      provider: 'openai',
      model: 'kimi-k3',
      latencyMs: 250,
      parsed: {
        verdict: 'pass',
        blocking: false,
      },
    });
    expect(result.answer).toContain('VERDICT: pass');
  });

  test('consensusFailure preserves visible error metadata', () => {
    expect(consensusFailure(new Error('quota exceeded'))).toMatchObject({
      enabled: true,
      mode: 'adversarial_review',
      ok: false,
      provider: 'openai',
      model: 'kimi-k3',
      error: {
        name: 'Error',
        message: 'quota exceeded',
      },
    });
  });
});
