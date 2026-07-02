'use strict';

const fs = require('fs');
const path = require('path');

const {
  DEFAULT_DATA,
  DATA_SHORTCUTS,
  STOCK_DATA_SHORTCUTS,
  STRATEGIES,
  SWEEP_PRESETS,
  parseSoloStrategies,
  buildDormantStrategyEnableEnv,
  assertDormantStrategyEnvCompatible,
  buildWorkerBaseEnv,
  applySoloStrategyToConfigs,
  filterConfigsByName,
  parseBacktestOutput,
  describeFeePosture,
  tryReadReport,
  isCleanParsedResult,
  getWorkerFailureReason,
  writeWorkerOutputLog,
  buildWorkerProcessErrorResult,
} = require('../tools/parallel-backtest');
const {
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
} = require('../tools/backtest-worker-env');
const {
  PROFILE_FORBIDDEN_ENV_KEYS,
} = require('../tools/tuning-profiles');
const TradingConfig = require('../core/TradingConfig');

describe('parallel-backtest solo strategy env wiring', () => {
  function writeWorkerReport(projectRoot, tag, report) {
    const reportDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, `backtest-report-123-${tag}.json`),
      JSON.stringify(report, null, 2)
    );
  }

  function withProjectRoot(fn) {
    const root = fs.mkdtempSync(path.join(__dirname, '.tmp-parallel-report-'));
    try {
      return fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  test('tsla shortcut uses the current stock eval baseline', () => {
    const parallelConfig = TradingConfig.getParallelBacktestConfig();

    expect(DEFAULT_DATA).toBe(parallelConfig.defaultData);
    expect(DATA_SHORTCUTS).toEqual(parallelConfig.dataShortcuts);
    expect(STOCK_DATA_SHORTCUTS).toEqual(parallelConfig.stockDataShortcutKeys);
    expect(DATA_SHORTCUTS.tsla).toBe(parallelConfig.defaultData);
  });

  test('parallel runner sweep surface is owned by TradingConfig and read-only', () => {
    const parallelConfig = TradingConfig.getParallelBacktestConfig();

    expect(STRATEGIES).toEqual(parallelConfig.strategies);
    expect(SWEEP_PRESETS.real).toEqual(parallelConfig.sweepPresets.real);
    expect(SWEEP_PRESETS.atr).toEqual(parallelConfig.sweepPresets.atr);
    expect(SWEEP_PRESETS['strategy-sweep']).toEqual(parallelConfig.sweepPresets.strategySweep);
    expect(SWEEP_PRESETS['exit-geometry']).toEqual(parallelConfig.sweepPresets.exitGeometry);
    expect(Object.isFrozen(DATA_SHORTCUTS)).toBe(true);
    expect(Object.isFrozen(STOCK_DATA_SHORTCUTS)).toBe(true);
    expect(Object.isFrozen(STRATEGIES)).toBe(true);
    expect(Object.isFrozen(SWEEP_PRESETS)).toBe(true);
    expect(Object.isFrozen(SWEEP_PRESETS.real)).toBe(true);
    expect(Object.isFrozen(SWEEP_PRESETS['exit-geometry'])).toBe(true);
    expect(Object.isFrozen(SWEEP_PRESETS.real[0].env)).toBe(true);
    expect(Object.isFrozen(SWEEP_PRESETS['exit-geometry'][0].env)).toBe(true);

    expect(() => {
      SWEEP_PRESETS.real[0].env.ATR_FILTER_ENABLED = 'true';
    }).toThrow(TypeError);

    const full = SWEEP_PRESETS.full();
    full[0].env.ATR_FILTER_ENABLED = 'true';
    expect(TradingConfig.getParallelBacktestConfig().sweepPresets.real[0].env.ATR_FILTER_ENABLED)
      .toBeUndefined();
  });

  test('strategy roster excludes MarketRegime because it is a regime booster, not a solo strategy', () => {
    expect(STRATEGIES).toEqual(expect.arrayContaining([
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
      'SmartMoneySweep',
    ]));
    expect(STRATEGIES).toEqual([
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
    expect(STRATEGIES).not.toContain('MarketRegime');
  });

  test('strategy-sweep excludes MarketRegime solo coverage', () => {
    expect(SWEEP_PRESETS['strategy-sweep'].map(config => config.env.SOLO_STRATEGY))
      .not.toContain('MarketRegime');
  });

  test('comma-separated solo strategy list is normalized for orchestrator parity', () => {
    expect(parseSoloStrategies('NoWickImbalance, OpeningRangeBreakout, BreakRetest')).toEqual([
      'nowickimbalance',
      'openingrangebreakout',
      'breakretest',
    ]);
  });

  test('solo NoWick enables the dormant pipeline toggle for the child worker', () => {
    expect(buildDormantStrategyEnableEnv('NoWickImbalance')).toEqual({
      ENABLE_NOWICK: 'true',
    });
  });

  test('solo ORB and BreakRetest enable their dormant toggles for generated configs', () => {
    expect(buildDormantStrategyEnableEnv('OpeningRangeBreakout,BreakRetest')).toEqual({
      ENABLE_ORB: 'true',
      ENABLE_BREAKRETEST: 'true',
    });
  });

  test('solo DonchianBreakout enables its dormant toggle for the child worker', () => {
    expect(buildDormantStrategyEnableEnv('DonchianBreakout')).toEqual({
      ENABLE_DONCHIAN: 'true',
    });
  });

  test('solo RSI2MeanReversion and TimeSeriesMomentum enable dormant toggles for child workers', () => {
    expect(buildDormantStrategyEnableEnv('RSI2MeanReversion,TimeSeriesMomentum')).toEqual({
      ENABLE_RSI2_MR: 'true',
      ENABLE_TSMOM: 'true',
    });
  });

  test('solo SmartMoneySweep explicitly enables SMS for the child worker', () => {
    expect(buildDormantStrategyEnableEnv('SmartMoneySweep')).toEqual({
      ENABLE_SMS: 'true',
      SMS_VP_RTH_ONLY: 'true',
    });
  });

  test('non-solo runs do not silently override operator env flags', () => {
    expect(buildDormantStrategyEnableEnv('')).toEqual({});
    expect(buildDormantStrategyEnableEnv(null)).toEqual({});
  });

  test('contradictory solo config fails instead of silently disabling the selected strategy', () => {
    expect(() => assertDormantStrategyEnvCompatible('NoWickImbalance', {
      ENABLE_NOWICK: 'false',
    })).toThrow(/ENABLE_NOWICK=false conflicts with SOLO_STRATEGY=NoWickImbalance/);
  });

  test('worker base env strips parent-shell trading flags', () => {
    const workerEnv = buildWorkerBaseEnv({
      PATH: '/usr/bin',
      HOME: '/home/ogz',
      BACKTEST_OUTPUT_DIR: 'backtest-results',
      NODE_OPTIONS: '--max-old-space-size=4096',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'C.UTF-8',
      LC_CTYPE: 'en_US.UTF-8',
      EXECUTION_MODE: 'live',
      CANDLE_SOURCE: 'broker',
      CANDLE_DATA_FILE: 'wrong.json',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'false',
      STOP_LOSS_PERCENT: '99',
      TAKE_PROFIT_PERCENT: '99',
      MIN_TRADE_CONFIDENCE: '0.99',
      ATR_FILTER_ENABLED: 'true',
      ATR_MIN_PERCENT: '9.99',
      EXIT_SYSTEM: 'legacy',
      ENABLE_NOWICK: 'false',
      ENABLE_ORB: 'false',
      ENABLE_BREAKRETEST: 'false',
      ENABLE_SMS: 'false',
      SOLO_STRATEGY: 'RSI',
      FEE_SLIPPAGE: '0',
      DIRECTION_FILTER: 'long',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
    });

    expect(workerEnv).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/ogz',
      BACKTEST_OUTPUT_DIR: 'backtest-results',
      NODE_OPTIONS: '--max-old-space-size=4096',
    });
  });

  test('cli solo strategy becomes explicit config env without parent env fallback', () => {
    expect(applySoloStrategyToConfigs([
      { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
      { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25' } },
    ], 'RSI')).toEqual([
      { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false', SOLO_STRATEGY: 'RSI' } },
      { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25', SOLO_STRATEGY: 'RSI' } },
    ]);
  });

  test('cli solo strategy does not overwrite explicit per-config solo strategies', () => {
    expect(applySoloStrategyToConfigs([
      { name: 'NoWick-only', env: { SOLO_STRATEGY: 'NoWickImbalance' } },
      { name: 'baseline', env: {} },
    ], 'RSI')).toEqual([
      { name: 'NoWick-only', env: { SOLO_STRATEGY: 'NoWickImbalance' } },
      { name: 'baseline', env: { SOLO_STRATEGY: 'RSI' } },
    ]);
  });

  test('config name matcher narrows sweep configs without mutating presets', () => {
    const narrowed = filterConfigsByName(SWEEP_PRESETS['exit-geometry'], 'propema');

    expect(narrowed.map(config => config.name)).toEqual([
      'propema-current',
      'propema-tight-r',
      'propema-balanced-r',
    ]);
    expect(narrowed[0]).toEqual(SWEEP_PRESETS['exit-geometry'].find(config => config.name === 'propema-current'));
    expect(narrowed[0]).not.toBe(SWEEP_PRESETS['exit-geometry'].find(config => config.name === 'propema-current'));
  });

  test('config name matcher treats invalid regex text as a literal match', () => {
    expect(filterConfigsByName([
      { name: 'literal-(unclosed', env: {} },
      { name: 'propema-tight-r', env: {} },
    ], '(unclosed')).toEqual([
      { name: 'literal-(unclosed', env: {} },
    ]);
  });

  test('solo mode preserves explicit strategy-owned exit geometry overrides', () => {
    expect(applySoloStrategyToConfigs([
      {
        name: 'donchian-custom',
        env: {
          DONCHIAN_TAKE_PROFIT_PERCENT: '2.8',
        },
      },
    ], 'DonchianBreakout')).toEqual([
      {
        name: 'donchian-custom',
        env: {
          DONCHIAN_TAKE_PROFIT_PERCENT: '2.8',
          SOLO_STRATEGY: 'DonchianBreakout',
        },
      },
    ]);
  });

  test('all generated parallel sweep env keys are explicit worker override keys', () => {
    const keys = new Set();

    for (const preset of Object.values(SWEEP_PRESETS)) {
      const configs = typeof preset === 'function' ? preset() : preset;
      for (const config of configs || []) {
        for (const key of Object.keys(config.env || {})) keys.add(key);
      }
    }

    expect([...keys].sort()).toEqual([...keys].filter(key => CONFIG_ENV_OVERRIDE_ALLOWLIST.has(key)).sort());
  });

  test('exit geometry sweep uses strategy-owned keys without generic stop overrides', () => {
    const keys = new Set();

    for (const config of SWEEP_PRESETS['exit-geometry']) {
      for (const key of Object.keys(config.env || {})) keys.add(key);
    }

    expect([...keys].sort()).toEqual(expect.arrayContaining([
      'DONCHIAN_ATR_STOP_MULT',
      'TSMOM_STOP_LOSS_PERCENT',
      'RSI2_MR_STOP_LOSS_PERCENT',
      'PROPSAFE_EMA_TARGET_RR',
      'EMA_TREND_RETEST_TARGET_RR',
    ]));
    expect(keys.has('STOP_LOSS_PERCENT')).toBe(false);
    expect(keys.has('TAKE_PROFIT_PERCENT')).toBe(false);
    expect(keys.has('TRAILING_STOP_PERCENT')).toBe(false);
  });

  test('stock fee posture reports the owning venue fee profile model', () => {
    const profile = TradingConfig.resolveFeeProfile('ttp_real');

    expect(describeFeePosture(profile, true))
      .toBe('profile ttp_real: per-share minimum model (perShare=0.005, minOrder=0.75, slippage=0.0005)');
  });

  test('stock fee posture reports explicit zero venue fee profile and slippage', () => {
    const profile = TradingConfig.resolveFeeProfile('zero');

    expect(describeFeePosture(profile, true))
      .toBe('profile zero: stock zero-commission model, slippage=0.0005');
  });

  test('fee posture is not reported for non-stock backtests', () => {
    const profile = TradingConfig.resolveFeeProfile('ttp_real');

    expect(describeFeePosture(profile, false)).toBeNull();
  });

  test('parallel sweep presets never generate locked-exit env overrides', () => {
    const forbidden = new Set(PROFILE_FORBIDDEN_ENV_KEYS);

    for (const preset of Object.values(SWEEP_PRESETS)) {
      const configs = typeof preset === 'function' ? preset() : preset;
      for (const config of configs || []) {
        expect(Object.keys(config.env || {}).filter(key => forbidden.has(key))).toEqual([]);
      }
    }
  });

  test('report fallback preserves worker errors, report path, and zero stock fees', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'parallel-abc', {
        summary: {
          finalBalance: 10005,
          totalFeesPaid: 0,
          errors: 2,
          maxDrawdownPercent: '0.10',
          profitFactor: '1.20',
          expectancy: '0.50',
        },
        trades: [
          { netPnlDollars: 5, feesDollars: 0 },
        ],
      });

      const result = tryReadReport(projectRoot, 'parallel-abc');

      expect(result.netPnl).toBe(5);
      expect(result.fees).toBe(0);
      expect(result.workerErrors).toBe(2);
      expect(result.reportPath).toMatch(/backtest-report-123-parallel-abc\.json$/);
      expect(isCleanParsedResult({ ...result, exitCode: 0 })).toBe(false);
    });
  });

  test('report fallback derives pnl from explicit non-10k starting balance', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'parallel-5k', {
        summary: {
          finalBalance: 4979.57,
          startingBalance: 5000,
          totalTrades: 6,
          winRate: '0.0',
          errors: 0,
        },
        trades: [],
      });

      const result = tryReadReport(projectRoot, 'parallel-5k');

      expect(result.finalBalance).toBe(4979.57);
      expect(result.startingBalance).toBe(5000);
      expect(result.netPnl).toBeCloseTo(-20.43, 10);
    });
  });

  test('report fallback does not invent pnl when starting balance is missing', () => {
    withProjectRoot((projectRoot) => {
      writeWorkerReport(projectRoot, 'parallel-no-start', {
        summary: {
          finalBalance: 4979.57,
          totalTrades: 6,
          winRate: '0.0',
          errors: 0,
        },
        trades: [],
      });

      const result = tryReadReport(projectRoot, 'parallel-no-start');

      expect(result.finalBalance).toBe(4979.57);
      expect(result.startingBalance).toBeNull();
      expect(result.netPnl).toBeNull();
      expect(isCleanParsedResult({ ...result, exitCode: 0 })).toBe(false);
    });
  });

  test('stdout parser uses the final worker error count', () => {
    const parsed = parseBacktestOutput([
      'Progress: 5000/10000 candles | Errors: 0',
      'Final Balance: $10010.00',
      'Total Trades: 4',
      'Win Rate: 50.0%',
      'Net P&L: $10.00',
      'Errors: 3',
    ].join('\n'), 'atr-off');

    expect(parsed.workerErrors).toBe(3);
    expect(isCleanParsedResult({ ...parsed, exitCode: 0 })).toBe(false);
  });

  test('stdout parser derives pnl from explicit non-10k starting balance', () => {
    const parsed = parseBacktestOutput([
      'Starting Balance: $5000.00',
      'Final Balance: $4979.57',
      'Total Trades: 6',
      'Win Rate: 0.0%',
      'Errors: 0',
    ].join('\n'), 'ttp-5k');

    expect(parsed.startingBalance).toBe(5000);
    expect(parsed.netPnl).toBeCloseTo(-20.43, 10);
  });

  test('nonzero worker exit remains an explicit failed result even with parsed pnl', () => {
    const result = {
      name: 'atr-off',
      netPnl: 123.45,
      workerErrors: 0,
      exitCode: 1,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker exited with code 1');
  });

  test('malformed worker error containers fail closed instead of ranking', () => {
    const result = {
      name: 'atr-off',
      netPnl: 123.45,
      workerErrors: ['candle-parse-error-a', 'candle-parse-error-b'],
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 2 candle processing error(s)');
  });

  test('malformed inherited worker error objects fail closed', () => {
    const result = {
      name: 'atr-off',
      netPnl: 123.45,
      workerErrors: Object.create({ message: 'candle parse failed' }),
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 1 candle processing error(s)');
  });

  test('malformed string worker errors fail closed while numeric zero string stays clean', () => {
    expect(isCleanParsedResult({
      name: 'atr-zero',
      netPnl: 123.45,
      workerErrors: '0',
      exitCode: 0,
    })).toBe(true);

    const result = {
      name: 'atr-off',
      netPnl: 123.45,
      workerErrors: 'candle-parse-error-a',
      exitCode: 0,
    };

    expect(isCleanParsedResult(result)).toBe(false);
    expect(getWorkerFailureReason(result)).toBe('Worker reported 1 candle processing error(s)');
  });

  test('worker log writer preserves duplicate report-tag outputs', () => {
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-parallel-worker-logs-'));
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
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-parallel-empty-worker-log-'));
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
    const workerLogDir = fs.mkdtempSync(path.join(__dirname, '.tmp-parallel-spawn-error-log-'));
    try {
      const result = buildWorkerProcessErrorResult(
        { name: 'atr-off', env: {} },
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
