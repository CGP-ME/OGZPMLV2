'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildPromptProvenance,
  buildRunLedgerEntry,
  classifyMercuryVerdict,
  redactSensitiveText,
  writeRawProviderOutput,
  writeRunLedgerEntry,
} = require('../trai_brain/mercury-bridge/run-ledger');

function evidenceFixture(excerpt = 'VERBATIM EVIDENCE') {
  const artifact = `header\n${excerpt}\nfooter`;
  return {
    path: 'ignored/census.md',
    artifact_sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
    artifact_bytes: Buffer.byteLength(artifact),
    line_start: 2,
    line_end: 2,
    excerpt_sha256: crypto.createHash('sha256').update(excerpt).digest('hex'),
    excerpt_bytes: Buffer.byteLength(excerpt),
    excerpt,
  };
}

describe('Mercury run ledger', () => {
  let tmpRoot;
  const removedCommitField = ['commit', 'blocking'].join('_');

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-run-ledger-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('redacts secret-shaped prompt and answer text before persistence', () => {
    const bearerFixture = ['Authorization:', 'Bearer', 'abcdef1234567890'].join(' ');
    const text = [
      'SIGNALSTACK_WEBHOOK_URL=https://app.signalstack.com/hook/live-secret',
      'ALPACA_API_SECRET=super-secret',
      bearerFixture,
    ].join(' ');

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain('SIGNALSTACK_WEBHOOK_URL=[REDACTED]');
    expect(redacted).toContain('ALPACA_API_SECRET=[REDACTED]');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).not.toContain('live-secret');
    expect(redacted).not.toContain('super-secret');
    expect(redacted).not.toContain('abcdef1234567890');
  });

  test('redacts bare provider and high-entropy token shapes without labels', () => {
    const fixtures = [
      ['sk', 'ant', 'api03', 'Ab9_Zy8-Xw7Vu6Ts5Rq4Po3Nm2Lk1Ji0'].join('-'),
      `sk-${'Ab3dEf7hIj9kLm2nOp4qRs6tUv8wXy0z'}`,
      `sk-${'Mo9nSh7oT5aP3iK1eY8xV6uT4sR2qW0z'}`,
      `PK${'A1B2C3D4E5F6G7H8I9J0'}`,
      `AK${'Z9Y8X7W6V5U4T3S2R1Q0'}`,
      `ghp_${'Ab3dEf7hIj9kLm2nOp4qRs6tUv8wXy0z'}`,
      `gho_${'Zy9xWv7uTs5rQp3nMk1jHg8fDc6bA4e2'}`,
      `xoxb-${'1234567890-AbCdEfGhIjKlMnOp'}`,
      `AKIA${'A1B2C3D4E5F6G7H8'}`,
      `eyJ${'hbGciOiJIUzI1NiJ9'}.${'eyJzdWIiOiIxMjM0NTY3ODkwIn0'}.${'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'}`,
      '0123456789abcdef'.repeat(2),
      'Ab3dEf7hIj9kLm2nOp4qRs6tUv8wXy0z+/=',
    ];

    for (const fixture of fixtures) {
      const redacted = redactSensitiveText(`before ${fixture} after`);
      expect(redacted).toBe('before [REDACTED] after');
      expect(redacted).not.toContain(fixture);
    }
  });

  test('preserves bare git object IDs and ledger artifact/excerpt sha256 values', () => {
    const gitSha1 = '0123456789abcdef0123456789abcdef01234567';
    const gitSha256 = '0123456789abcdef'.repeat(4);
    const artifactSha256 = crypto.createHash('sha256').update('artifact bytes').digest('hex');
    const excerptSha256 = crypto.createHash('sha256').update('excerpt bytes').digest('hex');
    const runId = '2026-08-28T19-10-53-102Z-1238880-18254231d4c6';
    const runCheckArtifact = '2026-08-28T19-12-22-224Z-run_check_permissions';
    const text = [
      gitSha1,
      gitSha256,
      `artifact_sha256=${artifactSha256}`,
      `excerpt_sha256=${excerptSha256}`,
      `run_id=${runId}`,
      `ogz-meta/cognition-history/mercury-execution/${runCheckArtifact}.log:1-15`,
    ].join(' ');

    expect(redactSensitiveText(text)).toBe(text);
  });

  test('preserves attested evidence identifiers without exempting token shapes', () => {
    const environmentName = 'EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH';
    const repositoryFilename = 'test/session-router-concurrent-transition-ownership.test.js';
    const repositoryDirectory = 'archive/OGZPMLV2-profile-verify-20260604/untracked';
    const slashTaxonomy = 'broker/instrument/account/candle/fee';
    const datedPath = '20260604/untracked/test/backtest';
    const explicitTokenInPath = `test/sk-${'Ab3dEf7hIj9kLm2nOp4qRs6tUv8wXy0z'}.js`;
    const genericTokenInBackticks = `Ab3dEf7hIj9kLm2nOp4qRs6tUv8wXy0z`;

    expect(redactSensitiveText(`\`${environmentName}\` ${repositoryFilename} ${repositoryDirectory} ${slashTaxonomy} ${datedPath}`))
      .toBe(`\`${environmentName}\` ${repositoryFilename} ${repositoryDirectory} ${slashTaxonomy} ${datedPath}`);
    expect(redactSensitiveText(explicitTokenInPath)).toBe('test/[REDACTED].js');
    expect(redactSensitiveText(`\`${genericTokenInBackticks}\``)).toBe('`[REDACTED]`');
  });

  test('classifies common Mercury outcomes into durable verdicts', () => {
    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'I found a concrete break in core/Foo.js:1-2.',
      },
    })).toBe('found_break');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'I could not find a concrete break after checking core/Foo.js:1-2.',
      },
    })).toBe('no_break_found');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: [
          'There is no code path where matrix-sweep bypasses run-empire-v2.js.',
          'No evidence of a bypass or stale routing was found in current repo files.',
        ].join(' '),
      },
    })).toBe('no_break_found');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'max_iterations',
        answer: '',
      },
    })).toBe('blocked');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
        toolTelemetry: {
          total: 1,
          succeeded: 0,
          failed: 1,
          byTool: { git_show: { calls: 1, succeeded: 0, failed: 1 } },
          calls: [{
            name: 'git_show',
            status: 'failed',
            args: { ref: 'HEAD', path: 'missing.js' },
            result: { error: 'git_show path not present at ref HEAD' },
          }],
        },
      },
    })).toBe('no_break_found');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
        toolTelemetry: {
          total: 1,
          succeeded: 0,
          failed: 1,
          byTool: { open_file: { calls: 1, succeeded: 0, failed: 1 } },
          calls: [{
            name: 'open_file',
            status: 'failed',
            args: { path: 'ignored/evidence.json' },
            result: { error: 'open_file blocked by mercury.ignore' },
          }],
        },
        adversarialReview: {
          enabled: true,
          ok: true,
          parsed: { verdict: 'found_break', blocking: true },
        },
      },
    })).toBe('cannot_verify');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
      },
      autoBlastRadius: {
        errors: [{ file: '<current_changes>', error: 'spawnSync git ENOBUFS' }],
      },
    })).toBe('no_break_found');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
        consensus: {
          enabled: true,
          ok: false,
          provider: 'claude-code',
          model: 'claude-fable-5',
          error: { message: 'spawn claude ENOENT' },
        },
      },
    })).toBe('consensus_failed');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
        consensus: {
          enabled: false,
          ok: false,
          provider: 'claude-code',
          model: 'claude-fable-5',
          error: { message: 'manual suppression produced failure metadata' },
        },
      },
    })).toBe('consensus_failed');

    expect(classifyMercuryVerdict({ error: new Error('MongoDB failed') })).toBe('tool_failure');
  });

  test('builds a compact run envelope from Mercury telemetry', () => {
    const longPromptTail = 'x'.repeat(1200);
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: `Mercury, break my fix. SIGNALSTACK_WEBHOOK_URL=https://app.signalstack.com/hook/live-secret ${longPromptTail}`,
      opts: {
        workId: 'MER-DS-0001',
        maxIterations: 60,
        maxTokens: 7750,
        captureTrace: true,
      },
      startedAt: new Date('2026-06-27T00:00:00.000Z'),
      finishedAt: new Date('2026-06-27T00:00:01.000Z'),
      autoBlastRadius: {
        source: 'current_changes',
        meta: [{ file: 'trai_brain/mercury-bridge/ask.js', callerCount: 0, riskLevel: 'isolated' }],
        errors: [],
      },
      result: {
        termination: 'answer_given',
        iterations: 2,
        totalLatencyMs: 1234,
        answer: 'No concrete break found. trai_brain/mercury-bridge/ask.js:1-2',
        consensus: {
          enabled: true,
          ok: true,
          provider: 'claude',
          model: 'claude-fable-5',
          latencyMs: 250,
          answer: 'VERDICT: agree\nCONSENSUS_BLOCKING: no',
        },
        answerQuality: { flags: [] },
        toolTelemetry: {
          byTool: {
            open_file: { calls: 1, succeeded: 1, failed: 0 },
            git_diff: { calls: 1, succeeded: 1, failed: 0 },
          },
          calls: [{
            iteration: 1,
            name: 'git_diff',
            status: 'succeeded',
            args: { target: 'current' },
            result: { target: 'working', file_count: 1 },
          }, {
            iteration: 1,
            name: 'open_file',
            status: 'succeeded',
            args: { path: 'trai_brain/mercury-bridge/ask.js', start_line: 1, end_line: 2 },
            result: { file: 'trai_brain/mercury-bridge/ask.js', start_line: 1, end_line: 2 },
          }],
          filesOpened: ['trai_brain/mercury-bridge/ask.js:1-2'],
          runCheckArtifacts: ['ogz-meta/cognition-history/mercury-execution/check.log:1-3'],
          runChecks: [{
            profile: 'focused-jest',
            command: 'npx jest test/mercury-run-ledger.test.js --runInBand',
            exit_code: 0,
            signal: '',
            timed_out: false,
            status: 'passed',
            artifact_citation: 'ogz-meta/cognition-history/mercury-execution/check.log:1-3',
            error: '',
          }],
        },
      },
    });

    expect(entry.work_id).toBe('MER-DS-0001');
    expect(entry.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.prompt_excerpt).toContain('SIGNALSTACK_WEBHOOK_URL=[REDACTED]');
    expect(entry.prompt_excerpt.length).toBeGreaterThan(1000);
    expect(entry.prompt_excerpt).not.toContain('live-secret');
    // Dispatch Law compliance must stay auditable: numeric config caps are
    // never credentials, so the /token/ key-scrubber must not eat maxTokens.
    expect(entry.options.maxTokens).toBe(7750);
    expect(entry.verdict).toBe('no_break_found');
    expect(entry).not.toHaveProperty(removedCommitField);
    expect(entry.tools_invoked).toEqual([
      {
        name: 'git_diff',
        calls: 1,
        succeeded: 1,
        failed: 0,
        call_details: [{
          iteration: 1,
          status: 'succeeded',
          args: { target: 'current' },
          result: { target: 'working', file_count: 1 },
        }],
      },
      {
        name: 'open_file',
        calls: 1,
        succeeded: 1,
        failed: 0,
        call_details: [{
          iteration: 1,
          status: 'succeeded',
          args: { path: 'trai_brain/mercury-bridge/ask.js', start_line: 1, end_line: 2 },
          result: { file: 'trai_brain/mercury-bridge/ask.js', start_line: 1, end_line: 2 },
        }],
      },
    ]);
    expect(entry.files_opened).toEqual(['trai_brain/mercury-bridge/ask.js:1-2']);
    expect(entry.run_check_artifacts).toEqual(['ogz-meta/cognition-history/mercury-execution/check.log:1-3']);
    expect(entry.source_refs.auto_blast_radius_files).toEqual([
      { file: 'trai_brain/mercury-bridge/ask.js', callerCount: 0, riskLevel: 'isolated' },
    ]);
    expect(entry.consensus).toMatchObject({
      mode: 'adversarial_review',
      enabled: true,
      ok: true,
      provider: 'claude',
      model: 'claude-fable-5',
      latency_ms: 250,
      parsed: null,
      effective_verdict: null,
      raw_parsed_verdict: null,
      recheck_prompt_excerpt: null,
      recheck_prompt_full: null,
      recheck: null,
      rechecks: [],
      answer_excerpt: 'VERDICT: agree\nCONSENSUS_BLOCKING: no',
      answer_full: 'VERDICT: agree\nCONSENSUS_BLOCKING: no',
    });
    expect(entry.adversarial_review).toEqual(entry.consensus);
  });

  test('writes JSONL rows with stable repo-scoped citations', () => {
    const entry = {
      schema_version: 1,
      created_at: '2026-06-27T00:00:00.000Z',
      prompt_hash: 'abc',
      verdict: 'no_break_found',
    };

    const first = writeRunLedgerEntry({ repoRoot: tmpRoot, entry });
    const second = writeRunLedgerEntry({ repoRoot: tmpRoot, entry: { ...entry, verdict: 'blocked' } });
    const absPath = path.join(tmpRoot, first.path);
    const rows = fs.readFileSync(absPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    expect(first.path).toBe('ogz-meta/cognition-history/mercury-runs/2026-06-27.jsonl');
    expect(first.citation).toBe('ogz-meta/cognition-history/mercury-runs/2026-06-27.jsonl:1');
    expect(second.citation).toBe('ogz-meta/cognition-history/mercury-runs/2026-06-27.jsonl:2');
    expect(rows).toHaveLength(2);
    expect(rows[0].verdict).toBe('no_break_found');
    expect(rows[1].verdict).toBe('blocked');
  });

  test('writes exact raw provider bytes mode 0600 with hash and collision refusal', () => {
    const bytes = Buffer.from([0x00, 0x61, 0xff, 0x0a]);
    const receipt = writeRawProviderOutput({
      repoRoot: tmpRoot,
      runId: 'run-1',
      stage: 'fable_challenger',
      attempt: 1,
      bytes,
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    const absPath = path.join(tmpRoot, receipt.path);
    expect(fs.readFileSync(absPath)).toEqual(bytes);
    expect(receipt).toMatchObject({
      bytes: 4,
      mode: '0600',
      sha256: '05b1d9c4789a57ffcbf552e1746b8376064c195d1b4a2f2bc23e0e6e14ce1fc4',
    });
    expect(fs.statSync(absPath).mode & 0o777).toBe(0o600);
    expect(() => writeRawProviderOutput({
      repoRoot: tmpRoot,
      runId: 'run-1',
      stage: 'fable_challenger',
      attempt: 1,
      bytes,
      now: new Date('2026-08-27T00:00:00.000Z'),
    })).toThrow(/EEXIST/);
    expect(() => writeRawProviderOutput({
      repoRoot: tmpRoot, runId: '..', stage: 'fable', attempt: 1, bytes,
    })).toThrow(/invalid raw provider run id/);
  });

  test('records exact prompt and supplied-excerpt provenance without claiming file access', () => {
    expect(buildPromptProvenance('prompt body', [
      { path: 'input://original-query', excerpt: 'review this' },
    ])).toMatchObject({
      prompt_bytes: 11,
      supplied_sources: [{
        path: 'input://original-query',
        bytes: 11,
        sha256: 'bca26d42c068cd3586f83dd5e878d0ab375499124fd6d68726ba6b34cbeb0da9',
        excerpt: 'review this',
      }],
    });
  });

  test('records additive artifact/range provenance and rejects mismatched excerpt attestations', () => {
    const evidence = evidenceFixture();
    const provenance = buildPromptProvenance(`Audit:\n${evidence.excerpt}`, [evidence]);

    expect(provenance.supplied_sources[0]).toMatchObject(evidence);
    expect(() => buildPromptProvenance('Audit', [{
      ...evidence,
      excerpt_bytes: evidence.excerpt_bytes + 1,
    }])).toThrow(/provenance mismatch/);
    expect(() => buildPromptProvenance('Audit', [{
      ...evidence,
      artifact_sha256: undefined,
    }])).toThrow(/provenance mismatch/);
  });

  test('schema-v2 ledger carries top-level evidence and complete stage-specific recheck tape', () => {
    const evidence = evidenceFixture();
    const query = `Audit:\n${evidence.excerpt}`;
    const inputProvenance = buildPromptProvenance(query, [evidence]);
    const recheckProvenance = buildPromptProvenance(`Recheck:\n${evidence.excerpt}`, [evidence]);
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query,
      evidenceSources: [evidence],
      inputProvenance,
      startedAt: new Date('2026-08-28T00:00:00.000Z'),
      finishedAt: new Date('2026-08-28T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 2,
        answer: 'No break found.',
        evidenceSources: [evidence],
        inputProvenance,
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
        adversarialReview: {
          enabled: true,
          ok: true,
          parsed: { verdict: 'needs_more_evidence', blocking: true },
          recheckPrompts: [`Recheck:\n${evidence.excerpt}`],
          rechecks: [{
            termination: 'answer_given',
            iterations: 2,
            totalLatencyMs: 50,
            answer: 'Recheck answer.',
            inputProvenance: recheckProvenance,
            providerAttempts: [{ stage: 'mercury_recheck_1', status: 'succeeded' }],
            toolsAvailable: ['open_file', 'run_check'],
            toolTelemetry: {
              byTool: { open_file: { calls: 1, succeeded: 1, failed: 0 } },
              calls: [{ name: 'open_file', status: 'succeeded', args: { path: 'core/Foo.js' }, result: { file: 'core/Foo.js' } }],
              filesOpened: ['core/Foo.js:1-2'],
              runCheckArtifacts: ['receipt:1'],
              runChecks: [{ profile: 'focused', status: 'passed', exit_code: 0 }],
            },
            answerQuality: { flags: ['citation_checked'], evidence: [{ flag: 'citation_checked' }] },
          }],
        },
      },
    });

    expect(entry.schema_version).toBe(2);
    expect(entry.prompt_provenance).toEqual(inputProvenance);
    expect(entry.source_refs.supplied_evidence[0]).toMatchObject(evidence);
    expect(entry.adversarial_review.rechecks[0]).toMatchObject({
      input_provenance: recheckProvenance,
      provider_attempts: [{ stage: 'mercury_recheck_1', status: 'succeeded' }],
      tools_available: ['open_file', 'run_check'],
      files_mechanically_opened: ['core/Foo.js:1-2'],
      run_check_artifacts: ['receipt:1'],
      run_checks: [{ profile: 'focused', status: 'passed', exit_code: 0 }],
      answer_quality: ['citation_checked'],
      answer_quality_evidence: [{ flag: 'citation_checked' }],
    });
    expect(entry.adversarial_review.rechecks[0].tools_invoked[0]).toMatchObject({
      name: 'open_file', calls: 1, succeeded: 1, failed: 0,
    });
  });

  test('legacy schema-v2 callers remain valid without evidence provenance', () => {
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Legacy query.',
      startedAt: new Date('2026-08-28T00:00:00.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 1,
        answer: 'Legacy answer.',
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.schema_version).toBe(2);
    expect(entry.prompt_provenance.supplied_sources).toEqual([]);
    expect(entry.source_refs.supplied_evidence).toEqual([]);
  });

  test('persists failed Fable consensus as explicit metadata instead of a successful pass', () => {
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 3,
        totalLatencyMs: 1000,
        answer: 'No concrete break found. core/Foo.js:1-2',
        consensus: {
          enabled: true,
          ok: false,
          provider: 'claude-code',
          model: 'claude-fable-5',
          error: {
            name: 'Error',
            message: 'spawn claude ENOENT',
          },
        },
        answerQuality: { flags: [] },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.consensus).toMatchObject({
      mode: 'adversarial_review',
      enabled: true,
      ok: false,
      provider: 'claude-code',
      model: 'claude-fable-5',
      latency_ms: null,
      error: {
        name: 'Error',
        message: 'spawn claude ENOENT',
      },
      parsed: null,
      effective_verdict: null,
      raw_parsed_verdict: null,
      max_rechecks: null,
      recheck_prompt_excerpt: null,
      recheck_prompt_full: null,
      recheck_prompts: [],
      recheck_prompts_full: [],
      recheck: null,
      rechecks: [],
      final_review: null,
      answer_excerpt: null,
      answer_full: null,
    });
    expect(entry.adversarial_review).toEqual(entry.consensus);
    expect(entry.consensus.ok).toBe(false);
    expect(entry.verdict).toBe('consensus_failed');
    expect(entry).not.toHaveProperty(removedCommitField);
  });

  test('persists Fable-triggered Mercury recheck metadata', () => {
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 3,
        totalLatencyMs: 1000,
        answer: 'No concrete break found. core/Foo.js:1-2',
        consensus: {
          enabled: true,
          ok: true,
          provider: 'claude-code',
          model: 'claude-fable-5',
          latencyMs: 250,
          answer: 'VERDICT: needs_more_evidence\nCONSENSUS_BLOCKING: yes',
          parsed: {
            consensus: 'Mercury and Fable cite core/OrderExecutor.js:1-2.',
            contradictions: 'Mercury omitted spawn proof; Fable required it.',
            partial: 'Fable alone requested the spawn proof.',
            unique: 'Mercury recheck surfaced execSync overlay evidence.',
            blindSpots: 'none',
            verdict: 'needs_more_evidence',
            blocking: true,
            disagreement: 'Missing spawn-site proof.',
            requiredRecheck: 'inspect core/OrderExecutor.js:1-2',
            recheckPrompt: 'Mercury, inspect the spawn site.',
            nextCheck: 'none',
          },
          recheckPrompt: 'Mercury, inspect the spawn site.',
          recheckPrompts: ['Mercury, inspect the spawn site.'],
          recheck: {
            termination: 'answer_given',
            iterations: 2,
            totalLatencyMs: 500,
            answer: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
          },
          rechecks: [{
            termination: 'answer_given',
            iterations: 2,
            totalLatencyMs: 500,
            answer: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
          }],
          finalReview: {
            mode: 'kimi_final_adjudication',
            enabled: true,
            ok: true,
            provider: 'openai',
            model: 'kimi-k3',
            latencyMs: 300,
            answer: [
              'FINAL_VERDICT: models_disagree',
              'FINAL_BLOCKING: yes',
              'SHARED_CONCLUSION: none',
              'MERCURY_SUPPORTED: recheck cites execSync evidence',
              'FABLE_SUPPORTED: initial answer missed spawn-site proof',
              'KIMI_SUPPORTED: no shared conclusion',
              'CITED_REASONING: supplied evidence does not converge',
              'NEXT_CHECK: operator adjudication',
            ].join('\n'),
            parsed: {
              consensus: 'none',
              contradictions: 'Mercury and Fable diverged on whether proof was sufficient.',
              partial: 'none',
              unique: 'Kimi preserved the unresolved disagreement.',
              blindSpots: 'none',
              verdict: 'models_disagree',
              blocking: true,
              sharedConclusion: 'none',
              mercurySupported: 'recheck cites execSync evidence',
              fableSupported: 'initial answer missed spawn-site proof',
              kimiSupported: 'no shared conclusion',
              citedReasoning: 'supplied evidence does not converge',
              nextCheck: 'operator adjudication',
            },
          },
        },
        answerQuality: { flags: [] },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.consensus).toMatchObject({
      mode: 'adversarial_review',
      ok: true,
      parsed: {
        consensus: 'Mercury and Fable cite core/OrderExecutor.js:1-2.',
        contradictions: 'Mercury omitted spawn proof; Fable required it.',
        partial: 'Fable alone requested the spawn proof.',
        unique: 'Mercury recheck surfaced execSync overlay evidence.',
        blindSpots: 'none',
        verdict: 'needs_more_evidence',
      },
      recheck_prompts: ['Mercury, inspect the spawn site.'],
      recheck_prompts_full: ['Mercury, inspect the spawn site.'],
      recheck_prompt_excerpt: 'Mercury, inspect the spawn site.',
      recheck_prompt_full: 'Mercury, inspect the spawn site.',
      recheck: {
        termination: 'answer_given',
        iterations: 2,
        latency_ms: 500,
        answer_excerpt: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
        answer_full: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
      },
      rechecks: [{
        termination: 'answer_given',
        iterations: 2,
        latency_ms: 500,
        answer_excerpt: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
        answer_full: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
      }],
      final_review: {
        mode: 'kimi_final_adjudication',
        ok: true,
        provider: 'openai',
        model: 'kimi-k3',
        effective_verdict: 'models_disagree',
        parsed: {
          consensus: 'none',
          contradictions: 'Mercury and Fable diverged on whether proof was sufficient.',
          partial: 'none',
          unique: 'Kimi preserved the unresolved disagreement.',
          blindSpots: 'none',
          verdict: 'models_disagree',
          blocking: true,
          sharedConclusion: 'none',
          mercurySupported: 'recheck cites execSync evidence',
          fableSupported: 'initial answer missed spawn-site proof',
          kimiSupported: 'no shared conclusion',
        },
      },
    });
    expect(Object.keys(entry.consensus.parsed).slice(0, 6)).toEqual([
      'consensus',
      'contradictions',
      'partial',
      'unique',
      'blindSpots',
      'verdict',
    ]);
    expect(Object.keys(entry.consensus.final_review.parsed).slice(0, 6)).toEqual([
      'consensus',
      'contradictions',
      'partial',
      'unique',
      'blindSpots',
      'verdict',
    ]);
    expect(entry.verdict).toBe('models_disagree');
    expect(entry.adversarial_review).toEqual(entry.consensus);
  });

  test('does not persist phantom recheck prompt when cap prevents rechecks', () => {
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 3,
        totalLatencyMs: 1000,
        answer: 'No concrete break found. core/Foo.js:1-2',
        adversarialReview: {
          mode: 'adversarial_review',
          enabled: true,
          ok: true,
          provider: 'claude-code',
          model: 'claude-fable-5',
          latencyMs: 250,
          answer: 'VERDICT: needs_more_evidence\nCONSENSUS_BLOCKING: yes',
          parsed: {
            verdict: 'needs_more_evidence',
            blocking: true,
            disagreement: 'Missing proof.',
            requiredRecheck: 'inspect core/Foo.js:1-2',
            recheckPrompt: 'Mercury, inspect core/Foo.js:1-2.',
            nextCheck: 'none',
          },
          recheckPrompt: null,
          recheckPrompts: [],
          rechecks: [],
        },
        answerQuality: { flags: [] },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.adversarial_review).toMatchObject({
      mode: 'adversarial_review',
      ok: true,
      recheck_prompt_excerpt: null,
      recheck_prompt_full: null,
      recheck_prompts: [],
      recheck_prompts_full: [],
      recheck: null,
      rechecks: [],
    });
    expect(entry.consensus).toEqual(entry.adversarial_review);
  });

  test('persists full adversarial review text; tool failures stay visible in telemetry without masking the outcome verdict', () => {
    const longReview = [
      'VERDICT: found_break',
      'CONSENSUS_BLOCKING: yes',
      'Evidence:',
      'A'.repeat(1500),
    ].join('\n');
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 3,
        totalLatencyMs: 1000,
        answer: 'No concrete break found. core/Foo.js:1-2',
        adversarialReview: {
          mode: 'adversarial_review',
          enabled: true,
          ok: true,
          provider: 'claude-code',
          model: 'claude-fable-5',
          latencyMs: 250,
          answer: longReview,
          parsed: {
            verdict: 'found_break',
            blocking: true,
          },
        },
        answerQuality: { flags: [] },
        toolTelemetry: {
          failed: 1,
          byTool: { open_file: { calls: 1, succeeded: 0, failed: 1 } },
          calls: [{
            name: 'open_file',
            status: 'failed',
            args: { path: 'missing.js' },
            result: { error: 'cannot read file' },
          }],
        },
      },
    });

    expect(entry.verdict).toBe('cannot_verify');
    expect(entry).not.toHaveProperty(removedCommitField);
    expect(entry.adversarial_review.answer_excerpt).toContain('[truncated');
    expect(entry.adversarial_review.answer_full).toBe(longReview);
    expect(entry.adversarial_review.raw_parsed_verdict).toBe('found_break');
    expect(entry.adversarial_review.effective_verdict).toBe('found_break');
  });

  test('does not commit-block tool failures or cannot-verify outcomes', () => {
    const toolFailureEntry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      error: new Error('embed query failed'),
    });
    expect(toolFailureEntry.verdict).toBe('tool_failure');
    expect(toolFailureEntry).not.toHaveProperty(removedCommitField);

    const cannotVerifyEntry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-07-02T00:00:00.000Z'),
      finishedAt: new Date('2026-07-02T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 1,
        totalLatencyMs: 100,
        answer: 'Cannot verify this from the available files.',
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });
    expect(cannotVerifyEntry.verdict).toBe('cannot_verify');
    expect(cannotVerifyEntry).not.toHaveProperty(removedCommitField);
  });

  test.each([
    ['evidence_descriptor', 'ignored/missing.md:1-1', 'evidence_descriptor_absent'],
    ['challenger', 'fable_challenger', 'challenger_answer_absent'],
    ['recheck', 'mercury_recheck_2', 'mercury_recheck_answer_absent'],
  ])('caps a load-bearing %s quarantine at unverified and preserves its scream receipt', (unit, name, absence) => {
    const quarantine = {
      status: 'quarantined',
      unit,
      name,
      absence,
      load_bearing: true,
      ntfy: { status: 'sent', priority: 'max' },
    };
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-08-28T00:00:00.000Z'),
      finishedAt: new Date('2026-08-28T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 2,
        answer: 'No concrete break found.',
        reviewQuarantines: [quarantine],
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.verdict).toBe('unverified');
    expect(entry.review_quarantines).toEqual([quarantine]);
  });

  test('does not cap a clean replacement challenger for a non-load-bearing Fable absence', () => {
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-08-28T00:00:00.000Z'),
      finishedAt: new Date('2026-08-28T00:00:01.000Z'),
      result: {
        termination: 'answer_given',
        iterations: 2,
        answer: 'No concrete break found.',
        adversarialReview: {
          ok: true,
          parsed: { verdict: 'pass', blocking: false },
          quarantines: [{
            status: 'quarantined',
            unit: 'challenger',
            name: 'fable_challenger',
            absence: 'fable_answer_replaced_by_opus',
            load_bearing: false,
            ntfy: { status: 'sent', priority: 'max' },
          }],
        },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.verdict).toBe('no_break_found');
    expect(entry.review_quarantines).toHaveLength(1);
  });

  test('persists identity ladder posture and caps only undocumented conflicts', () => {
    const documented = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-08-29T00:00:00.000Z'),
      finishedAt: new Date('2026-08-29T00:00:01.000Z'),
      result: {
        termination: 'answer_given', iterations: 1, answer: 'No concrete break found.',
        adversarialReview: {
          ok: true,
          parsed: { verdict: 'pass', blocking: false },
          identityPosture: {
            status: 'documented_transition', authority: 'full',
            applied_models: ['claude-fable-5', 'claude-opus-4-8'],
            verdict_models: ['claude-opus-4-8'],
            transitions: [{ transition_type: 'fallback', from_model: 'claude-fable-5', to_model: 'claude-opus-4-8' }],
          },
          quarantines: [],
        },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });
    expect(documented.verdict).toBe('no_break_found');
    expect(documented.adversarial_review.identity_posture).toMatchObject({
      status: 'documented_transition', authority: 'full', verdict_models: ['claude-opus-4-8'],
    });

    const identityConflict = {
      status: 'quarantined', unit: 'identity', name: 'fable_challenger',
      absence: 'identity_conflict', load_bearing: true,
      ntfy: { status: 'sent', priority: 'max', status_code: 200 },
    };
    const conflicted = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix.',
      startedAt: new Date('2026-08-29T00:00:00.000Z'),
      finishedAt: new Date('2026-08-29T00:00:01.000Z'),
      result: {
        termination: 'answer_given', iterations: 1, answer: 'No concrete break found.',
        adversarialReview: {
          ok: true,
          parsed: { verdict: 'pass', blocking: false },
          identityPosture: {
            status: 'identity_conflict', authority: 'unverified', reason: 'undocumented_model_mismatch',
            applied_models: ['claude-fable-5', 'claude-sonnet-4-5'],
            verdict_models: ['claude-sonnet-4-5'], transitions: [],
          },
          quarantines: [identityConflict],
        },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });
    expect(conflicted.verdict).toBe('unverified');
    expect(conflicted.review_quarantines).toEqual([identityConflict]);
    expect(conflicted.adversarial_review).toMatchObject({
      effective_verdict: 'UNVERIFIED',
      raw_parsed_verdict: 'pass',
      identity_posture: { status: 'identity_conflict', authority: 'unverified' },
    });
  });
});
