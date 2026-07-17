'use strict';

const fs = require('fs');
const path = require('path');

const {
  DEFAULT_DATA,
  DATA_SHORTCUTS,
  STOCK_TICKERS,
  VALIDATED_STRATEGIES,
  ALL_STRATEGIES,
  GRID,
  usesStructuralExits,
  filterStrategiesForPhase,
  generateMatrix,
  getDataLabel,
  buildMonotonicTierCube,
  parseOutput,
  tryReadReport,
  isCleanParsedResult,
  getWorkerFailureReason,
  writeWorkerOutputLog,
  buildWorkerProcessErrorResult,
} = require('../tools/matrix-sweep');
const {
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
} = require('../tools/backtest-worker-env');
const {
  PROFILE_FORBIDDEN_ENV_KEYS,
} = require('../tools/tuning-profiles');
const ConfigLoader = require('../foundation/ConfigLoader');
const { BASE_CONFIG } = ConfigLoader;

describe('matrix-sweep runnable surface', () => {
  function writeWorkerReport(projectRoot, tag, report) {
    const reportDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, `backtest-report-123-${tag}.json`),
      JSON.stringify(report, null, 2)
    );
  }

  function writeCampaignReport(projectRoot, outputRoot, tag, report) {
    const reportDir = path.join(projectRoot, outputRoot, 'runs', tag);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'report-TSLA.json'),
      JSON.stringify(report, null, 2)
    );
    return reportDir;
  }

  function withProjectRoot(fn) {
    const root = fs.mkdtempSync(path.join(__dirname, '.tmp-matrix-report-'));
    try {
      return fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  test('tsla shortcut uses the current stock eval baseline', () => {
    const matrixConfig = ConfigLoader.getMatrixSweepConfig();

    expect(DEFAULT_DATA).toBe(matrixConfig.defaultData);
    expect(DATA_SHORTCUTS.tsla).toBe(matrixConfig.defaultData);
    expect(getDataLabel(DATA_SHORTCUTS.tsla)).toBe('tsla-2y');
  });

  test('matrix sweep surface is owned by ConfigLoader and read-only', () => {
    const matrixConfig = ConfigLoader.getMatrixSweepConfig();

    expect(DATA_SHORTCUTS).toEqual(matrixConfig.dataShortcuts);
    expect(STOCK_TICKERS).toEqual(matrixConfig.stockTickers);
    expect(VALIDATED_STRATEGIES).toEqual(matrixConfig.validatedStrategies);
    expect(ALL_STRATEGIES).toEqual([
      ...matrixConfig.validatedStrategies,
      ...matrixConfig.exploratoryStrategies,
    ]);
    expect(GRID.full.confidence).toEqual(matrixConfig.grid.full.confidence);
    expect(GRID.full.stopLoss).toEqual(matrixConfig.grid.full.stopLoss);
    expect(GRID.quick.tierPresets).toEqual(matrixConfig.grid.quick.tierPresets);
    expect(GRID.quick.stopLoss).toEqual(matrixConfig.grid.quick.stopLoss);
    expect(GRID.conf.tierPresets).toBeNull();
    expect(GRID.conf.stopLoss).toBeNull();
    expect(GRID.conf.confidence).toEqual(matrixConfig.grid.conf.confidence);
    expect(GRID.conf.strategyParams).toEqual(matrixConfig.grid.conf.strategyParams);
    expect(GRID.conf.strategyParams.PropSafeEMAPullback['strategies.PropSafeEMAPullback.pullbackLookbackBars'])
      .toEqual([3, 5, 8]);
    expect(GRID.exits.confidence).toEqual(matrixConfig.grid.exits.confidence);
    expect(GRID.exits.stopLoss).toEqual(matrixConfig.grid.exits.stopLoss);
    expect(GRID.exits.tierPresets).toEqual(buildMonotonicTierCube(matrixConfig.grid.exits.tierGrid));

    expect(Object.isFrozen(DATA_SHORTCUTS)).toBe(true);
    expect(Object.isFrozen(STOCK_TICKERS)).toBe(true);
    expect(Object.isFrozen(VALIDATED_STRATEGIES)).toBe(true);
    expect(Object.isFrozen(ALL_STRATEGIES)).toBe(true);
    expect(Object.isFrozen(GRID)).toBe(true);
    expect(Object.isFrozen(GRID.full)).toBe(true);
    expect(Object.isFrozen(GRID.full.tierPresets)).toBe(true);
    expect(Object.isFrozen(GRID.full.tierPresets[0])).toBe(true);

    expect(() => {
      GRID.full.tierPresets[0].t1 = 0.99;
    }).toThrow(TypeError);
    expect(() => {
      GRID.full.confidence.push(0.99);
    }).toThrow(TypeError);
    expect(() => {
      GRID.conf.strategyParams.PropSafeEMAPullback['strategies.PropSafeEMAPullback.pullbackLookbackBars'].push(13);
    }).toThrow(TypeError);
  });

  test('sweep roster excludes MarketRegime because it is a regime booster, not a solo strategy', () => {
    expect(ALL_STRATEGIES).toEqual(expect.arrayContaining([
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
      'SmartMoneySweep',
    ]));
    expect(ALL_STRATEGIES).toEqual([
      'RSI',
      'EMASMACrossover',
      'MADynamicSR',
      'LiquiditySweep',
      'SmartMoneySweep',
      'MultiTimeframe',
      'OGZTPO',
      'OpeningRangeBreakout',
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'DonchianBreakout',
      'PropSafeEMAPullback',
      'EMATrendRetest',
      'RSI2MeanReversion',
      'TimeSeriesMomentum',
    ]);
    expect(ALL_STRATEGIES).not.toContain('MarketRegime');
  });

  test('structural-exit strategies are excluded from exit-geometry phases', () => {
    expect(usesStructuralExits('LiquiditySweep')).toBe(true);
    expect(usesStructuralExits('SmartMoneySweep')).toBe(true);
    expect(usesStructuralExits('NoWickImbalance')).toBe(true);
    expect(usesStructuralExits('BreakRetest')).toBe(true);
    expect(usesStructuralExits('OpeningRangeBreakout')).toBe(true);

    expect(filterStrategiesForPhase([
      'RSI',
      'LiquiditySweep',
      'SmartMoneySweep',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
    ], 'exits')).toEqual({
      runnable: ['RSI'],
      skipped: [
        'LiquiditySweep',
        'SmartMoneySweep',
        'NoWickImbalance',
        'BreakRetest',
        'OpeningRangeBreakout',
      ],
    });
  });

  test('structural-exit strategies can still run confidence sweeps', () => {
    const configs = generateMatrix(['NoWickImbalance'], GRID.conf, 'conf');

    expect(configs).toHaveLength(GRID.conf.confidence.length);
    expect(configs.every(config => config.strategy === 'NoWickImbalance')).toBe(true);
    expect(configs.every(config => config.env.ENABLE_NOWICK === 'true')).toBe(true);
  });

  test('DonchianBreakout solo matrix configs carry the explicit roster enable flag', () => {
    const configs = generateMatrix(['DonchianBreakout'], GRID.conf, 'conf');

    expect(configs).toHaveLength(GRID.conf.confidence.length);
    expect(configs.every(config => config.strategy === 'DonchianBreakout')).toBe(true);
    expect(configs.every(config => config.env.SOLO_STRATEGY === 'DonchianBreakout')).toBe(true);
    expect(configs.every(config => config.env.ENABLE_DONCHIAN === 'true')).toBe(true);
  });

  test('wake roster strategies carry explicit solo matrix enable flags', () => {
    const configs = generateMatrix(['RSI2MeanReversion', 'TimeSeriesMomentum'], GRID.conf, 'conf');

    expect(configs).toHaveLength(GRID.conf.confidence.length * 2);
    expect(configs.filter(config => config.strategy === 'RSI2MeanReversion')
      .every(config => config.env.ENABLE_RSI2_MR === 'true')).toBe(true);
    expect(configs.filter(config => config.strategy === 'TimeSeriesMomentum')
      .every(config => config.env.ENABLE_TSMOM === 'true')).toBe(true);
  });

  test('PropSafeEMAPullback pullback lookback sweep stays inside caged backtest overrides', () => {
    const configs = generateMatrix(['PropSafeEMAPullback'], GRID.conf, 'conf');
    const payloads = configs.map(config => JSON.parse(config.env.BACKTEST_CONFIG_OVERRIDES_JSON));
    const values = payloads.map(payload => payload['strategies.PropSafeEMAPullback.pullbackLookbackBars']);

    expect(configs).toHaveLength(GRID.conf.confidence.length * 3);
    expect(new Set(values)).toEqual(new Set([3, 5, 8]));
    expect(configs.every(config => config.env.ENABLE_PROPSAFE_EMA === 'true')).toBe(true);
    expect(configs.every(config => config.env.PROPSAFE_EMA_PULLBACK_LOOKBACK === undefined)).toBe(true);
    expect(configs.every(config => config.strategyParams != null)).toBe(true);
    expect(configs.every(config => config.strategyParams['strategies.PropSafeEMAPullback.pullbackLookbackBars'] != null)).toBe(true);
  });

  test('structural-exit strategies generate no false full or exit matrices', () => {
    expect(generateMatrix(['NoWickImbalance'], GRID.exits, 'exits')).toHaveLength(0);
    expect(generateMatrix(['LiquiditySweep'], GRID.full, 'full')).toHaveLength(0);
    expect(generateMatrix(['SmartMoneySweep'], GRID.quick, 'quick')).toHaveLength(0);
    expect(generateMatrix(['BreakRetest'], GRID.exits, 'exits')).toHaveLength(0);
    expect(generateMatrix(['OpeningRangeBreakout'], GRID.full, 'full')).toHaveLength(0);
  });

  test('all generated matrix env keys are explicit worker override keys', () => {
    const keys = new Set();

    for (const phase of Object.keys(GRID)) {
      const configs = generateMatrix(ALL_STRATEGIES, GRID[phase], phase);
      for (const config of configs || []) {
        for (const key of Object.keys(config.env || {})) keys.add(key);
      }
    }

    expect([...keys].sort()).toEqual([...keys].filter(key => CONFIG_ENV_OVERRIDE_ALLOWLIST.has(key)).sort());
  });

  test('matrix sweeps never generate global locked-exit env overrides', () => {
    const forbidden = new Set(PROFILE_FORBIDDEN_ENV_KEYS);

    for (const phase of Object.keys(GRID)) {
      const configs = generateMatrix(ALL_STRATEGIES, GRID[phase], phase);
      for (const config of configs || []) {
        const directForbidden = Object.keys(config.env || {})
          .filter(key => key !== 'BACKTEST_CONFIG_OVERRIDES_JSON')
          .filter(key => forbidden.has(key));
        expect(directForbidden).toEqual([]);
      }
    }
  });

  test('exit phase sweeps strategy stop geometry through backtest config override payload', () => {
    const configs = generateMatrix(['RSI'], GRID.exits, 'exits');
    const lockedRsiStop = Math.abs(BASE_CONFIG.exitContracts.RSI.stopLossPercent);

    expect(configs).toHaveLength(GRID.exits.stopLoss.length * GRID.exits.tierPresets.length * GRID.exits.confidence.length);
    expect(configs.every(config => config.lockedSL === lockedRsiStop)).toBe(true);
    expect(configs.every(config => config.env.STOP_LOSS_PERCENT === undefined)).toBe(true);
    expect(configs.every(config => config.env.TAKE_PROFIT_PERCENT === undefined)).toBe(true);
    expect(new Set(configs.map(config => config.env.TIER1_TARGET)).size).toBeGreaterThan(1);

    const stopPayloads = configs.map(config => JSON.parse(config.env.BACKTEST_CONFIG_OVERRIDES_JSON));
    expect(new Set(stopPayloads.map(payload => payload['exitContracts.RSI.stopLossPercent'])).size)
      .toBe(GRID.exits.stopLoss.length);
    expect(stopPayloads.some(payload => payload['exitContracts.RSI.stopLossPercent'] === -2.5))
      .toBe(true);
    expect(stopPayloads.every(payload => Number.isFinite(payload['confidence.minTradeConfidence'])))
      .toBe(true);
  });

  test('timeframe grid dimension stamps rows and stays caged in config overrides', () => {
    const grid = {
      ...GRID.conf,
      confidence: [0.4],
      timeframes: ['15m', '1h'],
    };

    const configs = generateMatrix(['RSI'], grid, 'conf');

    expect(configs).toHaveLength(2);
    expect(configs.map(config => config.timeframe)).toEqual(['15m', '1h']);
    expect(configs.map(config => config.name)).toEqual([
      expect.stringContaining('_tf15m_'),
      expect.stringContaining('_tf1h_'),
    ]);

    const payloads = configs.map(config => JSON.parse(config.env.BACKTEST_CONFIG_OVERRIDES_JSON));
    expect(payloads.map(payload => payload['broker.candleTimeframe'])).toEqual(['15m', '1h']);
    expect(configs.every(config => config.env.CANDLE_TIMEFRAME === undefined)).toBe(true);
  });

  test('confidence phase keeps locked strategy contract without stop override payload', () => {
    const configs = generateMatrix(['EMASMACrossover'], GRID.conf, 'conf');
    const lockedEmaStop = Math.abs(BASE_CONFIG.exitContracts.EMASMACrossover.stopLossPercent);
    const payloads = configs.map(config => JSON.parse(config.env.BACKTEST_CONFIG_OVERRIDES_JSON));

    expect(configs).toHaveLength(GRID.conf.confidence.length);
    expect(configs.every(config => config.lockedSL === lockedEmaStop)).toBe(true);
    expect(configs.every(config => config.sl === lockedEmaStop)).toBe(true);
    expect(configs.every(config => config.env.MIN_TRADE_CONFIDENCE === undefined)).toBe(true);
    expect(payloads.every(payload => payload['exitContracts.EMASMACrossover.stopLossPercent'] === undefined)).toBe(true);
    expect(payloads.map(payload => payload['confidence.minTradeConfidence'])).toEqual(GRID.conf.confidence);
  });

  test('report fallback preserves worker errors, report path, and zero stock fees', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'matrix-abc', {
        summary: {
          finalBalance: 10005,
          totalFeesPaid: 0,
          errors: 2,
          maxDrawdownPercent: '0.10',
          profitFactor: '1.20',
          expectancy: '0.50',
        },
        trades: [
          {
            strategyName: 'RSI',
            netPnlDollars: 5,
            feesDollars: 0,
            dayOfWeek: 'Mon',
            session: 'morning',
            holdBucket: 'scalp',
            confidenceTier: 'high',
            exitType: 'take_profit',
          },
        ],
      });

      const result = tryReadReport(projectRoot, 'matrix-abc');

      expect(result.netPnl).toBe(5);
      expect(result.fees).toBe(0);
      expect(result.workerErrors).toBe(2);
      expect(result.reportPath).toMatch(/backtest-report-123-matrix-abc\.json$/);
      expect(result.dimensionAgg).toHaveLength(1);
      expect(isCleanParsedResult({ ...result, exitCode: 0 })).toBe(false);
    });
  });

  test('report fallback uses worker starting balance instead of a 10k phantom baseline', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'matrix-5k', {
        summary: {
          startingBalance: 5000,
          finalBalance: 4646.028301641066,
          totalFeesPaid: 300,
          errors: 0,
          totalTrades: 200,
        },
        trades: [
          { strategyName: 'SmartMoneySweep', netPnlDollars: -1, feesDollars: 0 },
        ],
      });

      const result = tryReadReport(projectRoot, 'matrix-5k');

      expect(result.startingBalance).toBe(5000);
      expect(result.finalBalance).toBe(4646.028301641066);
      expect(result.netPnl).toBeCloseTo(-353.97169835893436, 10);
      expect(result.fees).toBe(300);
    });
  });

  test('report fallback keeps zero-trade 5k reports parseable when final balance is present', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'matrix-zero', {
        summary: {
          totalTrades: 0,
          message: 'No trades recorded',
          initialBalance: 5000,
          finalBalance: 5000,
          totalPnL: 0,
          errors: 0,
        },
        trades: [],
        config: {
          initialBalance: 5000,
        },
      });

      const result = tryReadReport(projectRoot, 'matrix-zero');

      expect(result.startingBalance).toBe(5000);
      expect(result.finalBalance).toBe(5000);
      expect(result.netPnl).toBe(0);
      expect(result.trades).toBeNull();
    });
  });

  test('report fallback reads tagged reports from campaign output roots', () => {
    withProjectRoot((projectRoot) => {
      writeCampaignReport(projectRoot, 'campaign-output', 'matrix-campaign', {
        summary: {
          startingBalance: 5000,
          finalBalance: 5001.25,
          totalFeesPaid: 0.75,
          errors: 0,
          totalTrades: 1,
        },
        trades: [
          { strategyName: 'RSI', netPnlDollars: 1.25, feesDollars: 0.75 },
        ],
      });

      const result = tryReadReport(projectRoot, 'matrix-campaign', path.join(projectRoot, 'campaign-output'));

      expect(result.reportPath).toBe(path.join(projectRoot, 'campaign-output', 'runs', 'matrix-campaign', 'report-TSLA.json'));
      expect(result.trades).toBe(1);
      expect(result.finalBalance).toBe(5001.25);
    });
  });

  test('stdout parser uses the final worker error count', () => {
    const parsed = parseOutput([
      'Progress: 5000/10000 candles | Errors: 0',
      'Final Balance: $10010.00',
      'Total Trades: 4',
      'Win Rate: 50.0%',
      'Net P&L: $10.00',
      'Errors: 3',
    ].join('\n'), { name: 'rsi-conf', strategy: 'RSI' });

    expect(parsed.workerErrors).toBe(3);
    expect(isCleanParsedResult({ ...parsed, exitCode: 0 })).toBe(false);
  });

  test('stdout parser uses printed starting balance for final-balance pnl fallback', () => {
    const parsed = parseOutput([
      'Starting Balance:  $5,000',
      'Final Balance:     $4,646.03',
      'Total Trades: 200',
      'Win Rate: 11.5%',
      'Errors: 0',
    ].join('\n'), { name: 'sms-conf', strategy: 'SmartMoneySweep' });

    expect(parsed.startingBalance).toBe(5000);
    expect(parsed.finalBalance).toBe(4646.03);
    expect(parsed.netPnl).toBeCloseTo(-353.97, 10);
  });

  test('nonzero worker exit remains an explicit failed result even with parsed pnl', () => {
    const result = {
      name: 'rsi-conf',
      strategy: 'RSI',
      netPnl: 123.45,
      workerErrors: 0,
      exitCode: 1,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker exited with code 1');
  });

  test('malformed worker error containers fail closed instead of ranking', () => {
    const result = {
      name: 'rsi-conf',
      strategy: 'RSI',
      netPnl: 123.45,
      workerErrors: ['candle-parse-error-a', 'candle-parse-error-b'],
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 2 candle processing error(s)');
  });

  test('malformed inherited worker error objects fail closed', () => {
    const result = {
      name: 'rsi-conf',
      strategy: 'RSI',
      netPnl: 123.45,
      workerErrors: Object.create({ message: 'candle parse failed' }),
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 1 candle processing error(s)');
  });

  test('malformed string worker errors fail closed while numeric zero string stays clean', () => {
    expect(isCleanParsedResult({
      name: 'rsi-zero',
      strategy: 'RSI',
      netPnl: 123.45,
      workerErrors: '0',
      exitCode: 0,
    })).toBe(true);

    const result = {
      name: 'rsi-conf',
      strategy: 'RSI',
      netPnl: 123.45,
      workerErrors: 'candle-parse-error-a',
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 1 candle processing error(s)');
  });

  test('worker log writer preserves duplicate report-tag outputs', () => {
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-matrix-worker-logs-'));
    try {
      const first = writeWorkerOutputLog('same-tag', 'first output', workerLogDir);
      const second = writeWorkerOutputLog('same-tag', 'second output', workerLogDir);

      expect(first).not.toBe(second);
      expect(fs.readFileSync(first, 'utf8')).toBe('first output');
      expect(fs.readFileSync(second, 'utf8')).toBe('second output');
    } finally {
      fs.rmSync(workerLogDir, { recursive: true, force: true });
    }
  });

  test('worker log writer preserves empty captured output for failed workers', () => {
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-matrix-empty-worker-log-'));
    try {
      const logPath = writeWorkerOutputLog('empty-output', '', workerLogDir);

      expect(logPath).toMatch(/empty-output\.log$/);
      expect(fs.existsSync(logPath)).toBe(true);
      expect(fs.readFileSync(logPath, 'utf8')).toBe('');
    } finally {
      fs.rmSync(workerLogDir, { recursive: true, force: true });
    }
  });

  test('spawn error result keeps an empty worker log path', () => {
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-matrix-spawn-error-log-'));
    try {
      const result = buildWorkerProcessErrorResult(
        { name: 'rsi-conf', strategy: 'RSI', env: {} },
        { EXECUTION_MODE: 'backtest' },
        'spawn-error',
        '',
        new Error('spawn failed'),
        '0.1',
        workerLogDir
      );

      expect(result.error).toBe('spawn failed');
      expect(result.workerLogPath).toMatch(/spawn-error\.log$/);
      expect(fs.existsSync(result.workerLogPath)).toBe(true);
      expect(fs.readFileSync(result.workerLogPath, 'utf8')).toBe('');
      expect(isCleanParsedResult(result)).toBe(false);
    } finally {
      fs.rmSync(workerLogDir, { recursive: true, force: true });
    }
  });
});
