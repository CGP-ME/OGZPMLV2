'use strict';

const {
  buildReportProvenance,
  buildGateContext,
  maybeWriteReport,
  P0_GATE_ID,
  pm2ProcessName,
  runGate,
  selectedGates,
} = require('../ogz-meta/gates/multi-runtime-gate-runner');

describe('multi-runtime gate runner eval PM2 context', () => {
  test('adds repo and P0 baseline provenance to gate reports', () => {
    const gitResponses = new Map([
      ['branch --show-current', 'codex/baseline-test\n'],
      ['rev-parse HEAD', 'abcdef1234567890abcdef1234567890abcdef12\n'],
      ['status --porcelain --untracked-files=no', ' M core/OrderExecutor.js\nM  core/StateManager.js\n'],
      ['diff --cached --name-only', 'core/StateManager.js\n'],
      ['diff --name-only', 'core/OrderExecutor.js\n'],
    ]);
    const p0Gate = {
      id: P0_GATE_ID,
      layer: 'p0',
      status: 'PASS',
      detail: {
        summary: { finalBalance: 10663.639172063286, totalTrades: 1596 },
        report: '/repo/backtest-report.json',
        reportMtimeMs: 1770000000000,
        log: '/repo/p0.log',
        runSpec: {
          candleFile: 'tuning/tsla-15m-2y.json',
          candleFileSha256: 'a'.repeat(64),
        },
        tuningProfile: { name: 'current-eval' },
        workerEnv: { SOLO_STRATEGY: 'EMASMACrossover' },
      },
    };

    const provenance = buildReportProvenance([p0Gate], {
      execFileSync: (_cmd, args) => gitResponses.get(args.join(' ')) || '',
      hashFile: (filePath) => `hash:${filePath}`,
    });

    expect(provenance.schemaVersion).toBe(2);
    expect(provenance.git).toEqual(expect.objectContaining({
      branch: 'codex/baseline-test',
      commit: 'abcdef1234567890abcdef1234567890abcdef12',
      shortCommit: 'abcdef12',
      trackedDirty: true,
      stagedPaths: ['core/StateManager.js'],
      unstagedTrackedPaths: ['core/OrderExecutor.js'],
    }));
    expect(provenance.git.trackedDirtyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.p0Baseline).toEqual(expect.objectContaining({
      gateId: P0_GATE_ID,
      classification: 'canonical',
      actual: p0Gate.detail.summary,
      reportMtimeMs: 1770000000000,
      reportSha256: 'hash:/repo/backtest-report.json',
      logSha256: 'hash:/repo/p0.log',
      runSpec: p0Gate.detail.runSpec,
      tuningProfile: p0Gate.detail.tuningProfile,
    }));
    expect(provenance.p0Baseline.expected.finalBalance).toBe(10663.639172063286);
    expect(provenance.p0Baseline.workerEnvHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.p0Baseline.historicalAnchors.length).toBeGreaterThan(0);
  });

  test('selects eval gate and builds PM2 env context without touching real PM2 in tests', () => {
    const argv = ['--eval', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);
    const context = buildGateContext(argv, gates, {
      readPm2ProcessEnv: (processName) => ({
        EXECUTION_MODE: 'paper',
        PM2_PROCESS_NAME: processName,
      }),
    });

    expect(gates.map((gate) => gate.id)).toEqual(['eval.live.posture_config']);
    expect(context).toEqual({
      evalSource: 'pm2:ogz-prime-v2',
      evalSourceEnv: {
        EXECUTION_MODE: 'paper',
        PM2_PROCESS_NAME: 'ogz-prime-v2',
      },
      evalOptions: { loadDotenv: false },
    });
  });

  test('allows PM2 context when eval gate is selected by explicit gate id', () => {
    const argv = ['--gate', 'eval.live.posture_config', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);
    const context = buildGateContext(argv, gates, {
      readPm2ProcessEnv: (processName) => ({ PM2_PROCESS_NAME: processName }),
    });

    expect(gates.map((gate) => gate.id)).toEqual(['eval.live.posture_config']);
    expect(context.evalSource).toBe('pm2:ogz-prime-v2');
    expect(context.evalSourceEnv.PM2_PROCESS_NAME).toBe('ogz-prime-v2');
    expect(context.evalOptions).toEqual({ loadDotenv: false });
  });

  test('rejects PM2 context when no eval gate is selected', () => {
    const argv = ['--scope', '--pm2', 'ogz-prime-v2'];
    const gates = selectedGates(argv);

    expect(() => buildGateContext(argv, gates, {
      readPm2ProcessEnv: () => ({}),
    })).toThrow(/--pm2 requires --eval, --all, or --gate eval\.live\.posture_config/);
  });

  test('fails loudly when PM2 flag omits process name', () => {
    expect(() => selectedGates(['--eval', '--pm2'])).toThrow(/--pm2 requires a process name or id/);
    expect(() => pm2ProcessName(['--pm2'])).toThrow(/--pm2 requires a process name or id/);
  });

  test('annotates source only on eval gate reports', async () => {
    const context = { evalSource: 'pm2:ogz-prime-v2', evalSourceEnv: { EXECUTION_MODE: 'paper' } };
    const evalResult = await runGate({
      id: 'eval.test',
      layer: 'eval',
      run: (ctx) => ({ env: ctx.evalSourceEnv.EXECUTION_MODE }),
    }, context);
    const scopeResult = await runGate({
      id: 'scope.test',
      layer: 'scope',
      run: () => ({ ok: true }),
    }, context);

    expect(evalResult.detail).toEqual({ env: 'paper', source: 'pm2:ogz-prime-v2' });
    expect(scopeResult.detail).toEqual({ ok: true });
  });

  test('writes latest report for actual gate runs without requiring --write-report', () => {
    const gates = selectedGates(['--p0']);
    expect(gates.map((gate) => gate.id)).toEqual([P0_GATE_ID]);
    const report = {
      generatedAt: '2026-06-16T00:00:00.000Z',
      branch: null,
      gates: [{
        id: gates[0].id,
        layer: gates[0].layer,
        status: 'PASS',
      }],
    };
    const writtenReports = [];
    const logLines = [];

    const wrote = maybeWriteReport(report, {
      writeReport: (candidate) => writtenReports.push(candidate),
      logger: (line) => logLines.push(line),
    });

    expect(wrote).toBe(true);
    expect(writtenReports).toEqual([report]);
    expect(logLines).toHaveLength(1);
    expect(logLines[0]).toMatch(/multi-runtime-latest\.json/);
  });

  test('does not write a latest report when no gate ran', () => {
    const writtenReports = [];

    const wrote = maybeWriteReport({ generatedAt: '2026-06-16T00:00:00.000Z', gates: [] }, {
      writeReport: (candidate) => writtenReports.push(candidate),
      logger: () => {},
    });

    expect(wrote).toBe(false);
    expect(writtenReports).toEqual([]);
  });
});
