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
    })).toBe('inconclusive_toolfail');

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
    })).toBe('inconclusive_toolfail');

    expect(classifyMercuryVerdict({
      result: {
        termination: 'answer_given',
        answer: 'No concrete break found. core/Foo.js:1-2',
      },
      autoBlastRadius: {
        errors: [{ file: '<current_changes>', error: 'spawnSync git ENOBUFS' }],
      },
    })).toBe('inconclusive_toolfail');

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
    expect(entry.verdict).toBe('no_break_found');
    expect(entry.commit_blocking).toBe(false);
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
      effective_blocking: false,
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
      effective_verdict: null,
      effective_blocking: false,
      raw_parsed_verdict: null,
      max_rechecks: null,
      recheck_prompt_excerpt: null,
      recheck_prompt_full: null,
      recheck_prompts: [],
      recheck_prompts_full: [],
      recheck: null,
      rechecks: [],
      answer_excerpt: null,
      answer_full: null,
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
      recheck_prompt_full: null,
      recheck_prompts: [],
      recheck_prompts_full: [],
      recheck: null,
      rechecks: [],
    });
    expect(entry.consensus).toEqual(entry.adversarial_review);
  });

  test('persists full adversarial review text and marks toolfail reviews as non-authoritative', () => {
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

    expect(entry.verdict).toBe('inconclusive_toolfail');
    expect(entry.commit_blocking).toBe(false);
    expect(entry.adversarial_review.answer_excerpt).toContain('[truncated');
    expect(entry.adversarial_review.answer_full).toBe(longReview);
    expect(entry.adversarial_review.raw_parsed_verdict).toBe('found_break');
    expect(entry.adversarial_review.effective_verdict).toBe('inconclusive_toolfail');
    expect(entry.adversarial_review.effective_blocking).toBe(false);
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
    expect(toolFailureEntry.commit_blocking).toBe(false);

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
    expect(cannotVerifyEntry.commit_blocking).toBe(false);
  });
});
