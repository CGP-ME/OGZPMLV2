'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  buildAttestedPromptProvenance,
  executePromptOnlyStage,
  reviewQuarantine,
  screamReviewQuarantine,
} = require('../trai_brain/mercury-bridge/adversarial-review');
const {
  parseArgs,
  parseEvidenceSourceDescriptor,
  resolveEvidenceSources,
  runReviewRechecks,
  buildMercuryIntentPrompt,
} = require('../trai_brain/mercury-bridge/ask');

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

function evidenceFixture(excerpt = 'VERBATIM EVIDENCE') {
  return Object.freeze({
    path: 'ignored/census.md',
    artifact_sha256: crypto.createHash('sha256').update(`header\n${excerpt}\nfooter`).digest('hex'),
    artifact_bytes: Buffer.byteLength(`header\n${excerpt}\nfooter`),
    line_start: 2,
    line_end: 2,
    excerpt_sha256: crypto.createHash('sha256').update(excerpt).digest('hex'),
    excerpt_bytes: Buffer.byteLength(excerpt),
    excerpt,
  });
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

    expect(parseArgs(['node', 'ask.js', '--agentic', '--reviewers=kimi,mercury', 'break this'])).toMatchObject({
      agentic: true,
      reviewers: 'kimi,mercury',
      reviewersExplicit: true,
      query: 'break this',
    });

    expect(parseArgs(['node', 'ask.js', '--agentic', '--reviewers=', 'break this'])).toMatchObject({
      reviewers: '',
      reviewersExplicit: true,
    });

    expect(parseArgs([
      'node', 'ask.js', '--agentic',
      '--evidence-source=ignored/a.md:1-2',
      '--evidence-source=ignored/b.md:4-4',
      'review supplied excerpts',
    ])).toMatchObject({
      evidenceSources: ['ignored/a.md:1-2', 'ignored/b.md:4-4'],
      query: 'review supplied excerpts',
    });
  });

  test('host quarantines one unverifiable descriptor, continues with clean evidence, and hard-stops secret evidence', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-evidence-'));
    try {
      fs.mkdirSync(path.join(repoRoot, 'ignored'));
      fs.writeFileSync(path.join(repoRoot, 'ignored', 'census.md'), 'header\nalpha\nbeta\nfooter\n');
      const query = 'Review this exact excerpt:\nalpha\nbeta\nEnd excerpt.';
      const sources = resolveEvidenceSources({
        repoRoot,
        query,
        descriptors: ['ignored/missing.md:1-1', 'ignored/census.md:2-3'],
      });

      expect(Object.isFrozen(sources)).toBe(true);
      expect(Object.isFrozen(sources[0])).toBe(true);
      expect(Object.isFrozen(sources.quarantines)).toBe(true);
      expect(sources).toHaveLength(1);
      expect(sources.quarantines).toEqual([
        expect.objectContaining({
          status: 'quarantined',
          unit: 'evidence_descriptor',
          name: 'ignored/missing.md:1-1',
          absence: 'evidence_descriptor_absent',
          load_bearing: true,
        }),
      ]);
      expect(sources[0]).toMatchObject({
        path: 'ignored/census.md',
        artifact_bytes: 25,
        line_start: 2,
        line_end: 3,
        excerpt: 'alpha\nbeta',
        excerpt_bytes: 10,
      });
      expect(sources[0].artifact_sha256).toBe(crypto.createHash('sha256').update('header\nalpha\nbeta\nfooter\n').digest('hex'));
      expect(sources[0].excerpt_sha256).toBe(crypto.createHash('sha256').update('alpha\nbeta').digest('hex'));
      expect(parseEvidenceSourceDescriptor('ignored/census.md:2-3')).toEqual({
        path: 'ignored/census.md', line_start: 2, line_end: 3,
      });

      fs.symlinkSync('census.md', path.join(repoRoot, 'ignored', 'link.md'));
      fs.writeFileSync(path.join(repoRoot, 'ignored', 'invalid.bin'), Buffer.from([0xc3, 0x28]));
      const secretFixture = `${['API', 'KEY'].join('_')}=${['fixture', 'credential'].join('-')}`;
      fs.writeFileSync(path.join(repoRoot, 'ignored', 'secret.md'), `${secretFixture}\n`);
      const rejected = [
        ['../outside.md:1-1', 'x'],
        ['/tmp/outside.md:1-1', 'x'],
        ['ignored/link.md:1-1', 'header'],
        ['ignored/census.md:1-151', 'header'],
        ['ignored/census.md:4-3', 'footer'],
        ['ignored/census.md:20-20', 'missing'],
        ['ignored/missing.md:1-1', 'missing'],
        ['ignored/census.md:2-3', 'alpha\nbeta and alpha\nbeta'],
        ['ignored/secret.md:1-1', 'API_KEY=do-not-send'],
        ['ignored/invalid.bin:1-1', 'invalid'],
      ];
      for (const [descriptor, rejectedQuery] of rejected) {
        if (descriptor === 'ignored/secret.md:1-1') continue;
        const rejectedSources = resolveEvidenceSources({
          repoRoot, query: rejectedQuery, descriptors: [descriptor],
        });
        expect(rejectedSources).toHaveLength(0);
        expect(rejectedSources.quarantines).toEqual([
          expect.objectContaining({
            name: descriptor,
            absence: 'evidence_descriptor_absent',
            load_bearing: true,
          }),
        ]);
      }
      let secretError;
      try {
        resolveEvidenceSources({
          repoRoot, query: secretFixture, descriptors: ['ignored/secret.md:1-1'],
        });
      } catch (error) {
        secretError = error;
      }
      expect(secretError).toMatchObject({ code: 'EVIDENCE_SECRET_DETECTED' });
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
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
    const prompt = buildMercuryRecheckPrompt({
      originalQuery: 'Mercury, break my fix.',
      mercuryAnswer: 'No break found.',
      fableAnswer: answer,
      parsedConsensus: parsed,
    });
    expect(prompt).toContain('Original user prompt:\nMercury, break my fix.');
    expect(prompt).toContain('Your prior answer:\nNo break found.');
    expect(prompt).toContain(`Fable critique:\n${answer}`);
    expect(prompt).toContain('Required recheck:\nMercury, recheck the worker spawn env path.');
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

    expect(prompts).toHaveLength(3);
    expect(prompts.map(prompt => prompt.match(/Required recheck:\n([^\n]+)/)[1])).toEqual([
      'Mercury, recheck file A.', 'Mercury, recheck file B.', 'Mercury, recheck file C.',
    ]);
    expect(prompts.every(prompt => prompt.includes('Original user prompt:\nMercury, break my fix.'))).toBe(true);
    expect(prompts.every(prompt => prompt.includes('Fable critique:\ncritique'))).toBe(true);
    expect(prompts.slice(0, 2)).toHaveLength(2);
  });

  test('direct and split rechecks preserve identical host-attested evidence', () => {
    const evidence = evidenceFixture();
    const originalQuery = `Audit this excerpt:\n${evidence.excerpt}`;
    const prompts = buildMercuryRecheckPrompts({
      originalQuery,
      mercuryAnswer: 'No break found.',
      fableAnswer: 'Fable found two unresolved claims.',
      parsedReview: { recheckPrompt: '- Check claim one.\n- Check claim two.' },
      evidenceSources: [evidence],
    });

    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain(originalQuery);
      expect(prompt).toContain(evidence.artifact_sha256);
      expect(prompt).toContain(evidence.excerpt_sha256);
      expect(prompt).toContain('access=prompt_supplied_not_repo_tool');
      expect(buildAttestedPromptProvenance(prompt, [evidence]).supplied_sources[0])
        .toMatchObject(evidence);
    }
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

  test('emitted packet cannot outrank its reviewer-panel receipt', () => {
    const packet = formatAdversarialReviewPacket({
      originalQuery: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', answer: 'Structured review.', toolTelemetry: {} },
      review: {
        answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no',
        parsed: { verdict: 'pass', blocking: false },
        finalReview: {
          ok: true,
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no',
          parsed: { verdict: 'pass', blocking: false },
        },
      },
      authority: {
        ceiling: 'UNVERIFIED',
        agreedVerdict: 'pass',
        capReasons: ['evidence_failure'],
        rerunRequired: true,
      },
    });
    expect(packet).toContain('VERDICT: UNVERIFIED');
    expect(packet).toContain('Decision:\nunverified');
    expect(packet).toContain('evidence_failure');
    expect(packet).not.toContain('Decision:\npass_pending_local_proof');
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
            appliedModels: ['claude-fable-5'], auxiliaryModels: ['claude-haiku-4-5'],
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
      auxiliary_models: ['claude-haiku-4-5'],
      tools: { enabled: false, total: 0, calls: [] },
      files_mechanically_opened: [],
      repo_adjudication: { status: 'pending' },
    });
  });

  test('Fable and allowlisted Opus receive identical evidence provenance with no model tools', async () => {
    const evidence = evidenceFixture();
    const query = `Audit this excerpt:\n${evidence.excerpt}`;
    const prompts = [];
    const fableError = new Error('Fable unavailable');
    fableError.providerMetadata = trustedFableMetadata({
      rawResponse: Buffer.from('fable unavailable'),
      toolsAvailable: [],
      providerFrames: [{ type: 'result', is_error: true, error: { type: 'model_unavailable' } }],
    });
    const result = await runFableConsensus({
      query,
      evidenceSources: [evidence],
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'No break found.' },
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async (prompt) => {
          prompts.push(prompt);
          throw fableError;
        },
      }),
      createOpusClient: () => ({
        providerName: 'claude-code', model: 'opus', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async (prompt) => {
          prompts.push(prompt);
          return {
            answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nDISAGREEMENT: none',
            metadata: {
              provider: 'claude-code', requestedModel: 'opus', appliedModel: 'claude-opus-4-1',
              rawResponse: Buffer.from('opus'), toolsAvailable: [],
            },
          };
        },
      }),
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 5, mode: '0600' }),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe(prompts[1]);
    expect(result.attempts.map(attempt => attempt.tools.available)).toEqual([[], []]);
    const evidenceReceipts = result.attempts.map(attempt => attempt.input_provenance.supplied_sources
      .find(source => source.path === evidence.path));
    expect(evidenceReceipts[0]).toEqual(evidenceReceipts[1]);
    expect(evidenceReceipts[0]).toMatchObject(evidence);
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

  test('Kimi receipt preserves evidence plus exact recheck prompts, answers, and telemetry', async () => {
    const evidence = evidenceFixture();
    const query = `Audit this excerpt:\n${evidence.excerpt}`;
    const recheckPrompt = buildMercuryRecheckPrompt({
      originalQuery: query,
      mercuryAnswer: 'Initial answer.',
      fableAnswer: 'Critique.',
      parsedReview: { recheckPrompt: 'Inspect the disputed claim.' },
      evidenceSources: [evidence],
    });
    const telemetry = {
      total: 1,
      succeeded: 1,
      failed: 0,
      byTool: { open_file: { calls: 1, succeeded: 1, failed: 0 } },
      calls: [],
      filesOpened: ['core/Foo.js:1-2'],
      runCheckArtifacts: [],
      runChecks: [],
    };
    const result = await runKimiFinalConsensus({
      query,
      evidenceSources: [evidence],
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'Initial answer.' },
      review: {
        answer: 'Critique.',
        parsed: { verdict: 'needs_more_evidence', blocking: true },
        recheckPrompts: [recheckPrompt],
        rechecks: [{ termination: 'answer_given', iterations: 1, answer: 'Recheck answer.', toolTelemetry: telemetry }],
      },
      createClient: () => ({
        maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => ({
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no',
          metadata: {
            provider: 'openai', requestedModel: 'kimi-k3', appliedModel: 'kimi-k3-202608',
            rawResponse: Buffer.from('kimi'), toolsAvailable: [],
          },
        }),
      }),
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 4, mode: '0600' }),
    });

    const supplied = result.stageReceipt.input_provenance.supplied_sources;
    expect(supplied.find(source => source.path === evidence.path)).toMatchObject(evidence);
    expect(supplied.find(source => source.path.endsWith('-prompt')).excerpt).toBe(recheckPrompt);
    expect(supplied.find(source => source.path === 'mercury://recheck-1-answer').excerpt).toBe('Recheck answer.');
    expect(supplied.find(source => source.path.endsWith('-telemetry')).excerpt)
      .toContain('open_file:1/1/0');
    expect(result.stageReceipt.tools).toMatchObject({ enabled: false, available: [], calls: [] });
    expect(result.stageReceipt.files_mechanically_opened).toEqual([]);
  });

  test('provenance mismatch quarantines before challenger initialization and cannot invoke Opus', async () => {
    const evidence = { ...evidenceFixture(), excerpt_sha256: '0'.repeat(64) };
    const query = `Audit this excerpt:\n${evidence.excerpt}`;
    const fableFactory = jest.fn();
    const opusFactory = jest.fn();

    const result = await runFableConsensus({
      query,
      evidenceSources: [evidence],
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'Initial answer.' },
      createFableClient: fableFactory,
      createOpusClient: opusFactory,
    });
    expect(result).toMatchObject({
      ok: false,
      quarantines: [{
        unit: 'challenger',
        name: 'fable_challenger',
        absence: 'challenger_input_provenance_absent',
        load_bearing: true,
      }],
    });
    expect(fableFactory).not.toHaveBeenCalled();
    expect(opusFactory).not.toHaveBeenCalled();
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

  test('documented provider transition keeps the Fable seat at full authority without pipeline fallback', async () => {
    const opusFactory = jest.fn();
    const transitions = [
      {
        sequence: 2, path: 'message.content[0]', frame_type: 'assistant', frame_subtype: null,
        transition_type: 'fallback', from_model: 'claude-fable-5', to_model: 'claude-opus-4-8',
        trigger: null, direction: null, scope: null,
      },
      {
        sequence: 4, path: '$', frame_type: 'system', frame_subtype: 'model_refusal_fallback',
        transition_type: 'model_refusal_fallback', from_model: 'claude-fable-5', to_model: 'claude-opus-4-8',
        trigger: 'refusal', direction: 'retry', scope: 'session',
      },
    ];
    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => ({
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nDISAGREEMENT: none',
          metadata: trustedFableMetadata({
            appliedModels: ['claude-fable-5', 'claude-opus-4-8'],
            auxiliaryModels: ['claude-haiku-4-5-20251001', 'claude-opus-5'],
            verdictModels: ['claude-opus-4-8'],
            modelTransitions: transitions,
            identityPosture: {
              status: 'documented_transition', authority: 'full', reason: null,
              requested_model: 'fable', applied_models: ['claude-fable-5', 'claude-opus-4-8'],
              verdict_models: ['claude-opus-4-8'], undocumented_models: [], observations: [], transitions,
            },
            rawResponse: Buffer.from('documented-transition'), toolsAvailable: [],
          }),
        }),
      }),
      createOpusClient: opusFactory,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 8, mode: '0600' }),
    });

    expect(result).toMatchObject({
      ok: true,
      model: 'fable',
      appliedModel: 'claude-fable-5',
      identityPosture: { status: 'documented_transition', authority: 'full' },
      quarantines: [],
      stageReceipt: {
        role: 'fable_challenger',
        retry_status: 'primary_attempt',
        applied_models: ['claude-fable-5', 'claude-opus-4-8'],
        verdict_models: ['claude-opus-4-8'],
        auxiliary_models: ['claude-haiku-4-5-20251001', 'claude-opus-5'],
        model_transitions: transitions,
      },
    });
    expect(result.attempts).toHaveLength(1);
    expect(opusFactory).not.toHaveBeenCalled();
    expect(formatAdversarialReviewPacket({
      originalQuery: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', answer: 'core/Foo.js:1' },
      review: result,
    })).toMatch(/^VERDICT: pass/);
  });

  test('undocumented identity mismatch is stamped, screamed, capped UNVERIFIED, and continues', async () => {
    const opusFactory = jest.fn();
    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        providerName: 'claude-code', model: 'fable', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => ({
          answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no\nDISAGREEMENT: none',
          metadata: trustedFableMetadata({
            appliedModels: ['claude-fable-5', 'claude-sonnet-4-5'],
            verdictModels: ['claude-sonnet-4-5'],
            identityPosture: {
              status: 'identity_conflict', authority: 'unverified', reason: 'undocumented_model_mismatch',
              requested_model: 'fable', applied_models: ['claude-fable-5', 'claude-sonnet-4-5'],
              verdict_models: ['claude-sonnet-4-5'], undocumented_models: ['claude-sonnet-4-5'],
              observations: [], transitions: [],
            },
            rawResponse: Buffer.from('identity-conflict'), toolsAvailable: [],
          }),
        }),
      }),
      createOpusClient: opusFactory,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 8, mode: '0600' }),
    });

    expect(result).toMatchObject({
      ok: true,
      model: 'fable',
      identityPosture: { status: 'identity_conflict', authority: 'unverified' },
      quarantines: [{ unit: 'identity', name: 'fable_challenger', absence: 'identity_conflict', load_bearing: true }],
    });
    expect(opusFactory).not.toHaveBeenCalled();
    const screamFetch = jest.fn(async () => ({ ok: true, status: 200 }));
    result.quarantines[0].ntfy = await screamReviewQuarantine(result.quarantines[0], {
      env: { NTFY_TOPIC: 'fable-identity-conflict-test' },
      fetchImpl: screamFetch,
    });
    expect(result.quarantines[0].ntfy).toMatchObject({ status: 'sent', priority: 'max' });
    expect(screamFetch).toHaveBeenCalledWith(
      'https://ntfy.sh/fable-identity-conflict-test',
      expect.objectContaining({ headers: expect.objectContaining({ Priority: 'max' }) })
    );
    expect(formatAdversarialReviewPacket({
      originalQuery: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', answer: 'core/Foo.js:1' },
      review: result,
    })).toMatch(/^VERDICT: UNVERIFIED/);
  });

  test('genuinely untrusted Claude executable remains a hard stop and cannot invoke Opus', async () => {
    const trustError = new Error('Trusted first-party Claude Code executable was not found in a rooted system installation');
    trustError.code = 'CLAUDE_CODE_EXECUTABLE_UNTRUSTED';
    trustError.providerMetadata = {
      provider: 'claude-code',
      requestedModel: 'fable',
      executableTrust: { trusted: false, failedCheck: 'rooted_system_launcher' },
    };
    const opusFactory = jest.fn();

    await expect(runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        maxTokens: 2000,
        initialize: async () => { throw trustError; },
      }),
      createOpusClient: opusFactory,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 0, mode: '0600' }),
    })).rejects.toMatchObject({
      code: 'CLAUDE_CODE_EXECUTABLE_UNTRUSTED',
      providerMetadata: { executableTrust: { trusted: false, failedCheck: 'rooted_system_launcher' } },
    });
    expect(opusFactory).not.toHaveBeenCalled();
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

  test('both Fable and Opus unavailable quarantine with ordered attempts before Kimi', async () => {
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
    const result = await runFableConsensus({
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
    expect(result.ok).toBe(false);
    expect(result.attempts.map(attempt => attempt.role))
      .toEqual(['fable_challenger', 'opus_challenger']);
    expect(result.attempts.every(attempt => attempt.status === 'failed')).toBe(true);
    expect(result.quarantines).toHaveLength(2);
    expect(result.quarantines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        unit: 'challenger',
        name: 'opus_challenger',
        absence: 'replacement_challenger_answer_absent',
        load_bearing: true,
      }),
    ]));
    expect(kimiTieBreakerRequired({ ok: false, parsed: { blocking: true } }, 'adversarial')).toBe(false);
  });

  test('prompt-only stage stamps missing identity but still rejects exposed tools', async () => {
    const missingIdentity = await executePromptOnlyStage({
      role: 'fable_challenger',
      prompt: 'review this',
      suppliedSources: [{ path: 'input://original-query', excerpt: 'review this' }],
      createClient: () => ({
        providerName: 'claude-code', model: 'fable', maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => ({
          answer: 'VERDICT: pass',
          metadata: { provider: 'claude-code', requestedModel: 'fable', appliedModel: null, toolsAvailable: [], rawResponse: Buffer.from('raw') },
        }),
      }),
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 3, mode: '0600' }),
      attemptNumber: 1,
    });
    expect(missingIdentity.receipt).toMatchObject({
      status: 'succeeded',
      identity_posture: {
        status: 'identity_conflict', authority: 'unverified', reason: 'applied_model_identity_absent',
      },
    });

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
            metadata: {
              provider: 'claude-code', requestedModel: 'fable', appliedModel: 'claude-fable-5',
              toolsAvailable: ['Read'], rawResponse: Buffer.from('raw'),
            },
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
  });

  test('ordinary ambiguous Fable failure quarantines without Opus', async () => {
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
    const result = await runFableConsensus({
      query: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', iterations: 1, answer: 'core/Foo.js:1' },
      createFableClient: () => ({
        maxTokens: 2000,
        initialize: async () => {},
        generateResponseWithMetadata: async () => { throw authError; },
      }),
      createOpusClient: opusFactory,
      persistRaw: () => ({ path: 'raw', sha256: 'abc', bytes: 0, mode: '0600' }),
    });
    expect(result).toMatchObject({
      ok: false,
      quarantines: [{
        unit: 'challenger',
        name: 'fable_challenger',
        absence: 'challenger_answer_absent',
        load_bearing: true,
      }],
    });
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

  test('raw receipt persistence failure quarantines without Opus', async () => {
    const opusFactory = jest.fn();
    const result = await runFableConsensus({
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
    });
    expect(result).toMatchObject({
      ok: false,
      quarantines: [{ absence: 'challenger_answer_absent', load_bearing: true }],
    });
    expect(opusFactory).not.toHaveBeenCalled();
  });

  test('review quarantine emits max-priority ntfy and names missing notification configuration', async () => {
    const quarantine = reviewQuarantine({
      unit: 'challenger',
      name: 'fable_challenger',
      absence: 'challenger_answer_absent',
      error: new Error('forced challenger failure'),
    });
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 }));

    const sent = await screamReviewQuarantine(quarantine, {
      env: { NTFY_TOPIC: 'forced-failure-test' },
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://ntfy.sh/forced-failure-test', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Priority: 'max' }),
    }));
    expect(sent).toEqual({ status: 'sent', priority: 'max', status_code: 200 });
    await expect(screamReviewQuarantine(quarantine, { env: {} })).resolves.toEqual({
      status: 'not_configured', priority: 'max', absence: 'ntfy_endpoint_absent',
    });
  });

  test('a failed recheck is quarantined with max-priority scream while later rechecks continue', async () => {
    const runLoop = jest.fn(async ({ userQuery }) => {
      if (userQuery === 'B') throw new Error('forced recheck failure');
      return { answer: `answer ${userQuery}` };
    });
    const notify = jest.fn(async quarantines => quarantines.map(quarantine => ({
      ...quarantine,
      ntfy: { status: 'sent', priority: 'max' },
    })));

    const result = await runReviewRechecks({
      prompts: ['A', 'B', 'C'],
      evidenceSources: [],
      createProviderAudit: name => ({ name }),
      runLoop,
      notify,
    });

    expect(runLoop).toHaveBeenCalledTimes(3);
    expect(result.rechecks.map(recheck => recheck.answer)).toEqual(['answer A', 'answer C']);
    expect(result.quarantines).toEqual([
      expect.objectContaining({
        name: 'mercury_recheck_2',
        absence: 'mercury_recheck_answer_absent',
        load_bearing: true,
        ntfy: { status: 'sent', priority: 'max' },
      }),
    ]);
  });

  test('a load-bearing quarantine caps the human review packet at UNVERIFIED and names the gap', () => {
    const packet = formatAdversarialReviewPacket({
      originalQuery: 'Mercury, break my fix.',
      mercuryResult: { termination: 'answer_given', answer: 'No break found.' },
      review: {
        ok: true,
        answer: 'VERDICT: pass\nCONSENSUS_BLOCKING: no',
        parsed: { verdict: 'pass', blocking: false },
        quarantines: [{
          unit: 'recheck',
          name: 'mercury_recheck_2',
          absence: 'mercury_recheck_answer_absent',
          load_bearing: true,
        }],
      },
    });

    expect(packet).toMatch(/^VERDICT: UNVERIFIED/);
    expect(packet).toContain('recheck:mercury_recheck_2 -> mercury_recheck_answer_absent');
    expect(packet).toContain('no clean unit may self-certify across them');
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
