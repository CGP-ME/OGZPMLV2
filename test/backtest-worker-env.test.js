'use strict';

const path = require('path');
const {
  buildWorkerBaseEnv,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
} = require('../tools/backtest-worker-env');
const {
  listTuningProfileNames,
  resolveTuningProfile,
} = require('../tools/tuning-profiles');
const {
  buildGridSearchEnv,
} = require('../tools/grid-search-confidence');

describe('backtest worker env contract', () => {
  const projectRoot = '/repo';

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
      instrumentEnv: {
        TRADING_PAIR: 'TSLA',
        BROKER: 'alpaca',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
      ...overrides,
    });
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

  test('canonical stock worker env preserves explicit direction while blocking other trading drift', () => {
    const env = buildEnv({ stockMode: true });

    expect(env.EXECUTION_MODE).toBe('backtest');
    expect(env.CANDLE_SOURCE).toBe('file');
    expect(env.CANDLE_DATA_FILE).toBe(path.resolve(projectRoot, 'tuning/tsla-15m-2y.json'));
    expect(env.DIRECTION_FILTER).toBe('long_only');
    expect(env.ACCOUNT_DRAWDOWN_BYPASS).toBe('true');
    expect(env.RISK_MANAGER_BYPASS).toBe('true');
    expect(env.EXIT_SYSTEM).toBe('legacy');
    expect(env.FEE_MAKER).toBe('0');
    expect(env.FEE_TAKER).toBe('0');
    expect(env.FEE_TOTAL_ROUNDTRIP).toBe('0');
    expect(env.FEE_SAFETY_BUFFER).toBe('0');
    expect(env.FEE_SLIPPAGE).toBe('0.0005');
    expect(env.TUNING_PROFILE).toBe('current-eval');
    expect(env.BACKTEST_TUNING_PROFILE).toBe('current-eval');
    expect(env.ENABLE_DYNAMIC_SIZING).toBe('true');
    expect(env.MAX_POSITION_SIZE_PCT).toBe('0.05');
    expect(env.TIER1_TARGET).toBe('0.007');
    expect(env.FINAL_TARGET).toBe('0.025');
    expect(env.SOLO_STRATEGY).toBeUndefined();
    expect(env.ENABLE_NOWICK).toBeUndefined();
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
    expect(env.STOP_LOSS_PERCENT).toBe('1.5');
    expect(env.TAKE_PROFIT_PERCENT).toBe('2.0');
    expect(env.TIER1_TARGET).toBe('0.020');
    expect(env.FINAL_TARGET).toBe('0.100');
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
    expect(env.DIRECTION_FILTER).toBe('long_only');
    expect(env.FEE_SLIPPAGE).toBe('0.0005');
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
      sourceEnv: {
        PATH: '/usr/bin',
        DIRECTION_FILTER: 'longs_only',
      },
    })).toThrow(/Invalid sourceEnv DIRECTION_FILTER 'longs_only'/);

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
      configEnv: { SOLO_STRATEGY: 'SmartMoneySweep', ENABLE_SMS: 'true' },
    }));

    expect(summary).toMatchObject({
      EXECUTION_MODE: 'backtest',
      DIRECTION_FILTER: 'long_only',
      EXIT_SYSTEM: 'legacy',
      TUNING_PROFILE: 'current-eval',
      ENABLE_DYNAMIC_SIZING: 'true',
      MAX_POSITION_SIZE_PCT: '0.05',
      TIER1_TARGET: '0.007',
      FINAL_TARGET: '0.025',
      FEE_MAKER: '0',
      FEE_SLIPPAGE: '0.0005',
      TRADING_PAIR: 'TSLA',
      SOLO_STRATEGY: 'SmartMoneySweep',
      ENABLE_SMS: 'true',
    });
    expect(summary.PATH).toBeUndefined();
    expect(summary.HOME).toBeUndefined();
  });

  test('profile summaries include source evidence and tunables for report stamping', () => {
    const profile = resolveTuningProfile('legacy-wide');

    expect(profile.env.TIER3_TARGET).toBe('0.060');
    expect(profile.evidence).toEqual(expect.arrayContaining(['.env.gates:239-272']));
  });

  test('runnable tuning profiles exclude reconstructed config guesses', () => {
    expect(listTuningProfileNames().sort()).toEqual(['current-eval', 'legacy-wide']);
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

    expect(env.DIRECTION_FILTER).toBe('long_only');
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
