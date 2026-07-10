'use strict';

const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const tradingConfigJson = require('../config/trading.config.json');
const TradingProfileManager = require('../TradingProfileManager');
const {
  PROFILE_DEFINITIONS,
} = require('../tools/tuning-profiles');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
} = require('../tools/backtest-worker-env');

describe('ConfigLoader runtime profile contract', () => {
  afterEach(() => {
    ConfigLoader.clearOverrides();
  });

  function withLiveRuntimeEnv(callback) {
    const previous = {
      PROFILE: process.env.PROFILE,
      LIVE_TRADING: process.env.LIVE_TRADING,
      EXECUTION_MODE: process.env.EXECUTION_MODE,
    };
    process.env.PROFILE = 'production';
    process.env.LIVE_TRADING = 'true';
    process.env.EXECUTION_MODE = 'live';
    try {
      return callback();
    } finally {
      if (previous.PROFILE === undefined) {
        delete process.env.PROFILE;
      } else {
        process.env.PROFILE = previous.PROFILE;
      }
      if (previous.LIVE_TRADING === undefined) {
        delete process.env.LIVE_TRADING;
      } else {
        process.env.LIVE_TRADING = previous.LIVE_TRADING;
      }
      if (previous.EXECUTION_MODE === undefined) {
        delete process.env.EXECUTION_MODE;
      } else {
        process.env.EXECUTION_MODE = previous.EXECUTION_MODE;
      }
    }
  }

  test('known runtime profiles resolve explicitly', () => {
    expect(ConfigLoader.getProfile('balanced')).toEqual(
      expect.objectContaining({
        minConfidence: expect.any(Number),
        maxPositionSize: expect.any(Number),
        riskPercent: expect.any(Number),
      })
    );
    expect(ConfigLoader.getProfile('balanced')).toEqual(tradingConfigJson.profiles.balanced);
  });

  test('unknown runtime profiles fail loudly instead of falling back to balanced', () => {
    expect(() => ConfigLoader.getProfile('missing-profile'))
      .toThrow(/Unknown trading profile 'missing-profile'/);
    expect(() => ConfigLoader.getProfile())
      .toThrow(/Unknown trading profile 'undefined'/);
  });

  test('retired TradingProfileManager cannot own a parallel profile bank', () => {
    expect(() => new TradingProfileManager()).toThrow(/foundation\/ConfigLoader profile APIs/);
    expect(TradingProfileManager.disabledReason).toBe('runtime_profile_switch_not_wired');
  });

  test('tuning profiles resolve from the ConfigLoader compatibility surface', () => {
    expect(ConfigLoader.listTuningProfileNames().sort()).toEqual(['current-eval', 'legacy-wide', 'trey-spec', 'ttp-5k-max']);
    expect(ConfigLoader.getTuningProfileDefinitions()).toEqual(tradingConfigJson.tuningProfiles.definitions);
    expect(ConfigLoader.resolveTuningProfile('legacy-wide')).toEqual(
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
    expect(ConfigLoader.resolveTuningProfile('current-eval').env).toEqual(
      expect.objectContaining({
        ATR_FILTER_ENABLED: 'true',
        ATR_MIN_PERCENT: '0.15',
      })
    );
    expect(ConfigLoader.resolveTuningProfile('ttp-5k-max').env).toEqual(
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
    expect(ConfigLoader.resolveTuningProfile('trey-spec').env).toEqual(
      expect.objectContaining({
        EMA_CROSSOVER_ENTRY_EVENTS_ONLY: 'true',
        EMA_CROSSOVER_WARMUP_BARS: '200',
        ORCH_MIN_CANDLES_EMA: '200',
        TREND_REGIME_GATE_ENABLED: 'true',
        ATR_CONTRACTS_ENABLED: 'true',
        BE_SCALEOUT_FRACTION: '0.25',
        TIERED_EXIT_ENABLED: 'false',
        TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF: '30',
      })
    );
    const resolved = ConfigLoader.resolveTuningProfile('legacy-wide');
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.env)).toBe(true);
    try {
      resolved.env.TIER1_TARGET = '0.999';
    } catch (_) {
      // Strict-mode engines throw on frozen assignment; either way the value must not change.
    }
    expect(ConfigLoader.resolveTuningProfile('legacy-wide').env.TIER1_TARGET).toBe('0.020');
  });

  test('RiskManager circuit limits are worker-env profile values, not ConfigLoader base defaults', () => {
    expect(ConfigLoader.get('risk.maxDrawdown')).toBeUndefined();
    expect(ConfigLoader.get('risk.maxDailyLoss')).toBeUndefined();
    expect(ConfigLoader.get('risk.maxWeeklyLoss')).toBeUndefined();
    expect(ConfigLoader.get('risk.maxMonthlyLoss')).toBeUndefined();
    expect(ConfigLoader.get('risk.riskManagerBypass')).toBeUndefined();
    expect(ConfigLoader.get('risk.accountDrawdownBypass')).toBe(false);

    const workerEnv = buildBacktestWorkerEnv({
      sourceEnv: {},
      projectRoot: path.join(__dirname, '..'),
      dataFile: 'tuning/tsla-15m-750.json',
      stateFile: 'data/state-unit-risk-profile.json',
      dataDir: 'data/backtest',
      reportTag: 'unit-risk-profile',
      profileName: 'current-eval',
      feeProfileName: 'ttp_real',
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
    expect(workerEnv.BACKTEST_FEE_PROFILE).toBe('ttp_real');
    expect(workerEnv.FEE_MODEL).toBe('per_share_minimum');
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
      feeProfileName: 'ttp_real',
      stockMode: true,
      instrumentEnv: {
        BROKER: 'alpaca',
        TRADING_PAIR: 'TSLA',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
    });

    expect(workerEnv.INITIAL_BALANCE).toBe('5000');
    expect(workerEnv.MIN_TRADE_CONFIDENCE).toBe('0.5');
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
    expect(workerEnv.BACKTEST_FEE_PROFILE).toBe('ttp_real');
  });

  test('TREY SPEC tuning profile exports strategy behavior and TTP entry buffer to stock backtest workers', () => {
    const workerEnv = buildBacktestWorkerEnv({
      sourceEnv: {},
      projectRoot: path.join(__dirname, '..'),
      dataFile: 'tuning/tsla-15m-750.json',
      stateFile: 'data/state-unit-trey-spec-profile.json',
      dataDir: 'data/backtest',
      reportTag: 'unit-trey-spec-profile',
      profileName: 'trey-spec',
      feeProfileName: 'ttp_real',
      stockMode: true,
      instrumentEnv: {
        BROKER: 'alpaca',
        TRADING_PAIR: 'TSLA',
        ASSET_CLASS: 'stocks',
        CANDLE_TIMEFRAME: '15m',
      },
    });

    expect(workerEnv.TUNING_PROFILE).toBe('trey-spec');
    expect(workerEnv.BACKTEST_TUNING_PROFILE).toBe('trey-spec');
    expect(workerEnv.BACKTEST_FEE_PROFILE).toBe('ttp_real');
    expect(workerEnv.EMA_CROSSOVER_ENTRY_EVENTS_ONLY).toBe('true');
    expect(workerEnv.EMA_CROSSOVER_CONFIRM_BARS).toBe('1');
    expect(workerEnv.EMA_CROSSOVER_WARMUP_BARS).toBe('200');
    expect(workerEnv.ORCH_MIN_CANDLES_EMA).toBe('200');
    expect(workerEnv.TREND_REGIME_GATE_ENABLED).toBe('true');
    expect(workerEnv.ATR_CONTRACTS_ENABLED).toBe('true');
    expect(workerEnv.ATR_STOP_MULTIPLIER).toBe('2.0');
    expect(workerEnv.BE_SCALEOUT_FRACTION).toBe('0.25');
    expect(workerEnv.TIERED_EXIT_ENABLED).toBe('false');
    expect(workerEnv.TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF).toBe('30');
    expect(ConfigLoader.buildTuningProfileOverrides('trey-spec')).toEqual(expect.objectContaining({
      'strategyBehavior.emaCrossover.entryEventsOnly': true,
      'strategyBehavior.emaCrossover.warmupBars': 200,
      'strategyBehavior.trendRegimeGate.enabled': true,
      'strategyBehavior.atrContracts.enabled': true,
      'exitLogic.beScaleOut.scaleOutFraction': 0.25,
      'exitLogic.tieredExit.enabled': false,
      'evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff': 30,
    }));
  });

  test('explicit TUNING_PROFILE selector materializes trey-spec through ConfigLoader before ConfigLoader reads', () => {
    const previous = {
      DOTENV_CONFIG_PATH: process.env.DOTENV_CONFIG_PATH,
      PROFILE: process.env.PROFILE,
      EXECUTION_MODE: process.env.EXECUTION_MODE,
      CANDLE_SOURCE: process.env.CANDLE_SOURCE,
      BACKTEST_MODE: process.env.BACKTEST_MODE,
      TUNING_PROFILE: process.env.TUNING_PROFILE,
      BACKTEST_TUNING_PROFILE: process.env.BACKTEST_TUNING_PROFILE,
      EMA_CROSSOVER_ENTRY_EVENTS_ONLY: process.env.EMA_CROSSOVER_ENTRY_EVENTS_ONLY,
      EMA_CROSSOVER_WARMUP_BARS: process.env.EMA_CROSSOVER_WARMUP_BARS,
    };

    jest.resetModules();
    process.env.DOTENV_CONFIG_PATH = '/tmp/ogzprime-test-missing.env';
    process.env.PROFILE = 'backtest-all';
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.BACKTEST_MODE = 'true';
    process.env.TUNING_PROFILE = 'trey-spec';
    delete process.env.BACKTEST_TUNING_PROFILE;
    delete process.env.EMA_CROSSOVER_ENTRY_EVENTS_ONLY;
    process.env.EMA_CROSSOVER_WARMUP_BARS = '10';

    try {
      const ConfigLoader = require('../foundation/ConfigLoader');
      const loaded = ConfigLoader.load({ force: true, silent: true });
      const FreshTradingConfig = require('../foundation/ConfigLoader');
      expect(FreshTradingConfig.get('strategyBehavior.emaCrossover.entryEventsOnly')).toBe(true);
      expect(FreshTradingConfig.get('strategyBehavior.emaCrossover.warmupBars')).toBe(200);
      expect(FreshTradingConfig.get('strategyBehavior.atrContracts.enabled')).toBe(true);
      expect(FreshTradingConfig.get('exitLogic.beScaleOut.scaleOutFraction')).toBe(0.25);
      expect(FreshTradingConfig.get('exitLogic.tieredExit.enabled')).toBe(false);
      expect(loaded.sources['strategyBehavior.emaCrossover.warmupBars']).toBe('profile:trey-spec:EMA_CROSSOVER_WARMUP_BARS');
      expect(loaded.sources['exitLogic.tieredExit.enabled']).toBe('profile:trey-spec:TIERED_EXIT_ENABLED');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      jest.resetModules();
    }
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
      feeProfileName: 'zero',
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

  test('TTP eval sizing values read from env without requiring tuning profile overrides', () => {
    const envBefore = {
      TTP_DAILY_LOSS_LIMIT_DOLLARS: process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS,
      TTP_MAX_LOSS_THRESHOLD_EQUITY: process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY,
      TTP_PROFIT_TARGET_DOLLARS: process.env.TTP_PROFIT_TARGET_DOLLARS,
      TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: process.env.TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO,
      TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: process.env.TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO,
    };

    jest.resetModules();
    process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS = '50';
    process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY = '4850';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '300';
    process.env.TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO = '0.30';
    process.env.TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO = '0.06';

    try {
      const FreshTradingConfig = require('../foundation/ConfigLoader');

      expect(FreshTradingConfig.get('evalRules.ttp.accountLimits.dailyLossDollars')).toBe(50);
      expect(FreshTradingConfig.get('evalRules.ttp.accountLimits.maxLossThresholdEquity')).toBe(4850);
      expect(FreshTradingConfig.get('evalRules.ttp.consistency.profitTargetDollars')).toBe(300);
      expect(FreshTradingConfig.get('evalRules.ttp.consistency.maxPositionProfitRatio')).toBe(0.30);
      expect(FreshTradingConfig.get('evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio')).toBe(0.06);
      expect(FreshTradingConfig.getTuningProfileStatus().activeProfile).toBe(null);
    } finally {
      for (const [key, value] of Object.entries(envBefore)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      jest.resetModules();
    }
  });

  test('flat-state tuning profile swap applies and restores config without mutating process env', async () => {
    const profileKeys = Object.keys(ConfigLoader.resolveTuningProfile('current-eval').env);
    const envBefore = {};
    for (const key of profileKeys) envBefore[key] = process.env[key];

    const applied = ConfigLoader.applyTuningProfile('current-eval', {
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
    expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(ConfigLoader.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
    expect(ConfigLoader.get('fees.slippage')).toBe(0.0005);
    expect(ConfigLoader.get('risk.accountDrawdownBypass')).toBe(true);
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(true);
    expect(ConfigLoader.get('filters.atrMinPercent')).toBe(0.15);

    await ConfigLoader.runWithTuningProfile(
      'legacy-wide',
      async (status) => {
        expect(status.activeProfile).toBe('legacy-wide');
        expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(ConfigLoader.get('exits.profitTiers.final')).toBe(0.100);
        expect(ConfigLoader.get('exitLogic.tieredExit.tier1ExitFraction')).toBe(0.30);
      },
      {
        phase: 'startup',
        requireFlat: true,
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(ConfigLoader.getTuningProfileStatus().activeProfile).toBe('current-eval');
    expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(0.007);
    expect(ConfigLoader.get('exits.profitTiers.final')).toBe(0.025);
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(true);

    const envAfter = {};
    for (const key of profileKeys) envAfter[key] = process.env[key];
    expect(envAfter).toEqual(envBefore);
  });

  test('profile apply refuses missing flat-state proof when flat state is required', () => {
    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      requireFlat: true,
      phase: 'startup',
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('runtime phase refuses startup-snapshot profile keys instead of pretending to update live objects', () => {
    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'runtime',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/includes startup-snapshot key\(s\) EXIT_SYSTEM, MAX_DAILY_LOSS, MAX_DRAWDOWN, MAX_MONTHLY_LOSS, MAX_WEEKLY_LOSS, RISK_MANAGER_BYPASS/);
  });

  test('live runtime refuses manual minTradeConfidence overrides below the configured floor', () => {
    withLiveRuntimeEnv(() => {
      expect(() => ConfigLoader.setOverrides({
        confidence: { minTradeConfidence: 0.49 },
      })).toThrow(/Live runtime refuses setOverrides override for confidence\.minTradeConfidence/);
    });

    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(0.5);
  });

  test('frozen config refuses setOverrides instead of silently ignoring them', () => {
    ConfigLoader.freeze();

    try {
      expect(() => ConfigLoader.setOverrides({
        confidence: { minTradeConfidence: 0.9 },
      })).toThrow(/Config is frozen; refusing setOverrides\(\)/);

      expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(0.5);
    } finally {
      ConfigLoader.unfreeze();
    }
  });

  test('live runtime refuses tuning profile minTradeConfidence overrides below the configured floor', () => {
    const originalBuildTuningProfileOverrides = ConfigLoader.buildTuningProfileOverrides;
    ConfigLoader.buildTuningProfileOverrides = () => ({
      'confidence.minTradeConfidence': 0.49,
    });

    try {
      withLiveRuntimeEnv(() => {
        expect(() => ConfigLoader.applyTuningProfile('current-eval', {
          phase: 'startup',
          source: 'unit-test',
        })).toThrow(/Live runtime refuses tuning profile 'current-eval' override for confidence\.minTradeConfidence/);
      });
    } finally {
      ConfigLoader.buildTuningProfileOverrides = originalBuildTuningProfileOverrides;
    }

    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(0.5);
  });

  test('profile apply refuses active override collisions unless profile replacement is explicit', () => {
    ConfigLoader.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
    })).toThrow(/would overwrite active config path\(s\): exits\.profitTiers\.tier1/);
  });

  test('explicit profile replacement still requires flat-state proof for active collisions', () => {
    ConfigLoader.setOverrides({
      'exits.profitTiers.tier1': 0.123,
    });

    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('explicit profile replacement requires flat-state proof even when values already match', () => {
    ConfigLoader.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });

    expect(() => ConfigLoader.applyTuningProfile('current-eval', {
      phase: 'startup',
      replaceActiveProfile: true,
    })).toThrow(/requires an explicit flatState probe result/);
  });

  test('different active profile cannot be applied without explicit replacement', () => {
    ConfigLoader.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });

    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      source: 'unit-test',
    })).toThrow(/cannot replace active profile 'current-eval' without replaceActiveProfile=true/);
  });

  test('profile replacement removes old profile-owned paths not present in the new profile', () => {
    ConfigLoader.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(true);

    ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(ConfigLoader.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(false);
  });

  test('profile replacement does not delete manual overrides removed from active profile ownership', () => {
    ConfigLoader.applyTuningProfile('current-eval', {
      phase: 'startup',
      source: 'unit-test',
    });
    ConfigLoader.setOverrides({
      'filters.atrEnabled': false,
    });

    ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      replaceActiveProfile: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    });

    expect(ConfigLoader.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(false);
  });

  test('runWithTuningProfile restores paths that were missing before the temporary profile', async () => {
    const beforeTier1 = ConfigLoader.get('exits.profitTiers.tier1');
    const beforeStatus = ConfigLoader.getTuningProfileStatus();

    await ConfigLoader.runWithTuningProfile(
      'legacy-wide',
      async () => {
        expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(0.020);
        expect(ConfigLoader.getTuningProfileStatus().activeProfile).toBe('legacy-wide');
      },
      {
        phase: 'startup',
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(beforeTier1);
    expect(ConfigLoader.getTuningProfileStatus()).toEqual(beforeStatus);
  });

  test('runWithTuningProfile restores manual overrides on paths changed by the temporary profile', async () => {
    ConfigLoader.setOverrides({
      'filters.atrEnabled': false,
    });

    await ConfigLoader.runWithTuningProfile(
      'current-eval',
      async () => {
        expect(ConfigLoader.get('filters.atrEnabled')).toBe(true);
      },
      {
        phase: 'startup',
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );

    expect(ConfigLoader.get('filters.atrEnabled')).toBe(false);
  });
});
