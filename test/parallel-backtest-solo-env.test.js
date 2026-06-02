'use strict';

const {
  DEFAULT_DATA,
  DATA_SHORTCUTS,
  STRATEGIES,
  SWEEP_PRESETS,
  parseSoloStrategies,
  buildDormantStrategyEnableEnv,
  assertDormantStrategyEnvCompatible,
  buildWorkerBaseEnv,
  applySoloStrategyToConfigs,
} = require('../tools/parallel-backtest');

describe('parallel-backtest solo strategy env wiring', () => {
  test('tsla shortcut uses the current stock eval baseline', () => {
    expect(DEFAULT_DATA).toBe('tuning/tsla-15m-18mo.json');
    expect(DATA_SHORTCUTS.tsla).toBe('tuning/tsla-15m-18mo.json');
  });

  test('strategy roster includes exploratory strategies that matrix-sweep can run', () => {
    expect(STRATEGIES).toEqual(expect.arrayContaining([
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
      'SmartMoneySweep',
    ]));
    expect(STRATEGIES).not.toContain('MarketRegime');
  });

  test('strategy-sweep excludes deprecated MarketRegime strategy entries', () => {
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
});
