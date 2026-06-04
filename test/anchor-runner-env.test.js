'use strict';

const path = require('path');
const {
  buildP0RunSpec,
  buildRunStamp,
  P0_TUNING_PROFILE,
} = require('../ogz-meta/anchor-runner');

describe('anchor-runner P0 env contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      TUNING_PROFILE: 'legacy-wide',
      BACKTEST_TUNING_PROFILE: 'config-d-flat',
      ENABLE_DYNAMIC_SIZING: 'false',
      TIER1_TARGET: '0.99',
      FEE_MAKER: '0.99',
      RISK_MANAGER_BYPASS: 'false',
      TRADING_PAIR: 'BTC-USD',
      BROKER: 'kraken',
      ASSET_CLASS: 'crypto',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('builds P0 from the pinned stock profile instead of ambient trading env', () => {
    const spec = buildP0RunSpec('full', 'unit', '2026-06-04T00-00-00-000Z');

    expect(spec.tuningProfile.name).toBe(P0_TUNING_PROFILE);
    expect(spec.workerEnv).toEqual(expect.objectContaining({
      TUNING_PROFILE: 'current-eval',
      BACKTEST_TUNING_PROFILE: 'current-eval',
      ENABLE_DYNAMIC_SIZING: 'true',
      TIER1_TARGET: '0.007',
      FEE_MAKER: '0',
      FEE_TAKER: '0',
      RISK_MANAGER_BYPASS: 'true',
      SOLO_STRATEGY: 'EMASMACrossover',
      ENABLE_EMA: 'true',
      DIRECTION_FILTER: 'long_only',
      ENABLE_SHORTS: 'false',
      ENABLE_TRAI: 'false',
      TRADING_PAIR: 'TSLA',
      BROKER: 'alpaca',
      ASSET_CLASS: 'stocks',
      CANDLE_TIMEFRAME: '15m',
    }));
    expect(spec.env.TUNING_PROFILE).toBe('current-eval');
    expect(spec.env.BACKTEST_TUNING_PROFILE).toBe('current-eval');
    expect(spec.env.CANDLE_DATA_FILE).toBe(path.join(process.cwd(), 'tuning/tsla-15m-2y.json'));
  });

  test('uses a timestamped log name for each P0 run', () => {
    const stamp = buildRunStamp(new Date('2026-06-04T02:03:04.005Z'));
    const spec = buildP0RunSpec('fast', 'unit', stamp);

    expect(stamp).toBe('2026-06-04T02-03-04-005Z');
    expect(spec.logPath).toContain('phase0-750-unit-2026-06-04T02-03-04-005Z.log');
    expect(spec.env.BACKTEST_REPORT_TAG).toBe('phase0-750-unit-2026-06-04T02-03-04-005Z');
  });
});
