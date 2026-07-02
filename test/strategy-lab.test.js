'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildStrategyLab,
  renderMarkdown,
  writeStrategyLab,
} = require('../tools/strategy-lab');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.tmp-strategy-lab-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

function trade(overrides = {}) {
  return {
    strategyName: 'RSI',
    netPnlDollars: 1,
    feesDollars: 1.5,
    holdTimeMinutes: 40,
    exitReason: 'profit_tier_1',
    session: 'morning',
    confidenceTier: 'high',
    direction: 'long',
    ...overrides,
  };
}

function repeatTrades(count, overrides = {}) {
  return Array.from({ length: count }, () => trade(overrides));
}

describe('strategy lab dossier generator', () => {
  test('rejects matrix reports without the required explicit ttp_real fee profile', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-zero.json', {
        results: [{
          strategy: 'RSI',
          netPnl: 50,
          trades: 120,
        }],
      });

      expect(() => buildStrategyLab([reportPath])).toThrow(
        /requires fee profile ttp_real.*UNKNOWN/
      );
    });
  });

  test('does not allow Strategy Lab callers to downgrade the required fee profile', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-zero.json', {
        feeProfile: { name: 'zero' },
        results: [],
      });

      expect(() => buildStrategyLab([reportPath], { requiredFeeProfile: 'zero' })).toThrow(
        /only supports ttp_real/
      );
    });
  });

  test('does not allow Strategy Lab callers to lower the sample gate below 100 trades', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'empty-worker.json', {
        workerEnv: { BACKTEST_FEE_PROFILE: 'ttp_real' },
        trades: [],
      });

      expect(() => buildStrategyLab([reportPath], { minTrades: 0 })).toThrow(
        /minTrades must be an integer >= 100/
      );
      expect(() => buildStrategyLab([reportPath], { minTrades: -1 })).toThrow(
        /minTrades must be an integer >= 100/
      );
    });
  });

  test('rejects ttp_real matrix rows that report trades without fee evidence', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-fake-ttp.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_fake_keep',
          strategy: 'RSI',
          netPnl: 250,
          trades: 250,
          fees: 0,
          reportPath: path.join(dir, 'worker.json'),
        }],
        trades: [],
      });

      expect(() => buildStrategyLab([reportPath])).toThrow(
        /requires nonzero ttp_real fee evidence/
      );
    });
  });

  test('rejects matrix rows with per-result fee profile overrides', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-row-override.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_row_override',
          strategy: 'RSI',
          netPnl: 250,
          trades: 250,
          fees: 375,
          reportPath: path.join(dir, 'worker.json'),
          workerEnv: { BACKTEST_FEE_PROFILE: 'zero' },
        }],
      });

      expect(() => buildStrategyLab([reportPath])).toThrow(
        /requires fee profile ttp_real.*zero/
      );
    });
  });

  test('rejects matrix rows whose reported trades do not link to a worker report', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-missing-worker.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_missing_worker',
          strategy: 'RSI',
          netPnl: 250,
          trades: 250,
          fees: 375,
          reportPath: path.join(dir, 'missing-worker.json'),
        }],
      });

      expect(() => buildStrategyLab([reportPath])).toThrow(
        /reportPath not found/
      );
    });
  });

  test('rejects ttp_real worker reports with trades missing per-trade fees', () => {
    withTempDir(dir => {
      const workerPath = path.join(dir, 'worker-fake-ttp.json');
      const matrixPath = writeJson(dir, 'matrix-linked-to-fake-worker.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_fake_worker',
          strategy: 'RSI',
          netPnl: 120,
          trades: 120,
          fees: 180,
          reportPath: workerPath,
        }],
      });
      writeJson(dir, 'worker-fake-ttp.json', {
        trades: Array.from({ length: 120 }, () => ({
          strategyName: 'RSI',
          netPnlDollars: 1,
          holdTimeMinutes: 30,
          exitReason: 'profit_tier_1',
          session: 'morning',
          confidenceTier: 'high',
          direction: 'long',
        })),
      });

      expect(() => buildStrategyLab([matrixPath])).toThrow(
        /requires per-trade ttp_real fee evidence/
      );
    });
  });

  test('rejects linked worker reports that explicitly declare a non-ttp fee profile', () => {
    withTempDir(dir => {
      const workerPath = path.join(dir, 'worker-zero-profile.json');
      const matrixPath = writeJson(dir, 'matrix-linked-to-zero-worker.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_zero_worker',
          strategy: 'RSI',
          netPnl: 120,
          trades: 120,
          fees: 180,
          reportPath: workerPath,
        }],
      });
      writeJson(dir, 'worker-zero-profile.json', {
        workerEnv: { BACKTEST_FEE_PROFILE: 'zero' },
        trades: repeatTrades(120),
      });

      expect(() => buildStrategyLab([matrixPath])).toThrow(
        /requires fee profile ttp_real.*zero/
      );
    });
  });

  test('rejects linked worker reports without trade rows', () => {
    withTempDir(dir => {
      const workerPath = path.join(dir, 'worker-empty.json');
      const matrixPath = writeJson(dir, 'matrix-linked-to-empty-worker.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_empty_worker',
          strategy: 'RSI',
          netPnl: 120,
          trades: 120,
          fees: 180,
          reportPath: workerPath,
        }],
      });
      writeJson(dir, 'worker-empty.json', {
        trades: [],
      });

      expect(() => buildStrategyLab([matrixPath])).toThrow(
        /requires non-empty trades array/
      );
    });
  });

  test('rejects standalone worker reports that are not linked by matrix reportPath', () => {
    withTempDir(dir => {
      const workerPath = writeJson(dir, 'worker-standalone.json', {
        feeProfile: { name: 'ttp_real' },
        trades: repeatTrades(120),
      });

      expect(() => buildStrategyLab([workerPath])).toThrow(
        /worker report must be linked by matrix reportPath/
      );
    });
  });

  test('builds keep and insufficient-sample dossiers from matrix and worker reports', () => {
    withTempDir(dir => {
      const rsiReportPath = path.join(dir, 'rsi-worker.json');
      const madReportPath = path.join(dir, 'mad-worker.json');
      writeJson(dir, 'rsi-worker.json', {
        trades: [
          ...repeatTrades(100, { netPnlDollars: 5, holdTimeMinutes: 300 }),
          ...repeatTrades(20, { netPnlDollars: -3, holdTimeMinutes: 20, exitReason: 'stop_loss' }),
        ],
      });
      writeJson(dir, 'mad-worker.json', {
        trades: repeatTrades(24, {
          strategyName: 'MADynamicSR',
          netPnlDollars: -2,
          exitReason: 'stop_loss',
        }),
      });
      const matrixPath = writeJson(dir, 'matrix-ttp.json', {
        feeProfile: { name: 'ttp_real' },
        results: [
          {
            name: 'RSI_c55',
            strategy: 'RSI',
            netPnl: 120,
            trades: 120,
            winRate: 60,
            profitFactor: 1.8,
            expectancy: 1,
            fees: 180,
            conf: 0.55,
            reportPath: rsiReportPath,
          },
          {
            name: 'RSI_c65',
            strategy: 'RSI',
            netPnl: 80,
            trades: 118,
            winRate: 58,
            profitFactor: 1.4,
            expectancy: 0.67,
            fees: 177,
            conf: 0.65,
            reportPath: rsiReportPath,
          },
          {
            name: 'MAD_c70',
            strategy: 'MADynamicSR',
            netPnl: -20,
            trades: 24,
            winRate: 45,
            profitFactor: 0.8,
            expectancy: -0.83,
            fees: 36,
            conf: 0.70,
            reportPath: madReportPath,
          },
        ],
      });
      const report = buildStrategyLab([matrixPath], { minTrades: 100 });

      expect(report.requiredFeeProfile).toBe('ttp_real');
      expect(report.dossiers.RSI.verdict).toBe('KEEP_CANDIDATE');
      expect(report.dossiers.RSI.sampleGate).toEqual({
        minTrades: 100,
        observedTrades: 120,
        passed: true,
      });
      expect(report.dossiers.RSI.matrix.best.name).toBe('RSI_c55');
      expect(report.dossiers.RSI.matrix.profitableConfigs).toBe(2);
      expect(report.dossiers.RSI.trades.byExitReason.stop_loss.count).toBe(20);
      expect(report.dossiers.RSI.trades.avgHoldWinnerMinutes).toBe(300);
      expect(report.dossiers.RSI.trades.avgHoldLoserMinutes).toBe(20);

      expect(report.dossiers.MADynamicSR.verdict).toBe('INSUFFICIENT_SAMPLE');
      expect(report.dossiers.MADynamicSR.sampleGate.observedTrades).toBe(24);
    });
  });

  test('writes json and markdown dossiers with roster decision evidence', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'matrix-ttp.json', {
        feeProfile: { name: 'ttp_real' },
        results: [{
          name: 'RSI_c55',
          strategy: 'RSI',
          netPnl: -10,
          trades: 120,
          winRate: 40,
          fees: 180,
          reportPath: path.join(dir, 'rsi-worker.json'),
        }],
      });
      writeJson(dir, 'rsi-worker.json', {
        trades: repeatTrades(120, { netPnlDollars: -1, exitReason: 'stop_loss' }),
      });
      const report = buildStrategyLab([reportPath], { minTrades: 100 });
      const outDir = path.join(dir, 'lab');
      const written = writeStrategyLab(report, outDir);
      const markdown = fs.readFileSync(written.mdPath, 'utf8');

      expect(fs.existsSync(written.jsonPath)).toBe(true);
      expect(markdown).toContain('# Strategy Lab Dossiers');
      expect(markdown).toContain('| RSI | KILL_CANDIDATE | 120/100 | -10.00 | -10.00 | 0/1 |');
      expect(markdown).toContain('Evidence:');
      expect(markdown).toContain('matrix_result:');
      expect(markdown).toContain('fees=180.00');
      expect(renderMarkdown(report)).toContain('Required fee profile: ttp_real');
    });
  });
});
