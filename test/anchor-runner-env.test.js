'use strict';

const path = require('path');
const {
  buildP0RunSpec,
  buildRunStamp,
  CANONICAL_ENV,
  P0_TUNING_PROFILE,
  assertP0WorkerEnvMatchesProfile,
  runP0,
} = require('../ogz-meta/anchor-runner');

const EXPECTED_ANCHOR_CANONICAL_ENV = Object.freeze({
  SOLO_STRATEGY: 'EMASMACrossover',
  ENABLE_EMA: 'true',
  DIRECTION_FILTER: 'long_only',
  ENABLE_SHORTS: 'false',
  ENABLE_TRAI: 'false',
  ENABLE_MTF_CONFLUENCE_BOOSTER: 'false',
});

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
      STOP_LOSS_PERCENT: '0.01',
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

    expect(CANONICAL_ENV).toEqual(EXPECTED_ANCHOR_CANONICAL_ENV);
    expect(spec.runSpec).toEqual(expect.objectContaining({
      profile: 'full',
      runner: 'ogz-meta/anchor-runner.js',
      command: 'node run-empire-v2.js',
      candleFile: 'tuning/tsla-15m-2y.json',
      stateFile: 'data/state-baseline-phase0.json',
      tuningProfile: P0_TUNING_PROFILE,
    }));
    expect(spec.runSpec.candleFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(spec.runSpec.candleFilePresent).toBe(true);
    expect(spec.runSpec.candleFileSizeBytes).toBeGreaterThan(0);
    expect(spec.runSpec.canonicalEnv).toEqual(CANONICAL_ENV);
    expect(spec.tuningProfile.name).toBe(P0_TUNING_PROFILE);
    expect(spec.workerEnv).toEqual(expect.objectContaining({
      TUNING_PROFILE: 'current-eval',
      BACKTEST_TUNING_PROFILE: 'current-eval',
      PROFILE: 'backtest-p0',
      ENABLE_DYNAMIC_SIZING: 'true',
      TIER1_TARGET: '0.007',
      FEE_MAKER: '0',
      FEE_TAKER: '0',
      ATR_FILTER_ENABLED: 'true',
      ATR_MIN_PERCENT: '0.15',
      SOLO_STRATEGY: 'EMASMACrossover',
      ENABLE_EMA: 'true',
      ENABLE_MTF_CONFLUENCE_BOOSTER: 'false',
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
    expect(spec.workerEnv.MIN_TRADE_CONFIDENCE).toBeUndefined();
    expect(spec.workerEnv.ACCOUNT_DRAWDOWN_BYPASS).toBeUndefined();
    expect(spec.workerEnv.RISK_MANAGER_BYPASS).toBeUndefined();
    expect(spec.workerEnv.MAX_DRAWDOWN).toBeUndefined();
    expect(spec.workerEnv.STOP_LOSS_PERCENT).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(spec.env, 'STOP_LOSS_PERCENT')).toBe(false);
  });

  test('freezes canonical P0 env and rejects profile-owned effective-env drift', () => {
    const spec = buildP0RunSpec('fast', 'unit', '2026-06-04T00-00-00-000Z');
    expect(Object.isFrozen(CANONICAL_ENV)).toBe(true);

    expect(() => assertP0WorkerEnvMatchesProfile({
      ...spec.env,
      ATR_FILTER_ENABLED: 'false',
    }, spec.tuningProfile)).toThrow(
      /final P0 worker env does not match tuning profile 'current-eval'.*ATR_FILTER_ENABLED/
    );
  });

  test('uses a timestamped log name for each P0 run', () => {
    const stamp = buildRunStamp(new Date('2026-06-04T02:03:04.005Z'));
    const spec = buildP0RunSpec('fast', 'unit', stamp);

    expect(stamp).toBe('2026-06-04T02-03-04-005Z');
    expect(spec.logPath).toContain('phase0-750-unit-2026-06-04T02-03-04-005Z.log');
    expect(spec.env.BACKTEST_REPORT_TAG).toBe('phase0-750-unit-2026-06-04T02-03-04-005Z');
  });

  test('fails before execution when the selected P0 candle file is missing', () => {
    const spec = buildP0RunSpec('fast', 'unit', '2026-06-04T00-00-00-000Z');
    expect(spec.runSpec.candleFilePresent).toBe(false);
    expect(spec.runSpec.candleFileSha256).toBeNull();

    expect(() => runP0('fast', 'unit')).toThrow(/canonical candle file missing/);
  });
});
