'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildRunLedgerEntry,
  classifyMercuryVerdict,
  redactSensitiveText,
  writeRunLedgerEntry,
} = require('../trai_brain/mercury-bridge/run-ledger');

describe('Mercury run ledger', () => {
  let tmpRoot;

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
        termination: 'max_iterations',
        answer: '',
      },
    })).toBe('blocked');

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
    const entry = buildRunLedgerEntry({
      repoRoot: tmpRoot,
      query: 'Mercury, break my fix. SIGNALSTACK_WEBHOOK_URL=https://app.signalstack.com/hook/live-secret',
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
    expect(entry.prompt_excerpt).not.toContain('live-secret');
    expect(entry.verdict).toBe('no_break_found');
    expect(entry.commit_blocking).toBe(false);
    expect(entry.tools_invoked).toEqual([
      { name: 'git_diff', calls: 1, succeeded: 1, failed: 0 },
      { name: 'open_file', calls: 1, succeeded: 1, failed: 0 },
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
      recheck_prompt_excerpt: null,
      recheck: null,
      rechecks: [],
      answer_excerpt: 'VERDICT: agree\nCONSENSUS_BLOCKING: no',
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

    expect(entry.consensus).toEqual({
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
      max_rechecks: null,
      recheck_prompt_excerpt: null,
      recheck_prompts: [],
      recheck: null,
      rechecks: [],
      answer_excerpt: null,
    });
    expect(entry.adversarial_review).toEqual(entry.consensus);
    expect(entry.consensus.ok).toBe(false);
    expect(entry.verdict).toBe('consensus_failed');
    expect(entry.commit_blocking).toBe(true);
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
            verdict: 'needs_more_evidence',
            blocking: true,
            disagreement: 'Missing spawn-site proof.',
            requiredRecheck: 'inspect ogz-meta/anchor-runner.js:188-197',
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
        },
        answerQuality: { flags: [] },
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
      },
    });

    expect(entry.consensus).toMatchObject({
      mode: 'adversarial_review',
      ok: true,
      parsed: {
        verdict: 'needs_more_evidence',
        blocking: true,
      },
      recheck_prompts: ['Mercury, inspect the spawn site.'],
      recheck_prompt_excerpt: 'Mercury, inspect the spawn site.',
      recheck: {
        termination: 'answer_given',
        iterations: 2,
        latency_ms: 500,
        answer_excerpt: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
      },
      rechecks: [{
        termination: 'answer_given',
        iterations: 2,
        latency_ms: 500,
        answer_excerpt: 'Spawn site uses execSync(..., { env }); parent env cannot override after overlay.',
      }],
    });
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
      recheck_prompts: [],
      recheck: null,
      rechecks: [],
    });
    expect(entry.consensus).toEqual(entry.adversarial_review);
  });
});
