'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  validateMatrixRun,
  validateWorkerReport,
} = require('../tools/campaign-integrity');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.tmp-campaign-integrity-'));
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

function workerReport(overrides = {}) {
  return {
    summary: {
      startingBalance: 10000,
      finalBalance: 10004,
      totalTrades: 1,
      candlesProcessed: 3,
    },
    metrics: {
      totalTrades: 1,
    },
    dataCoverage: {
      dataFile: 'fixture',
      symbol: 'TSLA',
      timeframe: '15m',
      expectedCandles: 3,
      candlesProcessed: 3,
      startTimestamp: 1000,
      endTimestamp: 3000,
      complete: true,
    },
    trades: [{
      entryPrice: 100,
      exitPrice: 105,
      closedOrderQuantity: 1,
      feesDollars: 1,
      rawPnlDollars: 5,
      netPnlDollars: 4,
      strategyName: 'RSI',
      direction: 'long',
      entryTime: '2026-07-01T13:30:00.000Z',
      exitTime: '2026-07-01T13:45:00.000Z',
      mfePercent: 6,
      maePercent: -1,
    }],
    ...overrides,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function greenDataParity(dataFile) {
  return {
    status: 'PASS',
    checks: {
      provenance: true,
      sameWindow: true,
      groundTruth: true,
    },
    dataFile: path.resolve(dataFile),
    dataFileSha256: sha256File(dataFile),
    stampedAt: '2026-07-03T00:00:00.000Z',
    path: 'data-parity.json',
  };
}

describe('campaign integrity validator', () => {
  test('passes a zero-trade matrix run when candle provenance is present', () => {
    withTempDir(dir => {
      const dataFile = writeJson(dir, 'candles.json', [
        { timestamp: 1000, close: 100 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]);
      const matrixPath = writeJson(dir, 'matrix.json', {
        dataFile,
        results: [{ name: 'RSI', strategy: 'RSI', trades: 0 }],
      });

      const result = validateMatrixRun({ matrixReportPath: matrixPath, outputDir: dir, dataParityStamp: greenDataParity(dataFile) });

      expect(result.status).toBe('PASS');
      expect(result.trades).toBe(0);
      expect(result.checks).toEqual({
        identity: true,
        lifecycle: true,
        fields: true,
        coverage: true,
        schema: true,
        dataParity: true,
      });
    });
  });

  test('stamps worker report failed when accounting identity is broken', () => {
    withTempDir(dir => {
      const dataFile = writeJson(dir, 'candles.json', [
        { timestamp: 1000, close: 100 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]);
      const reportPath = writeJson(dir, 'worker.json', workerReport({
        summary: {
          startingBalance: 10000,
          finalBalance: 10005,
          totalTrades: 1,
          candlesProcessed: 3,
        },
      }));
      const matrixPath = writeJson(dir, 'matrix.json', {
        dataFile,
        results: [{ name: 'RSI', strategy: 'RSI', trades: 1, reportPath }],
      });

      const result = validateMatrixRun({ matrixReportPath: matrixPath, outputDir: dir, dataParityStamp: greenDataParity(dataFile) });
      const stampedWorker = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

      expect(result.status).toBe('FAILED-INTEGRITY');
      expect(result.checks.identity).toBe(false);
      expect(stampedWorker.integrityStamp.status).toBe('FAILED-INTEGRITY');
      expect(stampedWorker.integrityStamp.checks.identity).toBe(false);
    });
  });

  test('fails a matrix run without a green data parity stamp', () => {
    withTempDir(dir => {
      const dataFile = writeJson(dir, 'candles.json', [
        { timestamp: 1000, close: 100 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]);
      const matrixPath = writeJson(dir, 'matrix.json', {
        dataFile,
        results: [{ name: 'RSI', strategy: 'RSI', trades: 0 }],
      });

      const result = validateMatrixRun({ matrixReportPath: matrixPath, outputDir: dir });

      expect(result.status).toBe('FAILED-INTEGRITY');
      expect(result.checks.dataParity).toBe(false);
    });
  });

  test('fails a matrix run when data parity hash no longer matches the data file', () => {
    withTempDir(dir => {
      const dataFile = writeJson(dir, 'candles.json', [
        { timestamp: 1000, close: 100 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]);
      const staleStamp = greenDataParity(dataFile);
      fs.writeFileSync(dataFile, JSON.stringify([
        { timestamp: 1000, close: 999 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]));
      const matrixPath = writeJson(dir, 'matrix.json', {
        dataFile,
        results: [{ name: 'RSI', strategy: 'RSI', trades: 0 }],
      });

      const result = validateMatrixRun({ matrixReportPath: matrixPath, outputDir: dir, dataParityStamp: staleStamp });

      expect(result.status).toBe('FAILED-INTEGRITY');
      expect(result.details.dataParity.errors).toContain('data parity dataFileSha256 does not match current data file');
    });
  });

  test('validates current decision-ledger rows without treating decision count as trade count', () => {
    withTempDir(dir => {
      const dataFile = writeJson(dir, 'candles.json', [
        { timestamp: 1000, close: 100 },
        { timestamp: 2000, close: 101 },
        { timestamp: 3000, close: 102 },
      ]);
      fs.mkdirSync(path.join(dir, 'ledger'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'ledger', 'decisions_2026-07-03.jsonl'), `${JSON.stringify({
        tradeId: 'SIM_1',
        candleTimestamp: 1000,
        symbol: 'TSLA',
        timeframe: '15m',
        executionMode: 'backtest',
        entryPrice: 100,
        direction: 'long',
        strategySignals: [{
          name: 'RSI',
          direction: 'long',
          baseConfidence: 0.65,
          reason: 'RSI Oversold',
        }],
        orchestratorDecision: {
          winnerStrategy: 'RSI',
          finalConfidence: 0.65,
          reason: 'RSI selected',
          competingStrategies: [{
            name: 'RSI',
            adjustedConfidence: 0.65,
            rejected: false,
            rejectReason: null,
          }],
        },
        positionSizing: {
          basePercent: 0.05,
          confidenceMultiplier: 1,
          confluenceMultiplier: 1,
          finalPercent: 0.05,
          finalSizeUsd: 250,
          formula: 'test',
        },
        exitContract: {
          stopLossPercent: -0.8,
          takeProfitPercent: 1,
          maxHoldTimeMinutes: 240,
          atrMinPercent: null,
          strategyName: 'RSI',
          timeframe: '15m',
          createdAt: 1783102853759,
          signalConfidence: 0.65,
          _validated: '2026-03-20',
        },
        riskGates: [
          { gate: 'direction_filter', threshold: 'both', value: 'buy', passed: true },
          { gate: 'shorts_enabled', threshold: true, value: 'not_applicable', passed: true },
          { gate: 'same_direction_block', threshold: null, value: 'buy', passed: true },
          { gate: 'fee_edge', threshold: 3, value: 4.5, passed: true },
        ],
      })}\n`);
      const matrixPath = writeJson(dir, 'matrix.json', {
        dataFile,
        results: [{ name: 'RSI', strategy: 'RSI', trades: 0 }],
      });

      const result = validateMatrixRun({ matrixReportPath: matrixPath, outputDir: dir, dataParityStamp: greenDataParity(dataFile) });

      expect(result.status).toBe('PASS');
      expect(result.checks.schema).toBe(true);
      expect(result.checks.lifecycle).toBe(true);
      expect(result.details.schema.rows).toBe(1);
    });
  });

  test('passes a worker report with balanced accounting, full fields, and complete coverage', () => {
    withTempDir(dir => {
      const reportPath = writeJson(dir, 'worker.json', workerReport());

      const result = validateWorkerReport(reportPath);

      expect(result.status).toBe('PASS');
      expect(result.checks.accounting.ok).toBe(true);
      expect(result.checks.fields.ok).toBe(true);
      expect(result.checks.coverage.ok).toBe(true);
    });
  });

  test('fails worker report field integrity when MFE or MAE is missing', () => {
    withTempDir(dir => {
      const report = workerReport();
      delete report.trades[0].mfePercent;
      const reportPath = writeJson(dir, 'worker-missing-mfe.json', report);

      const result = validateWorkerReport(reportPath);

      expect(result.status).toBe('FAIL');
      expect(result.checks.fields.ok).toBe(false);
      expect(result.checks.fields.errors).toContain('trades[0].mfePercent missing/null');
    });
  });
});
