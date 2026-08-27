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
  buildKimiFinalAdjudicationPrompt,
  runFableConsensus,
  runKimiFinalConsensus,
  consensusFailure,
  normalizeReviewIntent,
} = require('../trai_brain/mercury-bridge/consensus');
const {
  OPUS_ELIGIBLE_CLAUDE_CODES,
  kimiTieBreakerRequired,
  classifyFableFallbackError,
  executePromptOnlyStage,
} = require('../trai_brain/mercury-bridge/adversarial-review');
const { parseArgs, buildMercuryIntentPrompt } = require('../trai_brain/mercury-bridge/ask');

function trustedFableMetadata(overrides = {}) {
  return {
    provider: 'claude-code',
    requestedModel: 'fable',
    appliedModel: 'claude-fable-5',
    appliedModels: ['claude-fable-5'],
    authStatus: { authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' },
    executableTrust: {
      trusted: true,
      realpath: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
      version: '2.1.236',
    },
    ...overrides,
  };
}

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
    expect(consensusRequested({ consensusExplicit: true, consensus: false })).toBe(true);
    expect(consensusRequested({ adversarialReviewExplicit: true, adversarialReview: false, consensusExplicit: true, consensus: false })).toBe(false);
    expect(consensusRequested({})).toBe(true);
    expect(adversarialReviewRequested({ adversarialReviewExplicit: true, adversarialReview: true })).toBe(true);
    expect(adversarialReviewRequested({ adversarialReviewExplicit: true, adversarialReview: false })).toBe(false);
    expect(reviewModeRequested({ adversarialReviewExplicit: true, adversarialReview: true })).toBe('adversarial_review');
    expect(reviewModeRequested({ adversarialReviewExplicit: true, adversarialReview: false, consensusExplicit: true, consensus: true })).toBe('consensus');
  });

  test('malformed MERCURY_ADVERSARIAL_REVIEW env does not crash review selection', () => {
    const previous = process.env.MERCURY_ADVERSARIAL_REVIEW;
    try {
      process.env.MERCURY_ADVERSARIAL_REVIEW = '';
      expect(() => adversarialReviewRequested({})).not.toThrow();
      expect(adversarialReviewRequested({})).toBe(true);

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
      'DISAGREEMENT: Mercury claimed env cannot override the worker overlay without citing execSync.',
      'REQUIRED_RECHECK: open core/OrderExecutor.js:1-2',
      'RECHECK_PROMPT: Mercury, recheck the worker spawn env path. Open core/OrderExecutor.js:1-2 and prove whether process.env can override the worker overlay.',
      'NEXT_CHECK: run parent-env proof command',
    ].join('\n');

    const parsed = parseConsensusAnswer(answer);
    expect(parsed).toMatchObject({
      verdict: 'needs_more_evidence',
      blocking: true,
      disagreement: 'Mercury claimed env cannot override the worker overlay without citing execSync.',
      requiredRecheck: 'open core/OrderExecutor.js:1-2',
      nextCheck: 'run parent-env proof command',
    });
    expect(buildMercuryRecheckPrompt({
      originalQuery: 'Mercury, break my fix.',
      mercuryAnswer: 'No break found.',
      fableAnswer: answer,
      parsedConsensus: parsed,
    })).toBe('Mercury, recheck the worker spawn env path. Open core/OrderExecutor.js:1-2 and prove whether process.env can override the worker overlay.');
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

  test('parses adjudicator tape fields before verdict and warns on pass contradictions', () => {
    const parsed = parseConsensusAnswer([
      'CONSENSUS: Mercury and Fable both cite core/Foo.js:1-2.',
      'CONTRADICTIONS: Mercury says no reachable state; Fable says core/Foo.js:2 remains reachable.',
      'PARTIAL: Mercury alone checked test/Foo.test.js:5.',
      'UNIQUE: Fable surfaced missing producer census in core/Foo.js:3.',
      'BLIND_SPOTS: neither reporter checked journal persistence.',
      'DISAGREEMENT: reachability remains disputed.',
      'CONSENSUS_BLOCKING: no',
      'REQUIRED_RECHECKS: Mercury, inspect core/Foo.js:1-3.',
      'RECHECK_PROMPT: Mercury, inspect the disputed reachability path.',
      'VERDICT: pass',
    ].join('\n'));

    expect(parsed).toMatchObject({
      consensus: 'Mercury and Fable both cite core/Foo.js:1-2.',
      contradictions: 'Mercury says no reachable state; Fable says core/Foo.js:2 remains reachable.',
      partial: 'Mercury alone checked test/Foo.test.js:5.',
      unique: 'Fable surfaced missing producer census in core/Foo.js:3.',
      blindSpots: 'neither reporter checked journal persistence.',
      disagreement: 'reachability remains disputed.',
      requiredRecheck: 'Mercury, inspect core/Foo.js:1-3.',
      recheckPrompt: 'Mercury, inspect the disputed reachability path.',
      verdict: 'pass',
      blocking: true,
      parseWarnings: ['pass_with_contradictions'],
    });
  });

  test('meaningful disagreement blocks even when model claims non-blocking', () => {
    expect(parseConsensusAnswer([
      'VERDICT: agree',
      'CONSENSUS_BLOCKING: no',
      'DISAGREEMENT: Mercury did not prove the run_check artifact.',
      'RECHECK_PROMPT: Mercury, recheck the artifact.',
    ].join('\n'))).toMatchObject({
      verdict: 'agree',
      blocking: true,
      disagreement: 'Mercury did not prove the run_check artifact.',
      parseWarnings: [],
    });

    expect(parseConsensusAnswer([
      'VERDICT: agree',
      'CONSENSUS_BLOCKING: no',
      'DISAGREEMENT: none',
      'RECHECK_PROMPT: none',
    ].join('\n'))).toMatchObject({
      verdict: 'agree',
      blocking: false,
      disagreement: 'none',
      parseWarnings: [],
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
          'REQUIRED_RECHECK: inspect core/OrderExecutor.js:1-2',
          'RECHECK_PROMPT: Mercury, inspect the spawn site.',
          'NEXT_CHECK: none',
        ].join('\n'),
        parsed: {
          verdict: 'needs_more_evidence',
          blocking: true,
          disagreement: 'Missing spawn-site proof.',
          requiredRecheck: 'inspect core/OrderExecutor.js:1-2',
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
        finalReview: {
          mode: 'kimi_final_adjudication',
          ok: true,
          answer: [
            'FINAL_VERDICT: models_disagree',
            'FINAL_BLOCKING: yes',
            'SHARED_CONCLUSION: none',
            'MERCURY_SUPPORTED: recheck cites execSync evidence',
            'FABLE_SUPPORTED: initial answer missed spawn-site proof',
            'KIMI_SUPPORTED: no shared conclusion',
            'CITED_REASONING: the supplied answers disagree',
            'NEXT_CHECK: operator adjudication',
          ].join('\n'),
          parsed: {
            verdict: 'models_disagree',
            blocking: true,
            sharedConclusion: 'none',
            mercurySupported: 'recheck cites execSync evidence',
            fableSupported: 'initial answer missed spawn-site proof',
            kimiSupported: 'no shared conclusion',
            citedReasoning: 'the supplied answers disagree',
            nextCheck: 'operator adjudication',
          },
        },
      },
    });

    expect(packet).toContain('1. Original Prompt');
    expect(packet).toContain('2. Mercury Pass 1');
    expect(packet).toContain('3. Fable Review');
    expect(packet).toContain('4. Mercury Recheck');
    expect(packet).toContain('5. Kimi Final Adjudication');
    expect(packet).toContain('6. Final Resolution');
    expect(packet).toContain('models_disagree');
    expect(packet).toContain('Mercury supported:');
    expect(packet).toContain('Missing spawn-site proof.');
    expect(packet).toContain('Spawn site uses execSync');
  });

  test('buildKimiFinalAdjudicationPrompt demands cited per-model support on disagreement', () => {
    const prompt = buildKimiFinalAdjudicationPrompt({
      query: 'Mercury, break my fix.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 2,
        answer: 'No break found. core/Foo.js:1-2',
        answerQuality: {
          flags: ['missing_file_line_citation'],
          evidence: [{ flag: 'missing_file_line_citation', evidence: 'no file:line citation anywhere in the final answer' }],
        },
        toolTelemetry: {
          byTool: { open_file: { calls: 1, succeeded: 1, failed: 0 } },
          filesOpened: ['core/Foo.js:1-2'],
          runCheckArtifacts: [],
          runChecks: [],
        },
      },
      review: {
        answer: 'VERDICT: needs_more_evidence\nCONSENSUS_BLOCKING: yes\nDISAGREEMENT: missing proof',
        parsed: { verdict: 'needs_more_evidence', blocking: true },
        rechecks: [{ termination: 'answer_given', iterations: 1, answer: 'Still no proof.' }],
        recheckPrompts: ['Mercury, recheck proof.'],
      },
    });

    expect(prompt).toContain('READ-ONLY FINAL ADJUDICATION');
    expect(prompt).toContain('You are Kimi, the reasoning adjudicator');
    expect(prompt).toContain('CONSENSUS: claims all reporters agree on, with citations, or none');
    expect(prompt).toContain('CONTRADICTIONS: reporter disagreements with each position and repo-supported resolution, or none');
    expect(prompt).toContain('BLIND_SPOTS: required question areas no reporter addressed, or none');
    expect(prompt).toContain('VERDICT: pass | disagree | needs_more_evidence');
    expect(prompt.indexOf('CONSENSUS: claims all reporters agree on')).toBeLessThan(prompt.indexOf('VERDICT: pass | disagree | needs_more_evidence'));
    expect(prompt).toContain('Mercury answer quality flags: missing_file_line_citation');
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
      maxTokens: 2000,
      initialize: jest.fn(async () => {
        calls.push('initialize');
      }),
      generateResponseWithMetadata: jest.fn(async (prompt, maxTokens) => {
        calls.push(['generateResponseWithMetadata', maxTokens, prompt.includes('Mercury answer:')]);
        return {
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nRATIONALE: evidence is cited.\nDISAGREEMENT: none\nREQUIRED_RECHECK: none\nRECHECK_PROMPT: none\nNEXT_CHECK: none',
          metadata: {
            provider: 'claude-code', requestedModel: 'fable', appliedModel: 'claude-fable-5',
            startedAt: '2026-08-27T00:00:00.000Z', finishedAt: '2026-08-27T00:00:00.100Z',
            latencyMs: 100, termination: 'success', parseStatus: 'parsed', rawResponse: Buffer.from('raw-fable'),
          },
        };
      }),
    };

    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 1,
        answer: 'No concrete break found. core/Foo.js:1-2',
      },
      createFableClient: jest.fn(() => fakeClient),
      persistRaw: jest.fn(() => ({ path: 'raw', sha256: 'abc', bytes: 9, mode: '0600' })),
      now: jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1250),
    });

    expect(calls).toEqual([
      'initialize',
      ['generateResponseWithMetadata', 2000, true],
    ]);
    expect(result).toMatchObject({
      enabled: true,
      ok: true,
      provider: 'claude-code',
      model: 'fable',
      appliedModel: 'claude-fable-5',
      latencyMs: 250,
      parsed: {
        verdict: 'pass',
        blocking: false,
      },
    });
    expect(result.answer).toContain('VERDICT: pass');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      role: 'fable_challenger',
      requested_model: 'fable',
      applied_model: 'claude-fable-5',
      applied_models: ['claude-fable-5'],
      tools: { enabled: false, total: 0, calls: [] },
      files_mechanically_opened: [],
      repo_adjudication: { status: 'pending' },
    });
  });

  test('runKimiFinalConsensus uses an injected client and parses models_disagree', async () => {
    const fakeClient = {
      maxTokens: 2000,
      initialize: jest.fn(async () => {}),
      generateResponseWithMetadata: jest.fn(async () => ({
        answer: [
          'FINAL_VERDICT: models_disagree',
          'FINAL_BLOCKING: yes',
          'SHARED_CONCLUSION: none',
          'MERCURY_SUPPORTED: no break claim',
          'FABLE_SUPPORTED: missing proof challenge',
          'KIMI_SUPPORTED: disagreement remains',
          'CITED_REASONING: supplied evidence does not converge',
          'NEXT_CHECK: operator adjudication',
        ].join('\n'),
        metadata: {
          provider: 'openai', requestedModel: 'kimi-k3', appliedModel: 'kimi-k3-202608',
          startedAt: '2026-08-27T00:00:00.000Z', finishedAt: '2026-08-27T00:00:00.100Z',
          latencyMs: 100, termination: 'stop', parseStatus: 'parsed', rawResponse: Buffer.from('raw-kimi'),
        },
      })),
    };

    const result = await runKimiFinalConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: {
        termination: 'answer_given',
        iterations: 1,
        answer: 'No concrete break found. core/Foo.js:1-2',
      },
      review: {
        answer: 'VERDICT: needs_more_evidence\nCONSENSUS_BLOCKING: yes',
        parsed: { verdict: 'needs_more_evidence', blocking: true },
      },
      createClient: jest.fn(() => fakeClient),
      persistRaw: jest.fn(() => ({ path: 'raw', sha256: 'abc', bytes: 8, mode: '0600' })),
      now: jest.fn()
        .mockReturnValueOnce(2000)
        .mockReturnValueOnce(2400),
    });

    expect(fakeClient.generateResponseWithMetadata).toHaveBeenCalledWith(expect.stringContaining('Kimi'), 2000);
    expect(result).toMatchObject({
      mode: 'kimi_final_adjudication',
      ok: true,
      provider: 'openai',
      model: 'kimi-k3',
      appliedModel: 'kimi-k3-202608',
      latencyMs: 400,
      parsed: {
        verdict: 'models_disagree',
        blocking: true,
        mercurySupported: 'no break claim',
        fableSupported: 'missing proof challenge',
        kimiSupported: 'disagreement remains',
      },
    });
  });

  test('Fable falls back to Opus only on allowlisted machine-observable unavailability', async () => {
    const fableError = new Error('Claude Code exited');
    fableError.providerMetadata = trustedFableMetadata({
      startedAt: '2026-08-27T00:00:00.000Z', finishedAt: '2026-08-27T00:00:00.010Z',
      latencyMs: 10, termination: 'provider_error', parseStatus: 'parsed', rawResponse: Buffer.from('fable-raw'),
      providerFrames: [{ type: 'result', is_error: true, error: { type: 'rate_limit_error' } }],
    });
    const failedFable = {
      maxTokens: 2000,
      initialize: jest.fn(async () => {}),
      generateResponseWithMetadata: jest.fn(async () => { throw fableError; }),
    };
    const opus = {
      maxTokens: 2000,
      initialize: jest.fn(async () => {}),
      generateResponseWithMetadata: jest.fn(async () => ({
        answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nDISAGREEMENT: none',
        metadata: {
          provider: 'claude-code', requestedModel: 'opus', appliedModel: 'claude-opus-4-1',
          startedAt: '2026-08-27T00:00:00.020Z', finishedAt: '2026-08-27T00:00:00.030Z',
          latencyMs: 10, termination: 'success', parseStatus: 'parsed', rawResponse: Buffer.from('opus-raw'),
        },
      })),
    };
    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => failedFable,
      createOpusClient: () => opus,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 8, mode: '0600' }),
    });
    expect(result.model).toBe('opus');
    expect(result.appliedModel).toBe('claude-opus-4-1');
    expect(result.attempts.map(attempt => attempt.role)).toEqual(['fable_challenger', 'opus_challenger']);
    expect(result.attempts[0].fallback_classification).toMatchObject({ opusEligible: true, category: 'rate_limit_error' });
  });

  test('Opus eligibility is limited to the enumerated provider codes and exact HTTP signals', () => {
    expect(Array.from(OPUS_ELIGIBLE_CLAUDE_CODES)).toEqual([
      'rate_limit_error',
      'rate_limit_exceeded',
      'usage_limit_reached',
      'model_unavailable',
      'model_not_found',
      'overloaded_error',
    ]);
    for (const code of OPUS_ELIGIBLE_CLAUDE_CODES) {
      const error = new Error('Claude Code exited');
      error.providerMetadata = trustedFableMetadata({
        providerFrames: [{ type: 'result', is_error: true, error: { type: code } }],
      });
      expect(classifyFableFallbackError(error)).toMatchObject({ opusEligible: true, category: code });
    }
    for (const statusCode of [429, 503]) {
      const error = new Error('Claude Code exited');
      error.providerMetadata = trustedFableMetadata({
        providerFrames: [{ type: 'result', is_error: true, api_error_status: statusCode }],
      });
      expect(classifyFableFallbackError(error).opusEligible).toBe(true);
    }
    const ambiguous = new Error('rate limit maybe');
    ambiguous.providerMetadata = trustedFableMetadata({
      rawError: Buffer.from('HTTP 429 rate limit maybe'), providerFrames: [],
    });
    expect(classifyFableFallbackError(ambiguous)).toMatchObject({
      opusEligible: false,
      evidence: 'no_allowlisted_machine_signal',
    });
  });

  test('bare, nested, success-frame, malformed, and identity-less allowlisted tokens cannot invoke Opus', () => {
    const rejectedFrames = [
      [{ type: 'model_unavailable' }],
      [{ payload: { type: 'overloaded_error' } }],
      [{ type: 'result', subtype: 'success', is_error: false, error: { type: 'rate_limit_error' } }],
      [{ type: 'result', is_error: true, payload: { error: { code: 'model_not_found' } } }],
      [{ type: 'result', is_error: true, error: { type: 'authentication_error', code: 'model_unavailable' } }],
      [{ type: 'result', is_error: true, error: { type: 'authentication_error' }, api_error_status: 429 }],
      [{ type: 'result', is_error: true, error: { type: 'rate_limit_error' }, api_error_status: 401 }],
      [{ type: 'result', is_error: true, api_error_status: '429' }],
      [
        { type: 'result', is_error: true, error: { type: 'model_unavailable' } },
        { type: 'result', subtype: 'success', is_error: false, result: 'PROVIDER_OK' },
      ],
    ];
    for (const providerFrames of rejectedFrames) {
      const error = new Error('Claude Code exited');
      error.providerMetadata = trustedFableMetadata({ providerFrames });
      expect(classifyFableFallbackError(error)).toMatchObject({
        opusEligible: false,
        evidence: 'no_allowlisted_machine_signal',
      });
    }

    for (const overrides of [
      { appliedModel: null },
      { appliedModel: 'claude-sonnet-4-5' },
      { executableTrust: null },
      { authStatus: { authMethod: 'apiKey', apiProvider: 'firstParty' } },
    ]) {
      const error = new Error('Claude Code exited');
      error.providerMetadata = trustedFableMetadata({
        ...overrides,
        providerFrames: [{ type: 'result', is_error: true, error: { type: 'rate_limit_error' } }],
      });
      expect(classifyFableFallbackError(error)).toMatchObject({
        opusEligible: false,
        category: 'untrusted_provider_error',
      });
    }
  });

  test('both Fable and Opus unavailable fail loud with ordered attempts before Kimi', async () => {
    const fableError = new Error('Fable unavailable');
    fableError.providerMetadata = trustedFableMetadata({
      rawResponse: Buffer.from('fable failure'),
      providerFrames: [{ type: 'result', is_error: true, error: { type: 'model_unavailable' } }],
    });
    const opusError = new Error('Opus unavailable');
    opusError.providerMetadata = {
      provider: 'claude-code', requestedModel: 'opus', rawResponse: Buffer.from('opus failure'),
      providerFrames: [{ type: 'result', error: { type: 'model_unavailable' } }],
    };
    let caught;
    try {
      await runFableConsensus({
        query: 'Mercury, break my fix.',
        mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
        createFableClient: () => ({
          providerName: 'claude-code', model: 'fable', maxTokens: 2000,
          initialize: async () => {},
          generateResponseWithMetadata: async () => { throw fableError; },
        }),
        createOpusClient: () => ({
          providerName: 'claude-code', model: 'opus', maxTokens: 2000,
          initialize: async () => {},
          generateResponseWithMetadata: async () => { throw opusError; },
        }),
        persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 12, mode: '0600' }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(opusError);
    expect(caught.challengerAttempts.map(attempt => attempt.role))
      .toEqual(['fable_challenger', 'opus_challenger']);
    expect(caught.challengerAttempts.every(attempt => attempt.status === 'failed')).toBe(true);
    expect(kimiTieBreakerRequired({ ok: false, parsed: { blocking: true } }, 'adversarial')).toBe(false);
  });

  test('prompt-only stage fails loud on missing applied identity or exposed tools', async () => {
    for (const metadata of [
      { provider: 'claude-code', requestedModel: 'fable', appliedModel: null, toolsAvailable: [] },
      { provider: 'claude-code', requestedModel: 'fable', appliedModel: 'claude-fable-5', toolsAvailable: ['Read'] },
    ]) {
      let caught;
      try {
        await executePromptOnlyStage({
          role: 'fable_challenger',
          prompt: 'review this',
          suppliedSources: [{ path: 'input://original-query', excerpt: 'review this' }],
          createClient: () => ({
            providerName: 'claude-code', model: 'fable', maxTokens: 2000,
            initialize: async () => {},
            generateResponseWithMetadata: async () => ({
              answer: 'VERDICT: pass',
              metadata: { ...metadata, rawResponse: Buffer.from('raw') },
            }),
          }),
          persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 3, mode: '0600' }),
          attemptNumber: 1,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.stageAttempt).toMatchObject({
        status: 'failed',
        requested_provider: 'claude-code',
        requested_model: 'fable',
        files_mechanically_opened: [],
        tools: { enabled: false, calls: [], total: 0 },
        input_provenance: {
          supplied_sources: [{ path: 'input://original-query', bytes: 11 }],
        },
      });
    }
  });

  test('ambiguous, auth, and malformed Fable failures fail loud without Opus', async () => {
    for (const error of [
      new Error('authentication failed'),
      new Error('malformed response'),
      new Error('general network failure'),
    ]) {
      error.providerMetadata = { rawResponse: Buffer.alloc(0), providerFrames: [] };
      expect(classifyFableFallbackError(error)).toMatchObject({ opusEligible: false, category: 'untrusted_provider_error' });
    }
    const authError = new Error('authentication failed');
    authError.providerMetadata = { rawResponse: Buffer.alloc(0), providerFrames: [] };
    const opusFactory = jest.fn();
    await expect(runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => { throw authError; },
      }),
      createOpusClient: opusFactory,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 0, mode: '0600' }),
    })).rejects.toThrow('authentication failed');
    expect(opusFactory).not.toHaveBeenCalled();
  });

  test('stage failures redact secrets before returned receipts and aggregate failures', async () => {
    const failure = new Error('API_KEY=stage-secret-value');
    let caught;
    try {
      await executePromptOnlyStage({
        role: 'fable_challenger',
        prompt: 'review this',
        createClient: () => ({
          providerName: 'claude-code', model: 'fable',
          initialize: async () => {},
          generateResponseWithMetadata: async () => { throw failure; },
        }),
        persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 0, mode: '0600' }),
        attemptNumber: 1,
      });
    } catch (error) {
      caught = error;
    }
    expect(JSON.stringify(caught.stageAttempt)).not.toContain('stage-secret-value');
    expect(caught.stageAttempt.error.message).toContain('[REDACTED]');
    expect(JSON.stringify(consensusFailure(caught))).not.toContain('stage-secret-value');
  });

  test('raw receipt persistence failure fails loud without Opus', async () => {
    const opusFactory = jest.fn();
    await expect(runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => ({
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no',
          metadata: {
            provider: 'claude-code', requestedModel: 'fable', appliedModel: 'claude-fable-5',
            rawResponse: Buffer.from('provider bytes'), toolsAvailable: [],
          },
        }),
      }),
      createOpusClient: opusFactory,
      persistRaw: () => { throw new Error('raw receipt collision'); },
    })).rejects.toThrow('raw receipt collision');
    expect(opusFactory).not.toHaveBeenCalled();
  });

  test('consensusFailure preserves visible error metadata', () => {
    expect(consensusFailure(new Error('quota exceeded'))).toMatchObject({
      enabled: true,
      mode: 'adversarial_review',
      ok: false,
      provider: 'claude-code',
      model: 'fable',
      error: {
        name: 'Error',
        message: 'quota exceeded',
      },
    });
  });

  test('Kimi is skipped on challenger consensus and challenger-provider failure', () => {
    expect(kimiTieBreakerRequired({ ok: true, parsed: { blocking: false } }, 'adversarial')).toBe(false);
    expect(kimiTieBreakerRequired({ ok: false, parsed: { blocking: true } }, 'adversarial')).toBe(false);
    expect(kimiTieBreakerRequired({ ok: true, parsed: { blocking: true } }, 'planning')).toBe(false);
    expect(kimiTieBreakerRequired({ ok: true, parsed: { blocking: true } }, 'adversarial')).toBe(true);
  });
});
