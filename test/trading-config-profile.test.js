'use strict';

const path = require('path');
const TradingConfig = require('../core/TradingConfig');
const tradingConfigJson = require('../config/trading.config.json');
const TradingProfileManager = require('../TradingProfileManager');
const {
  PROFILE_DEFINITIONS,
} = require('../tools/tuning-profiles');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
} = require('../tools/backtest-worker-env');

describe('TradingConfig runtime profile contract', () => {
  afterEach(() => {
    TradingConfig.clearOverrides();
  });

  test('known runtime profiles resolve explicitly', () => {
    expect(TradingConfig.getProfile('balanced')).toEqual(
      expect.objectContaining({
        minConfidence: expect.any(Number),
        maxPositionSize: expect.any(Number),
        riskPercent: expect.any(Number),
      })
    );
    expect(TradingConfig.getProfile('balanced')).toEqual(tradingConfigJson.profiles.balanced);
  });

  test('unknown runtime profiles fail loudly instead of falling back to balanced', () => {
    expect(() => TradingConfig.getProfile('missing-profile'))
      .toThrow(/Unknown trading profile 'missing-profile'/);
    expect(() => TradingConfig.getProfile())
      .toThrow(/Unknown trading profile 'undefined'/);
  });

  test('retired TradingProfileManager cannot own a parallel profile bank', () => {
    expect(() => new TradingProfileManager()).toThrow(/TradingProfileManager is retired/);
    expect(TradingProfileManager.disabledReason).toBe('runtime_profile_switch_not_wired');
  });

  test('tuning profiles resolve from TradingConfig as the single config owner', () => {
    expect(TradingConfig.listTuningProfileNames().sort()).toEqual(['current-eval', 'legacy-wide', 'ttp-5k-max']);
    expect(TradingConfig.getTuningProfileDefinitions()).toEqual(tradingConfigJson.tuningProfiles.definitions);
    expect(TradingConfig.resolveTuningProfile('legacy-wide')).toEqual(
      expect.objectContaining({
        name: 'legacy-wide',
        env: expect.objectContaining({
          TIER1_TARGET: '0.020',
          FINAL_TARGET: '0.100',
        }),
      })
    );
    expect(Object.isFrozen(PROFILE_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(PROFILE_DEFINITIONS['legacy-wide'].env)).toBe(true);
    expect(TradingConfig.resolveTuningProfile('current-eval').env).toEqual(
      expect.objectContaining({
        ATR_FILTER_ENABLED: 'true',
        ATR_MIN_PERCENT: '0.15',
      })
    );
    expect(TradingConfig.resolveTuningProfile('ttp-5k-max').env).toEqual(
      expect.objectContaining({
        INITIAL_BALANCE: '5000',
        MAX_DRAWDOWN: '3',
        MAX_DAILY_LOSS: '1',
        RISK_MANAGER_BYPASS: 'false',
        ACCOUNT_DRAWDOWN_BYPASS: 'false',
        ACCOUNT_DRAWDOWN_PCT: '-3.0',
        FEE_MODEL: 'per_share_minimum',
        FEE_PER_SHARE: '0.005',
        FEE_MIN_ORDER: '0.75',
        TTP_DAILY_LOSS_LIMIT_DOLLARS: '50',
        TTP_MAX_LOSS_THRESHOLD_EQUITY: '4850',
        TTP_PROFIT_TARGET_DOLLARS: '300',
      })
    );
    const resolved = TradingConfig.resolveTuningProfile('legacy-wide');
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.env)).toBe(true);
    try {
      resolved.env.TIER1_TARGET = '0.999';
    } catch (_) {
      // Strict-mode engines throw on frozen assignment; either way the value must not change.
    }
    expect(TradingConfig.resolveTuningProfile('legacy-wide').env.TIER1_TARGET).toBe('0.020');
  });

  test('RiskManager circuit limits are worker-env profile values, not TradingConfig base defaults', () => {
    expect(TradingConfig.get('risk.maxDrawdown')).toBeUndefined();
    expect(TradingConfig.get('risk.maxDailyLoss')).toBeUndefined();
    expect(TradingConfig.get('risk.maxWeeklyLoss')).toBeUndefined();
    expect(TradingConfig.get('risk.maxMonthlyLoss')).toBeUndefined();
    expect(TradingConfig.get('risk.riskManagerBypass')).toBeUndefined();
    expect(TradingConfig.get('risk.accountDrawdownBypass')).toBe(false);

    const workerEnv = buildBacktestWorkerEnv({
      sourceEnv: {},
      projectRoot: path.join(__dirname, '..'),
      dataFile: 'tuning/tsla-15m-750.json',
      stateFile: 'data/state-unit-risk-profile.json',
      dataDir: 'data/backtest',
      reportTag: 'unit-risk-profile',
      profileName: 'current-eval',
      stockMode: true,
      instrumentEnv: {
        BROKER: 'alpaca',
        TRADING_PAIR: 'TSLA',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
    });

    expect(workerEnv.MAX_DRAWDOWN).toBe('5');
    expect(workerEnv.MAX_DAILY_LOSS).toBe('1');
    expect(workerEnv.MAX_WEEKLY_LOSS).toBe('5');
    expect(workerEnv.MAX_MONTHLY_LOSS).toBe('5');
    expect(workerEnv.RISK_MANAGER_BYPASS).toBe('true');
    expect(workerEnv.ATR_FILTER_ENABLED).toBe('true');
    expect(workerEnv.ATR_MIN_PERCENT).toBe('0.15');
    expect(workerEnv.TUNING_PROFILE).toBe('current-eval');
    expect(workerEnv.BACKTEST_TUNING_PROFILE).toBe('current-eval');
  });

  test('TTP 5k MAX tuning profile exports prop-eval economics to stock backtest workers', () => {
    const workerEnv = buildBacktestWorkerEnv({
      sourceEnv: {},
      projectRoot: path.join(__dirname, '..'),
      dataFile: 'tuning/tsla-15m-750.json',
      stateFile: 'data/state-unit-ttp-5k-profile.json',
      dataDir: 'data/backtest',
      reportTag: 'unit-ttp-5k-profile',
      profileName: 'ttp-5k-max',
      stockMode: true,
      instrumentEnv: {
        BROKER: 'alpaca',
        TRADING_PAIR: 'TSLA',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
    });

    expect(workerEnv.INITIAL_BALANCE).toBe('5000');
    expect(workerEnv.MIN_TRADE_CONFIDENCE).toBe('0.90');
    expect(workerEnv.MAX_DRAWDOWN).toBe('3');
    expect(workerEnv.MAX_DAILY_LOSS).toBe('1');
    expect(workerEnv.MAX_WEEKLY_LOSS).toBe('3');
    expect(workerEnv.MAX_MONTHLY_LOSS).toBe('3');
    expect(workerEnv.RISK_MANAGER_BYPASS).toBe('false');
    expect(workerEnv.ACCOUNT_DRAWDOWN_BYPASS).toBe('false');
    expect(workerEnv.ACCOUNT_DRAWDOWN_PCT).toBe('-3.0');
    expect(workerEnv.ATR_MIN_PERCENT).toBe('0.40');
    expect(workerEnv.FEE_MODEL).toBe('per_share_minimum');
    expect(workerEnv.FEE_PER_SHARE).toBe('0.005');
    expect(workerEnv.FEE_MIN_ORDER).toBe('0.75');
    expect(workerEnv.FEE_MAKER).toBe('0');
    expect(workerEnv.FEE_TAKER).toBe('0');
    expect(workerEnv.TTP_DAILY_LOSS_LIMIT_DOLLARS).toBe('50');
    expect(workerEnv.TTP_MAX_LOSS_THRESHOLD_EQUITY).toBe('4850');
    expect(workerEnv.TTP_PROFIT_TARGET_DOLLARS).toBe('300');
    expect(workerEnv.TUNING_PROFILE).toBe('ttp-5k-max');
    expect(workerEnv.BACKTEST_TUNING_PROFILE).toBe('ttp-5k-max');
  });

  test('stock backtest workers carry explicit Alpaca adapter config without leaking credentials in summaries', () => {
    const workerEnv = buildBacktestWorkerEnv({
      sourceEnv: {
        ALPACA_MODE: 'live',
        ALPACA_API_KEY: 'parent-live-key',
        ALPACA_API_SECRET: 'parent-live-secret',
      },
      projectRoot: path.join(__dirname, '..'),
      dataFile: 'tuning/tsla-15m-750.json',
      stateFile: 'data/state-unit-alpaca-worker.json',
      dataDir: 'data/backtest',
      reportTag: 'unit-alpaca-worker',
      profileName: 'current-eval',
      stockMode: true,
      instrumentEnv: {
        BROKER: 'alpaca',
        TRADING_PAIR: 'TSLA',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
    });

    expect(workerEnv.ALPACA_MODE).toBe('paper');
    expect(workerEnv.ALPACA_API_KEY).toBe('backtest-alpaca-key');
    expect(workerEnv.ALPACA_API_SECRET).toBe('backtest-alpaca-secret');
    expect(workerEnv.BROKER).toBe('alpaca');
    expect(workerEnv.TRADING_PAIR).toBe('TSLA');

    const summary = summarizeWorkerEnv(workerEnv);
    expect(summary).toEqual(expect.objectContaining({
      ALPACA_MODE: 'paper',
      ALPACA_API_KEY_PRESENT: true,
      ALPACA_API_SECRET_PRESENT: true,
      BROKER: 'alpaca',
      TRADING_PAIR: 'TSLA',
    }));
    expect(JSON.stringify(summary)).not.toContain('backtest-alpaca-key');
    expect(JSON.stringify(summary)).not.toContain('parent-live-key');
  });

  test('flat-state tuning profile swap applies and restores config without mutating process env', async () => {
    const profileKeys = Object.keys(TradingConfig.resolveTuningProfile('current-eval').env);
    const envBefore = {};
    for (const key of profileKeys) envBefore[key] = process.env[key];

    const applied = TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(applied).toEqual(expect.objectContaining({
      profile: 'current-eval',
      overrideCount: expect.any(Number),
      runtimeSnapshotEnvKeys: [
        'EXIT_SYSTEM',
        'MAX_DAILY_LOSS',
        'MAX_DRAWDOWN',
        'MAX_MONTHLY_LOSS',
        'MAX_WEEKLY_LOSS',
        'RISK_MANAGER_BYPASS',
      ],
    }));
    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
    expect(TradingConfig.get('fees.slippage')).toBe(0.0005);
    expect(TradingConfig.get('risk.accountDrawdownBypass')).toBe(true);
    expect(TradingConfig.get('filters.atrEnabled')).toBe(true);
    expect(TradingConfig.get('filters.atrMinPercent')).toBe(0.15);

    await TradingConfig.runWithTuningProfile(
      'legacy-wide',
      async (status) => {
        expect(status.activeProfile).toBe('legacy-wide');
        expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(TradingConfig.get('exits.profitTiers.final')).toBe(0.100);
        expect(TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
      },
      {
        phase: 'startup',
        requireFlat: true,
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('current-eval');
    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(TradingConfig.get('exits.profitTiers.final')).toBe(0.025);
    expect(TradingConfig.get('filters.atrEnabled')).toBe(true);

    const envAfter = {};
    for (const key of profileKeys) envAfter[key] = process.env[key];
    expect(envAfter).toEqual(envBefore);
  });

  test('profile apply refuses missing flat-state proof when flat state is required', () => {
    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      requireFlat: true,
      phase: 'startup',
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('runtime phase refuses startup-snapshot profile keys instead of pretending to update live objects', () => {
    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'runtime',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/includes startup-snapshot key\(s\) EXIT_SYSTEM, MAX_DAILY_LOSS, MAX_DRAWDOWN, MAX_MONTHLY_LOSS, MAX_WEEKLY_LOSS, RISK_MANAGER_BYPASS/);
  });

  test('profile apply refuses active override collisions unless profile replacement is explicit', () => {
    TradingConfig.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/would overwrite active config path\(s\): exits\.profitTiers\.tier1/);
  });

  test('explicit profile replacement still requires flat-state proof for active collisions', () => {
    TradingConfig.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('explicit profile replacement requires flat-state proof even when values already match', () => {
    TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });

    expect(() => TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('different active profile cannot be applied without explicit replacement', () => {
    TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });

    expect(() => TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      source: 'unit-test',
    })).toThrow(/cannot replace active profile 'current-eval' without replaceActiveProfile=true/);
  });

  test('profile replacement removes old profile-owned paths not present in the new profile', () => {
    TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });
    expect(TradingConfig.get('filters.atrEnabled')).toBe(true);

    TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
    expect(TradingConfig.get('filters.atrEnabled')).toBe(false);
  });

  test('profile replacement does not delete manual overrides removed from active profile ownership', () => {
    TradingConfig.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });
    TradingConfig.setOverrides({
      'filters.atrEnabled': false,
    });

    TradingConfig.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
    expect(TradingConfig.get('filters.atrEnabled')).toBe(false);
  });

  test('runWithTuningProfile restores paths that were missing before the temporary profile', async () => {
    const beforeTier1 = TradingConfig.get('exits.profitTiers.tier1');
    const beforeStatus = TradingConfig.getTuningProfileStatus();

    await TradingConfig.runWithTuningProfile(
      'legacy-wide',
      async () => {
        expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(TradingConfig.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
      },
      {
        phase: 'startup',
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(TradingConfig.get('exits.profitTiers.tier1')).toBe(beforeTier1);
    expect(TradingConfig.getTuningProfileStatus()).toEqual(beforeStatus);
  });

  test('runWithTuningProfile restores manual overrides on paths changed by the temporary profile', async () => {
    TradingConfig.setOverrides({
      'filters.atrEnabled': false,
    });

    await TradingConfig.runWithTuningProfile(
      'current-eval',
      async () => {
        expect(TradingConfig.get('filters.atrEnabled')).toBe(true);
      },
      {
        phase: 'startup',
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(TradingConfig.get('filters.atrEnabled')).toBe(false);
  });
});
