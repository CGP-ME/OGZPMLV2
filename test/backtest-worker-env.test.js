'use strict';

const path = require('path');
const TradingConfig = require('../core/TradingConfig');
const {
  CANONICAL_BACKTEST_ENV,
  STOCK_ZERO_FEE_ENV,
  buildWorkerBaseEnv,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
} = require('../tools/backtest-worker-env');
const {
  PROFILE_FORBIDDEN_ENV_KEYS,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
} = require('../tools/tuning-profiles');
const {
  buildGridSearchEnv,
} = require('../tools/grid-search-confidence');

describe('backtest worker env contract', () => {
  const projectRoot = '/repo';
  const LOCKED_EXIT_PROFILE_KEYS = [
    'STOP_LOSS_PERCENT',
    'TAKE_PROFIT_PERCENT',
    'TRAILING_STOP_PERCENT',
    'TRAILING_ACTIVATION',
  ];

  function buildEnv(overrides = {}) {
    return buildBacktestWorkerEnv({
      sourceEnv: {
        PATH: '/usr/bin',
        HOME: '/home/ogz',
        DIRECTION_FILTER: 'long_only',
        ACCOUNT_DRAWDOWN_BYPASS: 'false',
        RISK_MANAGER_BYPASS: 'false',
        EXIT_SYSTEM: 'contract',
        FEE_MAKER: '0.99',
        FEE_TAKER: '0.99',
        FEE_TOTAL_ROUNDTRIP: '0.99',
        FEE_SAFETY_BUFFER: '0.99',
        FEE_SLIPPAGE: '0',
        ENABLE_NOWICK: 'false',
        SOLO_STRATEGY: 'NoWickImbalance',
        TUNING_PROFILE: 'legacy-wide',
        BACKTEST_TUNING_PROFILE: 'missing-profile',
      },
      projectRoot,
      dataFile: 'tuning/tsla-15m-2y.json',
      stateFile: '/repo/data/state-test.json',
      dataDir: '/repo/data/backtest',
      reportTag: 'test-worker',
      stockMode: true,
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
      ...overrides,
    });
  }

  function expectLockedExitProfileKeysAbsent(env) {
    for (const key of LOCKED_EXIT_PROFILE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(env, key)).toBe(false);
    }
  }

  test('base env copies only system/runtime variables', () => {
    expect(buildWorkerBaseEnv({
      PATH: '/usr/bin',
      HOME: '/home/ogz',
      NODE_OPTIONS: '--max-old-space-size=4096',
      DIRECTION_FILTER: 'long_only',
      FEE_SLIPPAGE: '0',
      SOLO_STRATEGY: 'RSI',
    })).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/ogz',
      NODE_OPTIONS: '--max-old-space-size=4096',
    });
  });

  test('canonical worker env values are owned by TradingConfig and exported read-only', () => {
    expect(CANONICAL_BACKTEST_ENV).toEqual(TradingConfig.getBacktestWorkerEnvDefaults());
    expect(STOCK_ZERO_FEE_ENV).toEqual(TradingConfig.getBacktestStockZeroFeeEnv());
    expect(Object.isFrozen(CANONICAL_BACKTEST_ENV)).toBe(true);
    expect(Object.isFrozen(STOCK_ZERO_FEE_ENV)).toBe(true);

    expect(() => {
      CANONICAL_BACKTEST_ENV.EXECUTION_MODE = 'live';
    }).toThrow(TypeError);
    expect(() => {
      STOCK_ZERO_FEE_ENV.FEE_MAKER = '0.99';
    }).toThrow(TypeError);

    expect(TradingConfig.getBacktestWorkerEnvDefaults().EXECUTION_MODE).toBe('backtest');
    expect(TradingConfig.getBacktestStockZeroFeeEnv().FEE_MAKER).toBe('0');
  });

  test('canonical stock worker env preserves explicit direction while blocking other trading drift', () => {
    const env = buildEnv();

    expect(env.EXECUTION_MODE).toBe('backtest');
    expect(env.CANDLE_SOURCE).toBe('file');
    expect(env.CANDLE_DATA_FILE).toBe(path.resolve(projectRoot, 'tuning/tsla-15m-2y.json'));
    expect(env.TEST_MODE).toBe('false');
    expect(env.LIVE_TRADING).toBe('false');
    expect(env.ENABLE_LIVE_TRADING).toBe('false');
    expect(env.CONFIRM_LIVE_TRADING).toBe('false');
    expect(env.WEBHOOK_ORDERS_ENABLED).toBe('false');
    expect(env.WEBHOOK_DRY_RUN).toBe('true');
    expect(env.EVAL_RULES_ENABLED).toBe('false');
    expect(env.TTP_RULES_ENABLED).toBe('false');
    expect(env.BACKTEST_NO_PATTERN_SAVE).toBe('true');
    expect(env.DIRECTION_FILTER).toBe('both');
    expect(env.ACCOUNT_DRAWDOWN_BYPASS).toBe('true');
    expect(env.RISK_MANAGER_BYPASS).toBe('true');
    expect(env.MAX_DRAWDOWN).toBe('5');
    expect(env.MAX_DAILY_LOSS).toBe('1');
    expect(env.MAX_WEEKLY_LOSS).toBe('5');
    expect(env.MAX_MONTHLY_LOSS).toBe('5');
    expect(env.EXIT_SYSTEM).toBe('legacy');
    expect(env.FEE_MAKER).toBe('0');
    expect(env.FEE_TAKER).toBe('0');
    expect(env.FEE_TOTAL_ROUNDTRIP).toBe('0');
    expect(env.FEE_MODEL).toBeUndefined();
    expect(env.FEE_PER_SHARE).toBeUndefined();
    expect(env.FEE_MIN_ORDER).toBeUndefined();
    expect(env.FEE_SAFETY_BUFFER).toBe('0');
    expect(env.FEE_SLIPPAGE).toBe('0.0005');
    expect(env.TUNING_PROFILE).toBe('current-eval');
    expect(env.BACKTEST_TUNING_PROFILE).toBe('current-eval');
    expect(env.ENABLE_DYNAMIC_SIZING).toBe('true');
    expect(env.MAX_POSITION_SIZE_PCT).toBe('0.05');
    expect(env.ENTRY_STOCK_SHARE_RANGE_ENABLED).toBeUndefined();
    expect(env.ENTRY_MIN_STOCK_SHARES).toBeUndefined();
    expect(env.ENTRY_MAX_STOCK_SHARES).toBeUndefined();
    expect(env.TIER1_TARGET).toBe('0.007');
    expect(env.FINAL_TARGET).toBe('0.025');
    expectLockedExitProfileKeysAbsent(env);
    expect(env.SOLO_STRATEGY).toBeUndefined();
    expect(env.ENABLE_NOWICK).toBeUndefined();
  });

  test('stock mode cannot be applied to crypto instrument data', () => {
    expect(() => buildEnv({
      instrumentEnv: {
        TRADING_PAIR: 'BTC-USD',
        BROKER: 'kraken',
        ASSET_CLASS: 'crypto',
        CANDLE_TIMEFRAME: '1m',
      },
    })).toThrow(/stockMode=true requires ASSET_CLASS=stocks/);
  });

  test('stock mode cannot be applied to crypto data files', () => {
    expect(() => buildEnv({
      dataFile: 'data/polygon-btc-1y.json',
      instrumentEnv: {
        TRADING_PAIR: 'BTC-USD',
        BROKER: 'kraken',
        ASSET_CLASS: 'crypto',
      },
    })).toThrow(/stockMode=true requires ASSET_CLASS=stocks/);
  });

  test('stock instrument data cannot run without stock mode', () => {
    expect(() => buildEnv({ stockMode: false }))
      .toThrow(/stock data requires stockMode=true/);
  });

  test('instrument env requires explicit asset class', () => {
    expect(() => buildEnv({
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        CANDLE_TIMEFRAME: '15m',
      },
    })).toThrow(/instrumentEnv requires ASSET_CLASS/);
  });

  test('instrument env cannot spoof stock metadata for crypto data file', () => {
    expect(() => buildEnv({
      dataFile: 'data/polygon-btc-1y.json',
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
      },
    })).toThrow(/instrumentEnv\.TRADING_PAIR=TSLA conflicts with dataFile-derived TRADING_PAIR=BTC-USD/);
  });

  test('instrument env timeframe must match the selected data file', () => {
    expect(() => buildEnv({
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '1m',
      },
    })).toThrow(/instrumentEnv\.CANDLE_TIMEFRAME=1m conflicts with dataFile-derived CANDLE_TIMEFRAME=15m/);
  });

  test('tuning profiles cannot own runtime mode or pattern-write protection keys', () => {
    expect(PROFILE_FORBIDDEN_ENV_KEYS).toEqual(expect.arrayContaining([
      'EXECUTION_MODE',
      'CANDLE_SOURCE',
      'BACKTEST_MODE',
      'TEST_MODE',
      'BACKTEST_NO_PATTERN_SAVE',
      'PAPER_TRADING',
      'NODE_ENV',
    ]));
  });

  test('explicit legacy-wide profile loads only tracked source-backed values', () => {
    const env = buildEnv({
      stockMode: true,
      profileName: 'legacy-wide',
    });

    expect(env.TUNING_PROFILE).toBe('legacy-wide');
    expect(env.BACKTEST_TUNING_PROFILE).toBe('legacy-wide');
    expect(env.ENABLE_DYNAMIC_SIZING).toBe('true');
    expect(env.MAX_POSITION_SIZE_PCT).toBe('0.05');
    expect(env.ABSOLUTE_POSITION_CAP).toBe('0.15');
    expect(env.TIER1_TARGET).toBe('0.020');
    expect(env.FINAL_TARGET).toBe('0.100');
    expectLockedExitProfileKeysAbsent(env);
  });

  test('explicit TTP 5k MAX profile keeps prop-fee settings in stock mode', () => {
    const env = buildEnv({
      stockMode: true,
      profileName: 'ttp-5k-max',
    });

    expect(env.TUNING_PROFILE).toBe('ttp-5k-max');
    expect(env.BACKTEST_TUNING_PROFILE).toBe('ttp-5k-max');
    expect(env.INITIAL_BALANCE).toBe('5000');
    expect(env.MIN_TRADE_CONFIDENCE).toBe('0.5');
    expect(env.MAX_DRAWDOWN).toBe('3');
    expect(env.MAX_DAILY_LOSS).toBe('1');
    expect(env.MAX_WEEKLY_LOSS).toBe('3');
    expect(env.MAX_MONTHLY_LOSS).toBe('3');
    expect(env.RISK_MANAGER_BYPASS).toBe('false');
    expect(env.ACCOUNT_DRAWDOWN_BYPASS).toBe('false');
    expect(env.ACCOUNT_DRAWDOWN_PCT).toBe('-3.0');
    expect(env.ATR_MIN_PERCENT).toBe('0.40');
    expect(env.MAX_POSITION_SIZE_PCT).toBe('0.10');
    expect(env.ABSOLUTE_POSITION_CAP).toBe('1.00');
    expect(env.ENTRY_STOCK_SHARE_RANGE_ENABLED).toBe('true');
    expect(env.ENTRY_MIN_STOCK_SHARES).toBe('2');
    expect(env.ENTRY_MAX_STOCK_SHARES).toBe('0');
    expect(env.ENTRY_MAX_STOCK_NOTIONAL).toBe('5000');
    expect(env.FEE_MODEL).toBe('per_share_minimum');
    expect(env.FEE_PER_SHARE).toBe('0.005');
    expect(env.FEE_MIN_ORDER).toBe('0.75');
    expect(env.FEE_MAKER).toBe('0');
    expect(env.FEE_TAKER).toBe('0');
    expect(env.TTP_DAILY_LOSS_LIMIT_DOLLARS).toBe('50');
    expect(env.TTP_MAX_LOSS_THRESHOLD_EQUITY).toBe('4850');
    expect(env.TTP_PROFIT_TARGET_DOLLARS).toBe('300');
    expectLockedExitProfileKeysAbsent(env);
  });

  test('TTP 5k MAX profile fees beat ambient source env fee leftovers', () => {
    const env = buildEnv({
      stockMode: true,
      profileName: 'ttp-5k-max',
      sourceEnv: {
        FEE_MODEL: 'percent',
        FEE_PER_SHARE: '0.010',
        FEE_MIN_ORDER: '1.00',
      },
    });

    expect(env.FEE_MODEL).toBe('per_share_minimum');
    expect(env.FEE_PER_SHARE).toBe('0.005');
    expect(env.FEE_MIN_ORDER).toBe('0.75');
  });

  test('explicit config fee model cannot override TTP 5k MAX profile fees', () => {
    expect(() => buildEnv({
      stockMode: true,
      profileName: 'ttp-5k-max',
      sourceEnv: {
        FEE_MODEL: 'percent',
        FEE_PER_SHARE: '0.010',
        FEE_MIN_ORDER: '1.00',
      },
      configEnv: {
        FEE_MODEL: 'per_share_minimum',
        FEE_PER_SHARE: '0.006',
        FEE_MIN_ORDER: '0.80',
      },
    })).toThrow(/Disallowed configEnv override 'FEE_MODEL'/);
  });

  test('unknown tuning profile fails loudly instead of falling back to eval sizing', () => {
    expect(() => buildEnv({ profileName: 'missing-profile' }))
      .toThrow(/Unknown tuning profile 'missing-profile'/);
    expect(() => buildEnv({ profileName: 'config-d-flat' }))
      .toThrow(/Unknown tuning profile 'config-d-flat'/);
  });

  test('sweep config env can still override only intentional sweep dimensions', () => {
    const env = buildEnv({
      stockMode: true,
      configEnv: {
        SOLO_STRATEGY: 'RSI',
        ATR_FILTER_ENABLED: 'true',
        ATR_MIN_PERCENT: '0.25',
        MAX_POSITION_SIZE_PCT: '0.07',
        RISK_MANAGER_BYPASS: 'false',
      },
    });

    expect(env.SOLO_STRATEGY).toBe('RSI');
    expect(env.ATR_FILTER_ENABLED).toBe('true');
    expect(env.ATR_MIN_PERCENT).toBe('0.25');
    expect(env.MAX_POSITION_SIZE_PCT).toBe('0.07');
    expect(env.RISK_MANAGER_BYPASS).toBe('false');
    expect(env.MAX_DRAWDOWN).toBe('5');
    expect(env.MAX_DAILY_LOSS).toBe('1');
    expect(env.MAX_WEEKLY_LOSS).toBe('5');
    expect(env.MAX_MONTHLY_LOSS).toBe('5');
    expect(env.DIRECTION_FILTER).toBe('both');
    expect(env.FEE_SLIPPAGE).toBe('0.0005');
  });

  test('strategy-owned exit geometry sweep keys are explicit worker inputs', () => {
    const env = buildEnv({
      stockMode: true,
      configEnv: {
        SOLO_STRATEGY: 'TimeSeriesMomentum',
        ENABLE_TSMOM: 'true',
        TSMOM_MIN_RETURN: '0.006',
        TSMOM_STOP_LOSS_PERCENT: '-1.0',
        TSMOM_TAKE_PROFIT_PERCENT: '2.4',
        TSMOM_TRAILING_STOP_PERCENT: '0.8',
        TSMOM_TRAILING_ACTIVATION: '1.0',
        TSMOM_MAX_HOLD_MINUTES: '180',
      },
    });

    expect(env.SOLO_STRATEGY).toBe('TimeSeriesMomentum');
    expect(env.ENABLE_TSMOM).toBe('true');
    expect(env.TSMOM_MIN_RETURN).toBe('0.006');
    expect(env.TSMOM_STOP_LOSS_PERCENT).toBe('-1.0');
    expect(env.TSMOM_TAKE_PROFIT_PERCENT).toBe('2.4');
    expect(env.TSMOM_TRAILING_STOP_PERCENT).toBe('0.8');
    expect(env.TSMOM_TRAILING_ACTIVATION).toBe('1.0');
    expect(env.TSMOM_MAX_HOLD_MINUTES).toBe('180');
    expect(env.STOP_LOSS_PERCENT).toBeUndefined();
    expect(env.TAKE_PROFIT_PERCENT).toBeUndefined();
    expect(env.TRAILING_STOP_PERCENT).toBeUndefined();
  });

  test('explicit source fee model does not reach stock worker profile economics', () => {
    const env = buildEnv({
      sourceEnv: {
        PATH: '/usr/bin',
        FEE_MODEL: 'per_share_minimum',
        FEE_PER_SHARE: '0.005',
        FEE_MIN_ORDER: '0.75',
      },
    });

    expect(env.FEE_MODEL).toBeUndefined();
    expect(env.FEE_PER_SHARE).toBeUndefined();
    expect(env.FEE_MIN_ORDER).toBeUndefined();
    expect(env.FEE_MAKER).toBe('0');
    expect(env.FEE_TAKER).toBe('0');
    expect(env.FEE_TOTAL_ROUNDTRIP).toBe('0');

    const summary = summarizeWorkerEnv(env);
    expect(summary.FEE_MODEL).toBeUndefined();
    expect(summary.FEE_PER_SHARE).toBeUndefined();
    expect(summary.FEE_MIN_ORDER).toBeUndefined();
  });

  test('explicit config fee model fails instead of overriding profile economics', () => {
    expect(() => buildEnv({
      sourceEnv: {
        PATH: '/usr/bin',
        FEE_MODEL: 'percent',
        FEE_PER_SHARE: '0.001',
        FEE_MIN_ORDER: '0.25',
      },
      configEnv: {
        FEE_MODEL: 'per_share_minimum',
        FEE_PER_SHARE: '0.005',
        FEE_MIN_ORDER: '0.75',
      },
    })).toThrow(/Disallowed configEnv override 'FEE_MODEL'/);
  });

  test('explicit sweep direction wins over source env and legacy alias normalizes', () => {
    const env = buildEnv({
      stockMode: true,
      sourceEnv: {
        PATH: '/usr/bin',
        DIRECTION_FILTER: 'long',
      },
      configEnv: {
        SOLO_STRATEGY: 'RSI',
        DIRECTION_FILTER: 'short',
      },
    });

    expect(env.DIRECTION_FILTER).toBe('short_only');
    expect(summarizeWorkerEnv(env).DIRECTION_FILTER).toBe('short_only');
  });

  test('invalid direction filters fail loudly instead of falling back to both', () => {
    expect(() => buildEnv({
      configEnv: {
        DIRECTION_FILTER: 'sideways',
      },
    })).toThrow(/Invalid configEnv DIRECTION_FILTER 'sideways'/);
  });

  test('profile-owned config env overrides fail loudly instead of lying about profile posture', () => {
    expect(() => buildEnv({
      profileName: 'legacy-wide',
      configEnv: {
        ENABLE_DYNAMIC_SIZING: 'false',
      },
    })).toThrow(/Disallowed configEnv override 'ENABLE_DYNAMIC_SIZING'/);
  });

  test('locked-exit config env overrides fail loudly instead of pretending to tune contracts', () => {
    for (const key of LOCKED_EXIT_PROFILE_KEYS) {
      expect(() => buildEnv({
        configEnv: {
          [key]: '1',
        },
      })).toThrow(new RegExp("Disallowed configEnv override '" + key + "'"));
    }
  });

  test('runtime mode config env overrides fail loudly instead of changing worker identity', () => {
    for (const key of ['EXECUTION_MODE', 'CANDLE_SOURCE', 'BACKTEST_MODE', 'TEST_MODE', 'BACKTEST_NO_PATTERN_SAVE', 'PAPER_TRADING', 'NODE_ENV']) {
      expect(() => buildEnv({
        configEnv: {
          [key]: '1',
        },
      })).toThrow(new RegExp("Disallowed configEnv override '" + key + "'"));
    }
  });

  test('instrument env cannot override trading tunables or fees', () => {
    expect(() => buildEnv({
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
        FEE_MAKER: '0.99',
      },
    })).toThrow(/Disallowed instrumentEnv override 'FEE_MAKER'/);
  });

  test('summary includes audit-relevant contract fields without full process env', () => {
    const summary = summarizeWorkerEnv(buildEnv({
      stockMode: true,
      configEnv: {
        SOLO_STRATEGY: 'DonchianBreakout',
        ENABLE_DONCHIAN: 'true',
        DONCHIAN_ATR_STOP_MULT: '1.2',
        DONCHIAN_TAKE_PROFIT_PERCENT: '1.8',
        DONCHIAN_TRAILING_STOP_PERCENT: '0.6',
        DONCHIAN_TRAILING_ACTIVATION: '0.8',
        DONCHIAN_MAX_HOLD_MINUTES: '240',
        ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
        MTF_BOOSTER_MIN_SCORE: '0.25',
        MTF_BOOSTER_MIN_CONFIDENCE: '0.55',
        MTF_BOOSTER_STRENGTH_MULT: '0.3',
        MTF_BOOSTER_MAX_MULT: '1.2',
        MTF_BOOSTER_CONFLICT_MULT: '0.75',
        MTF_BOOSTER_PENALIZE_CONFLICTS: 'true',
        MTF_BOOSTER_BOOST_MTF_CANDIDATE: 'false',
        EMA_MTF_HOURLY_TREND_VETO_MULT: '0.65',
        EMA_MTF_4H_MACD_BOOST_MULT: '1.15',
        EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH: '0.3',
        MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN: 'true',
        MASR_MTF_4H_ALIGN_BOOST: '0.08',
        MASR_MTF_4H_COMPRESSION_BANDWIDTH: '0.01',
        RSI_MTF_VETO_AGAINST_4H_TREND: 'true',
        RSI_MTF_1H_RSI_ALIGN_BOOST: '0.1',
        RSI_MTF_1H_RSI_BUY_MAX: '40',
        RSI_MTF_1H_RSI_SELL_MIN: '60',
        MTF_REQUIRE_HIGHER_TF_READY: '1h,4h',
        OGZTPO_MTF_4H_TREND_BOOST_MULT: '1.12',
        OGZTPO_MTF_1H_MACD_BOOST_MULT: '1.08',
        OGZTPO_MTF_4H_VOL_STOP_WIDEN: 'true',
        OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD: '0.015',
        OGZTPO_MTF_STOP_WIDEN_FACTOR: '0.25',
      },
    }));

    expect(summary).toMatchObject({
      EXECUTION_MODE: 'backtest',
      TEST_MODE: 'false',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      DIRECTION_FILTER: 'both',
      EXIT_SYSTEM: 'legacy',
      TUNING_PROFILE: 'current-eval',
      ENABLE_DYNAMIC_SIZING: 'true',
      MAX_POSITION_SIZE_PCT: '0.05',
      TIER1_TARGET: '0.007',
      FINAL_TARGET: '0.025',
      FEE_MAKER: '0',
      FEE_SLIPPAGE: '0.0005',
      TRADING_PAIR: 'TSLA',
      SOLO_STRATEGY: 'DonchianBreakout',
      ENABLE_DONCHIAN: 'true',
      DONCHIAN_ATR_STOP_MULT: '1.2',
      DONCHIAN_TAKE_PROFIT_PERCENT: '1.8',
      DONCHIAN_TRAILING_STOP_PERCENT: '0.6',
      DONCHIAN_TRAILING_ACTIVATION: '0.8',
      DONCHIAN_MAX_HOLD_MINUTES: '240',
      ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
      MTF_BOOSTER_MIN_SCORE: '0.25',
      MTF_BOOSTER_MIN_CONFIDENCE: '0.55',
      MTF_BOOSTER_STRENGTH_MULT: '0.3',
      MTF_BOOSTER_MAX_MULT: '1.2',
      MTF_BOOSTER_CONFLICT_MULT: '0.75',
      MTF_BOOSTER_PENALIZE_CONFLICTS: 'true',
      MTF_BOOSTER_BOOST_MTF_CANDIDATE: 'false',
      EMA_MTF_HOURLY_TREND_VETO_MULT: '0.65',
      EMA_MTF_4H_MACD_BOOST_MULT: '1.15',
      EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH: '0.3',
      MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN: 'true',
      MASR_MTF_4H_ALIGN_BOOST: '0.08',
      MASR_MTF_4H_COMPRESSION_BANDWIDTH: '0.01',
      RSI_MTF_VETO_AGAINST_4H_TREND: 'true',
      RSI_MTF_1H_RSI_ALIGN_BOOST: '0.1',
      RSI_MTF_1H_RSI_BUY_MAX: '40',
      RSI_MTF_1H_RSI_SELL_MIN: '60',
      MTF_REQUIRE_HIGHER_TF_READY: '1h,4h',
      OGZTPO_MTF_4H_TREND_BOOST_MULT: '1.12',
      OGZTPO_MTF_1H_MACD_BOOST_MULT: '1.08',
      OGZTPO_MTF_4H_VOL_STOP_WIDEN: 'true',
      OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD: '0.015',
      OGZTPO_MTF_STOP_WIDEN_FACTOR: '0.25',
    });
    expect(summary.PATH).toBeUndefined();
    expect(summary.HOME).toBeUndefined();
    expectLockedExitProfileKeysAbsent(summary);
  });

  test('profile summaries include source evidence and tunables for report stamping', () => {
    const profile = resolveTuningProfile('legacy-wide');
    const summary = summarizeTuningProfile(profile);

    expect(profile.env.TIER3_TARGET).toBe('0.060');
    expect(profile.evidence).toEqual(expect.arrayContaining(['.env.gates:239-272']));
    expectLockedExitProfileKeysAbsent(profile.env);
    expectLockedExitProfileKeysAbsent(summary.env);
  });

  test('runnable tuning profiles exclude reconstructed config guesses', () => {
    expect(listTuningProfileNames().sort()).toEqual(['current-eval', 'legacy-wide', 'ttp-5k-max']);
  });

  test('grid-search confidence runner uses the same env contract', () => {
    const env = buildGridSearchEnv(
      0.25,
      'grid-test',
      '/repo/data/state-grid-test.json',
      {
        PATH: '/usr/bin',
        DIRECTION_FILTER: 'long_only',
        EXIT_SYSTEM: 'contract',
        FEE_SLIPPAGE: '0',
        SOLO_STRATEGY: 'NoWickImbalance',
      }
    );

    expect(env.DIRECTION_FILTER).toBe('both');
    expect(env.EXIT_SYSTEM).toBe('legacy');
    expect(env.FEE_SLIPPAGE).toBe('0.0005');
    expect(env.SOLO_STRATEGY).toBeUndefined();
    expect(env.MIN_TRADE_CONFIDENCE).toBe('0.25');
    expect(env.CANDLE_LIMIT).toBe('60000');
    expect(env.TRADING_PAIR).toBe('BTC-USD');
    expect(env.BROKER).toBe('kraken');
    expect(env.ASSET_CLASS).toBe('crypto');
  });
});
