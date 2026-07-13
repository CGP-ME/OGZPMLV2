'use strict';

const path = require('path');

function currentNewYorkDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

describe('ConfigLoader live trading safety guard', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    const today = currentNewYorkDate();
    originalEnv = { ...process.env };
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'websocket',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'false',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      RISK_MANAGER_BYPASS: 'false',
      ACCOUNT_DRAWDOWN_BYPASS: 'false',
      MAX_DRAWDOWN: '5',
      MAX_DAILY_LOSS: '1',
      MAX_WEEKLY_LOSS: '5',
      MAX_MONTHLY_LOSS: '5',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
      SIGNALSTACK_WEBHOOK_URL: '',
      WEBHOOK_TIMEOUT_MS: '5000',
      WEBHOOK_ORDER_LOG_CAP: '500',
      BROKER: 'alpaca',
      ALPACA_MODE: 'paper',
      ALPACA_API_KEY: 'test-alpaca-key',
      ALPACA_API_SECRET: 'test-alpaca-secret',
      TRADING_PAIR: 'TSLA',
      EVAL_RULES_ENABLED: 'false',
      TTP_RULES_ENABLED: 'false',
      TTP_VOLUME_CAP_ENABLED: 'true',
      TTP_VOLUME_CAP_PERCENT: '0.05',
      TTP_VOLUME_CAP_TIMEFRAME: '1m',
      TTP_VOLUME_CAP_FALLBACK_TO_RECENT: 'true',
      TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS: '180000',
      TTP_MARKET_TIME_ENABLED: 'true',
      TTP_BLOCK_ENTRIES_AFTER_CUTOFF: 'true',
      TTP_LIQUIDATION_ENABLED: 'true',
      TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE: '10',
      TTP_ACCOUNT_LIMITS_ENABLED: 'true',
      TTP_DAILY_LOSS_PAUSE_ENABLED: 'true',
      TTP_MAX_LOSS_ENABLED: 'true',
      TTP_ACCOUNT_START_OF_DAY_DATE: today,
      TTP_ACCOUNT_START_OF_DAY_EQUITY: '50000',
      TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
      TTP_MAX_LOSS_THRESHOLD_EQUITY: '47500',
      TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
      TTP_EARNINGS_BLOCK_ENTRIES: 'true',
      TTP_EARNINGS_STATUS_JSON: JSON.stringify({ date: today, symbols: { TSLA: false } }),
      TTP_CONSISTENCY_ENABLED: 'true',
      TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
      TTP_PROFIT_TARGET_DOLLARS: '3000',
      TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.10',
      MIN_TRADE_CONFIDENCE: '0.5',
      MIN_STRATEGY_CONFIDENCE: '0.35',
      MAX_POSITION_SIZE_PCT: '0.05',
      STOP_LOSS_PERCENT: '1.5',
      TAKE_PROFIT_PERCENT: '2.0',
      INITIAL_BALANCE: '50000',
    };
    delete process.env.DATA_DIR;
    delete process.env.JOURNAL_DATA_DIR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadConfig(opts = { force: true, silent: true }) {
    return require('../foundation/ConfigLoader').load(opts);
  }

  function useProductionProfile() {
    process.env.PROFILE = 'production';
  }

  function useBacktestProfile(profile = 'backtest-all') {
    process.env.PROFILE = profile;
  }

  function configFileValue(configPath) {
    const tradingConfigFile = require('../config/trading.config.json');
    return configPath.split('.').reduce((current, part) => (
      current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
    ), tradingConfigFile);
  }

  test('uses trading.config.json defaults when overlapping env vars are unset', () => {
    delete process.env.MIN_STRATEGY_CONFIDENCE;
    delete process.env.MAX_CONFIDENCE;
    delete process.env.STOP_LOSS_PERCENT;
    delete process.env.TAKE_PROFIT_PERCENT;
    delete process.env.TRAILING_STOP_PERCENT;
    delete process.env.TRAILING_ACTIVATION;
    delete process.env.ATR_FILTER_ENABLED;
    delete process.env.ATR_MIN_PERCENT;
    delete process.env.ENABLE_TRAI;
    delete process.env.TRAI_MODE;
    delete process.env.TRAI_VETO;

    const loaded = loadConfig();

    expect(loaded.config.confidence.minStrategyConfidence).toBe(configFileValue('confidence.minStrategyConfidence'));
    expect(loaded.config.confidence.maxConfidence).toBe(configFileValue('confidence.maxConfidence'));
    expect(loaded.config.exits.stopLossPercent).toBe(configFileValue('exits.stopLossPercent'));
    expect(loaded.config.exits.takeProfitPercent).toBe(configFileValue('exits.takeProfitPercent'));
    expect(loaded.config.exits.trailingStopPercent).toBe(configFileValue('exits.trailingStopPercent'));
    expect(loaded.config.strategies.enableBreakRetest).toBe(configFileValue('pipeline.enableBreakRetest'));
    expect(loaded.config.strategies.enableMarketRegime).toBe(configFileValue('pipeline.enableMarketRegime'));
    expect(loaded.config.strategies.enableORB).toBe(configFileValue('pipeline.enableOpeningRangeBreakout'));
    expect(loaded.config.exits.trailingActivation).toBe(configFileValue('exits.trailingActivation'));
    expect(loaded.config.filters.atrEnabled).toBe(configFileValue('filters.atrEnabled'));
    expect(loaded.config.filters.atrMinPercent).toBe(configFileValue('filters.atrMinPercent'));
    expect(loaded.config.trai.enabled).toBe(true);
    expect(loaded.config.trai.mode).toBe('passive');
    expect(loaded.config.trai.vetoPower).toBe(false);
    expect(loaded.sources['confidence.minStrategyConfidence']).toBe('default');
    expect(loaded.sources['exits.stopLossPercent']).toBe('default');
    expect(loaded.sources['filters.atrEnabled']).toBe('default');
    expect(loaded.sources['trai.enabled']).toBe('default');
  });

  test('selected tuning profile cannot override launch-profile-owned EMA behavior', () => {
    process.env.TUNING_PROFILE = 'trey-spec';
    process.env.MIN_TRADE_CONFIDENCE = '0.91';
    process.env.MAX_POSITION_SIZE_PCT = '0.01';
    process.env.EMA_CROSSOVER_ENTRY_EVENTS_ONLY = 'false';
    process.env.EMA_CROSSOVER_WARMUP_BARS = '10';
    process.env.ATR_CONTRACTS_ENABLED = 'false';
    process.env.BE_SCALEOUT_FRACTION = '0.5';
    process.env.TIERED_EXIT_ENABLED = 'true';
    process.env.TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF = '0';

    const loaded = loadConfig();

    expect(loaded.config.confidence.minTradeConfidence).toBe(0.5);
    expect(loaded.config.sizing.maxPositionSize).toBe(0.10);
    expect(loaded.config.strategyBehavior.emaCrossover.entryEventsOnly).toBe(false);
    expect(loaded.config.strategyBehavior.emaCrossover.warmupBars).toBe(10);
    expect(loaded.config.strategyBehavior.atrContracts.enabled).toBe(true);
    expect(loaded.config.exitLogic.beScaleOut.scaleOutFraction).toBe(0.25);
    expect(loaded.config.exitLogic.tieredExit.enabled).toBe(false);
    expect(loaded.config.evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff).toBe(30);
    expect(loaded.sources['confidence.minTradeConfidence']).toBe('config:launchProfiles.paper.confidence.minTradeConfidence');
    expect(loaded.sources['strategyBehavior.emaCrossover.warmupBars'])
      .toBe('config:launchProfiles.paper.strategyBehavior.emaCrossover.warmupBars');
    expect(loaded.sources['exitLogic.tieredExit.enabled']).toBe('profile:trey-spec:TIERED_EXIT_ENABLED');
    expect(loaded.sources['evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff']).toBe('config:launchProfiles.paper.venueGuards.ttp.marketTime.entryBufferMinutesBeforeCutoff');
  });

  test('ConfigLoader compatibility reads use the resolved ConfigLoader snapshot', () => {
    process.env.MIN_TRADE_CONFIDENCE = '0.62';
    process.env.MIN_STRATEGY_CONFIDENCE = '0.41';
    process.env.MAX_POSITION_SIZE_PCT = '0.04';
    process.env.FEE_MODEL = 'per_share_minimum';
    process.env.FEE_PER_SHARE = '0.005';
    process.env.FEE_MIN_ORDER = '0.75';
    process.env.ATR_FILTER_ENABLED = 'true';
    process.env.ATR_MIN_PERCENT = '0.17';
    process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS = '125';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '900';
    process.env.MTF_TIMEFRAMES = '5m,15m,1h';

    const loaded = loadConfig();

    process.env.MIN_TRADE_CONFIDENCE = '0.91';
    process.env.MIN_STRATEGY_CONFIDENCE = '0.88';
    process.env.MAX_POSITION_SIZE_PCT = '0.22';
    process.env.FEE_MODEL = 'percent';
    process.env.FEE_PER_SHARE = '9';
    process.env.FEE_MIN_ORDER = '99';
    process.env.ATR_FILTER_ENABLED = 'false';
    process.env.ATR_MIN_PERCENT = '0.99';
    process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS = '999';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '9999';
    process.env.MTF_TIMEFRAMES = '1m';

    const ConfigLoader = require('../foundation/ConfigLoader');

    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(loaded.config.confidence.minTradeConfidence);
    expect(ConfigLoader.get('confidence.minStrategyConfidence')).toBe(loaded.config.confidence.minStrategyConfidence);
    expect(ConfigLoader.get('positionSizing.maxPositionSize')).toBe(loaded.config.sizing.maxPositionSize);
    expect(ConfigLoader.get('fees.model')).toBe(loaded.config.fees.model);
    expect(ConfigLoader.get('fees.perShare')).toBe(loaded.config.fees.perShare);
    expect(ConfigLoader.get('fees.minOrderFee')).toBe(loaded.config.fees.minOrderFee);
    expect(ConfigLoader.get('filters.atrEnabled')).toBe(loaded.config.filters.atrEnabled);
    expect(ConfigLoader.get('filters.atrMinPercent')).toBe(loaded.config.filters.atrMinPercent);
    expect(ConfigLoader.get('orchestrator.mtfTimeframes')).toEqual(['5m', '15m', '1h']);
    expect(loaded.sources['orchestrator.mtfTimeframes']).toBe('env:MTF_TIMEFRAMES');
    expect(ConfigLoader.get('evalRules.ttp.accountLimits.dailyLossDollars')).toBe(
      loaded.config.evalRules.ttp.accountLimits.dailyLossDollars
    );
    expect(ConfigLoader.get('evalRules.ttp.consistency.profitTargetDollars')).toBe(
      loaded.config.evalRules.ttp.consistency.profitTargetDollars
    );

    expect(ConfigLoader.getSection('confidence').minTradeConfidence).toBe(loaded.config.confidence.minTradeConfidence);
    expect(ConfigLoader.getSection('positionSizing').maxPositionSize).toBe(loaded.config.sizing.maxPositionSize);
    expect(ConfigLoader.getSection('fees').perShare).toBe(loaded.config.fees.perShare);
    expect(ConfigLoader.getSection('filters').atrMinPercent).toBe(loaded.config.filters.atrMinPercent);
  });

  test('ConfigLoader cannot shadow ConfigLoader-owned paths after config load', () => {
    process.env.MIN_TRADE_CONFIDENCE = '0.62';
    process.env.FEE_PER_SHARE = '0.005';
    process.env.FEE_MIN_ORDER = '0.75';
    process.env.TIER1_TARGET = '0.011';

    const loaded = loadConfig();
    const ConfigLoader = require('../foundation/ConfigLoader');

    expect(() => ConfigLoader.setOverrides({
      confidence: { minTradeConfidence: 0.77 },
      fees: { perShare: 0.123 },
      exits: { profitTiers: { tier1: 0.099 } },
    })).toThrow(/attempted to override ConfigLoader-owned path\(s\) after config load/);

    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(loaded.config.confidence.minTradeConfidence);
    expect(ConfigLoader.get('fees.perShare')).toBe(loaded.config.fees.perShare);
    expect(ConfigLoader.get('exits.profitTiers.tier1')).toBe(loaded.config.tiers.tier1);
    expect(ConfigLoader.getSection('exits').profitTiers.tier1).toBe(loaded.config.tiers.tier1);
  });

  test('ConfigLoader tuning profiles cannot replace ConfigLoader-owned paths after config load', () => {
    loadConfig();
    const ConfigLoader = require('../foundation/ConfigLoader');

    expect(() => ConfigLoader.applyTuningProfile('legacy-wide', {
      phase: 'startup',
      requireFlat: true,
      flatState: { flat: true, source: 'unit-test' },
      source: 'unit-test',
    })).toThrow(/attempted to override ConfigLoader-owned path\(s\) after config load/);
  });

  test('ConfigLoader mapped reads follow ConfigLoader force reloads', () => {
    process.env.MIN_TRADE_CONFIDENCE = '0.62';
    process.env.FEE_PER_SHARE = '0.005';

    const ConfigLoader = require('../foundation/ConfigLoader');
    const first = ConfigLoader.load({ force: true, silent: true });

    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(first.config.confidence.minTradeConfidence);
    expect(ConfigLoader.get('fees.perShare')).toBe(first.config.fees.perShare);

    process.env.MIN_TRADE_CONFIDENCE = '0.72';
    process.env.FEE_PER_SHARE = '0.456';

    const second = ConfigLoader.load({ force: true, silent: true });
    expect(ConfigLoader.get('confidence.minTradeConfidence')).toBe(second.config.confidence.minTradeConfidence);
    expect(ConfigLoader.get('fees.perShare')).toBe(second.config.fees.perShare);
  });

  test('ConfigLoader whole pipeline section uses ConfigLoader strategy snapshot values', () => {
    process.env.ENABLE_RSI = 'false';
    process.env.ENABLE_ORB = 'false';
    const ConfigLoader = require('../foundation/ConfigLoader');

    process.env.ENABLE_RSI = 'true';
    process.env.ENABLE_ORB = 'true';
    const loaded = loadConfig();
    const pipeline = ConfigLoader.get('pipeline');

    expect(pipeline.enableRSI).toBe(loaded.config.strategies.enableRSI);
    expect(pipeline.enableOpeningRangeBreakout).toBe(loaded.config.strategies.enableORB);
    expect(ConfigLoader.get('pipeline.enableRSI')).toBe(loaded.config.strategies.enableRSI);
    expect(ConfigLoader.get('pipeline.enableOpeningRangeBreakout')).toBe(loaded.config.strategies.enableORB);
  });

  test('ConfigLoader exposes additional ConfigLoader-owned compatibility sections', () => {
    process.env.MAX_HOLD_MINUTES = '333';
    process.env.TRAIL_ATR_MULTIPLIER = '2.4';
    process.env.TRAIL_MIN_ACTIVATION = '1.2';
    process.env.TRAIL_TREND_WIDEN = '1.8';
    process.env.TRAIL_STRUCTURE_TIGHTEN = '0.6';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_VOLUME_CAP_ENABLED = 'true';
    process.env.TTP_MARKET_TIME_ENABLED = 'true';
    process.env.TTP_ACCOUNT_LIMITS_ENABLED = 'true';
    process.env.TTP_EARNINGS_RESTRICTION_ENABLED = 'true';
    process.env.TTP_CONSISTENCY_ENABLED = 'true';

    const loaded = loadConfig();
    const ConfigLoader = require('../foundation/ConfigLoader');

    expect(ConfigLoader.get('exits.maxHoldMinutes')).toBe(loaded.config.exits.maxHoldMinutes);
    expect(ConfigLoader.getSection('exits').maxHoldMinutes).toBe(loaded.config.exits.maxHoldMinutes);
    expect(ConfigLoader.get('trail.atrMultiplier')).toBe(loaded.config.trail.atrMultiplier);
    expect(ConfigLoader.get('trail.minActivation')).toBe(loaded.config.trail.minActivation);
    expect(ConfigLoader.getSection('trail')).toEqual(loaded.config.trail);
    expect(ConfigLoader.get('evalRules.enabled')).toBe(loaded.config.evalRules.enabled);
    expect(ConfigLoader.get('evalRules.ttp.enabled')).toBe(loaded.config.evalRules.ttp.enabled);
    expect(ConfigLoader.get('evalRules.ttp.volumeCap.enabled')).toBe(loaded.config.evalRules.ttp.volumeCap.enabled);
    expect(ConfigLoader.get('evalRules.ttp.marketTime.enabled')).toBe(loaded.config.evalRules.ttp.marketTime.enabled);
    expect(ConfigLoader.get('evalRules.ttp.accountLimits.enabled')).toBe(loaded.config.evalRules.ttp.accountLimits.enabled);
    expect(ConfigLoader.get('evalRules.ttp.earningsRestriction.enabled')).toBe(loaded.config.evalRules.ttp.earningsRestriction.enabled);
    expect(ConfigLoader.get('evalRules.ttp.consistency.enabled')).toBe(loaded.config.evalRules.ttp.consistency.enabled);
  });

  test('risk limits are sourced from explicit launch profiles', () => {
    useBacktestProfile('backtest-all');
    delete process.env.MAX_DRAWDOWN;
    delete process.env.MAX_DAILY_LOSS;

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.mode.backtest).toBe(true);
    expect(loaded.config.risk.maxDrawdown).toBe(5);
    expect(loaded.config.risk.maxDailyLoss).toBe(1);
    expect(loaded.config.risk.maxWeeklyLoss).toBe(5);
    expect(loaded.config.risk.maxMonthlyLoss).toBe(5);
    expect(loaded.config.risk.riskManagerBypass).toBe(true);
    expect(loaded.config.risk.accountDrawdownBypass).toBe(true);
    expect(loaded.sources['risk.maxDrawdown']).toBe('config:launchProfiles.backtest-all.risk.maxDrawdown');
    expect(loaded.sources['risk.riskManagerBypass']).toBe('config:launchProfiles.backtest-all.risk.riskManagerBypass');
  });

  test('legacy live env flags cannot activate live mode without the production launch profile', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EXECUTION_MODE = 'live';
    process.env.TRADING_MODE = 'live';
    process.env.ENABLE_LIVE_TRADING = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.mode.liveTrading).toBe(false);
    expect(loaded.config.mode.execution).toBe('paper');
    expect(loaded.sources['mode.execution']).toBe('config:launchProfiles.paper.mode');
  });

  test('production profile enables live trading with bypasses disabled', () => {
    useProductionProfile();
    process.env.ACCOUNT_DRAWDOWN_BYPASS = 'true';
    process.env.RISK_MANAGER_BYPASS = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.mode.liveTrading).toBe(true);
    expect(loaded.config.mode.confirmLive).toBe(true);
    expect(loaded.config.risk.accountDrawdownBypass).toBe(false);
    expect(loaded.config.risk.riskManagerBypass).toBe(false);
    expect(loaded.sources['risk.accountDrawdownBypass']).toBe('config:launchProfiles.production.risk.accountDrawdownBypass');
  });

  test('production profile owns min trade confidence and ignores env/dotenv attempts', () => {
    process.env.DOTENV_CONFIG_PATH = path.join(__dirname, 'fixtures', 'live-confidence-dotenv.env');
    useProductionProfile();
    process.env.MIN_TRADE_CONFIDENCE = '0.49';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.confidence.minTradeConfidence).toBe(0.5);
    expect(loaded.sources['confidence.minTradeConfidence']).toBe('config:launchProfiles.production.confidence.minTradeConfidence');
  });

  test('production TTP enablement is owned by venueGuards.ttp.enabled, not legacy env flags', () => {
    useProductionProfile();
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.enabled).toBe(true);
    expect(loaded.config.evalRules.ttp.enabled).toBe(true);
    expect(loaded.sources['evalRules.enabled']).toBe('config:launchProfiles.production.venueGuards.ttp.enabled');
  });

  test('session router is explicit in launch profiles and unaffected by legacy env flags', () => {
    process.env.SESSION_ROUTER_ENABLED = 'false';
    process.env.SESSION_ROUTER_FAST = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.sessionRouter).toEqual({
      mode: 'static',
      staticSession: 'stocks',
      cryptoSymbols: ['BTC-USD'],
      checkIntervalMs: 60000,
      forceCloseOnSessionEnd: true,
      fast: false,
    });
    expect(loaded.sources['sessionRouter.mode']).toBe('config:launchProfiles.paper.sessionRouter.mode');
    expect(loaded.sources['sessionRouter.fast']).toBe('config:launchProfiles.paper.sessionRouter.fast');
  });

  test('resolver refuses a launch profile missing the sessionRouter block', () => {
    const tradingConfigFile = require('../config/trading.config.json');
    const mockedConfig = JSON.parse(JSON.stringify(tradingConfigFile));
    delete mockedConfig.launchProfiles.paper.sessionRouter;

    jest.resetModules();
    jest.doMock('../config/trading.config.json', () => mockedConfig);

    expect(() => require('../foundation/ConfigLoader').load({ force: true, silent: true }))
      .toThrow(/launchProfiles\.paper\.sessionRouter/);

    jest.dontMock('../config/trading.config.json');
  });

  test('paper and backtest profiles keep eval rule posture explicit', () => {
    const paperLoaded = loadConfig();

    expect(paperLoaded.errors).toEqual([]);
    expect(paperLoaded.config.mode.liveTrading).toBe(false);
    expect(paperLoaded.config.evalRules.enabled).toBe(false);

    jest.resetModules();
    useBacktestProfile('backtest-all');

    const backtestLoaded = loadConfig();

    expect(backtestLoaded.errors).toEqual([]);
    expect(backtestLoaded.config.mode.backtest).toBe(true);
    expect(backtestLoaded.config.evalRules.enabled).toBe(false);
  });

  test('throws during live startup when enabled webhook route is still dry-run', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'true';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://signalstack.example/webhook';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=true/);
  });

  test('throws during live startup when enabled webhook route has no URL', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = '';

    expect(() => loadConfig()).toThrow(/missing SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws during live startup when enabled webhook route uses placeholder URL', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://app.signalstack.com/hook/YOUR_UNIQUE_ID';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=false.*placeholder SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws during live startup when enabled webhook route encodes placeholder URL', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://app.signalstack.com/hook/YOUR%5FUNIQUE%5FID';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=false.*placeholder SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws during live startup when enabled webhook route double-encodes placeholder URL', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://app.signalstack.com/hook/YOUR%255FUNIQUE%255FID';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=false.*placeholder SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws during live startup when enabled webhook route hides placeholder in userinfo', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://YOUR_UNIQUE_ID@app.signalstack.com/hook/real';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=false.*placeholder SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws when enabled webhook route uses non-https URL', () => {
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'http://signalstack.example/webhook';

    expect(() => loadConfig()).toThrow(/must use https/);
  });

  test('throws when enabled webhook route has malformed URL', () => {
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'not a url';

    expect(() => loadConfig()).toThrow(/SIGNALSTACK_WEBHOOK_URL is invalid/);
  });

  test('allows direct live broker route when webhook orders are disabled', () => {
    useProductionProfile();
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'false';
    process.env.WEBHOOK_DRY_RUN = 'true';
    process.env.SIGNALSTACK_WEBHOOK_URL = '';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.webhookOrders.enabled).toBe(false);
    expect(loaded.config.webhookOrders.dryRun).toBe(true);
  });

  test('rejects Alpaca broker config without an explicit API key outside backtest', () => {
    process.env.ALPACA_API_KEY = '';

    expect(() => loadConfig()).toThrow(/ALPACA_API_KEY must be configured/);
  });

  test('rejects Alpaca broker config without an explicit API secret outside backtest', () => {
    process.env.ALPACA_API_SECRET = '';

    expect(() => loadConfig()).toThrow(/ALPACA_API_SECRET must be configured/);
  });

  test('rejects Alpaca broker config without an explicit paper or live mode outside backtest', () => {
    process.env.ALPACA_MODE = '';

    expect(() => loadConfig()).toThrow(/ALPACA_MODE must be explicitly set to paper or live/);
  });

  test('rejects Alpaca broker config without an explicit symbol source outside backtest', () => {
    delete process.env.ALPACA_SYMBOLS;
    delete process.env.TRADING_PAIR;

    expect(() => loadConfig()).toThrow(/ALPACA_SYMBOLS or TRADING_PAIR must be explicitly configured/);
  });

  test('keeps Alpaca credentials non-blocking for backtest mode', () => {
    useBacktestProfile('backtest-all');
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.BACKTEST_MODE = 'true';
    process.env.ALPACA_MODE = '';
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    delete process.env.TRADING_PAIR;

    const loaded = loadConfig();

    expect(loaded.config.mode.backtest).toBe(true);
    expect(loaded.errors.join('\n')).not.toMatch(/ALPACA_API_KEY|ALPACA_API_SECRET|ALPACA_MODE/);
  });

  test('loads TTP volume cap policy from ConfigLoader defaults', () => {
    const loaded = loadConfig();

    expect(loaded.config.evalRules).toEqual(expect.objectContaining({
      enabled: false,
      ttp: expect.objectContaining({
        enabled: false,
        volumeCap: expect.objectContaining({
          enabled: true,
          percent: 0.05,
          timeframe: '1m',
          fallbackToMostRecentVolume: true,
          maxReferenceAgeMs: 180000,
          maxReferenceAgeLimitMs: 300000,
        }),
        marketTime: expect.objectContaining({
          enabled: true,
          blockEntriesAfterCutoff: true,
          liquidationEnabled: true,
          cutoffMinutesBeforeClose: 10,
        }),
        accountLimits: expect.objectContaining({
          enabled: true,
          enforceDailyLossPause: true,
          enforceMaxLoss: true,
          accountStartOfDayDate: currentNewYorkDate(),
          accountStartOfDayEquity: 50000,
          dailyLossDollars: 50,
          maxLossThresholdEquity: 4850,
        }),
        earningsRestriction: expect.objectContaining({
          enabled: true,
          blockEntries: true,
          manualStatus: {
            date: currentNewYorkDate(),
            symbols: { TSLA: false },
          },
        }),
        consistency: expect.objectContaining({
          enabled: true,
          maxPositionProfitRatio: 0.30,
          profitTargetDollars: 300,
          maxProfitTargetInitialBalanceRatio: 0.06,
        }),
      }),
    }));
  });

  test('loads eval trace observability defaults from ConfigLoader', () => {
    const loaded = loadConfig();

    expect(loaded.config.observability).toEqual(expect.objectContaining({
      evalTraceEnabled: true,
      evalTraceBacktest: false,
      traceEventMaxBufferedBytes: 1048576,
    }));
  });

  test('loads data-feed watchdog values from ConfigLoader', () => {
    const loaded = loadConfig();

    expect(loaded.config.dataFeed).toEqual(expect.objectContaining({
      bootRestHydrationLimit: 60,
      livenessBackfillLimit: 10,
      livenessCheckIntervalMs: 60000,
      maxDataSilenceMs: 120000,
      activeTimeframeMultiplier: 1.5,
      activeTimeframeSlackMs: 60000,
      maxBackfillAgeMultiplier: 2,
      maxBackfillAgeSlackMs: 60000,
      staleDataMaxAgeMs: 120000,
      staleDataRecoveryAgeMs: 30000,
      gapThresholdMultiplier: 1.5,
      gapBackfillBufferCandles: 5,
      gapRecoveryCleanCandlesRequired: 3,
      gapBackfillRetryDelayMs: 60000,
      expectedQuietLogIntervalMs: 300000,
    }));
  });

  test('loads an explicit journal data root by default', () => {
    const loaded = loadConfig();

    expect(loaded.config.paths.journalDataDir).toBe(path.join(process.cwd(), 'data', 'journal'));
    expect(loaded.sources['paths.journalDataDir']).toBe('default');
  });

  test('derives the default journal data root from DATA_DIR when set', () => {
    process.env.DATA_DIR = path.join(process.cwd(), 'data', 'paper-runtime');

    const loaded = loadConfig();

    expect(loaded.config.paths.dataDir).toBe(process.env.DATA_DIR);
    expect(loaded.config.paths.journalDataDir).toBe(path.join(process.env.DATA_DIR, 'journal'));
    expect(loaded.sources['paths.dataDir']).toBe('env:DATA_DIR');
    expect(loaded.sources['paths.journalDataDir']).toBe('default');
  });

  test('rejects invalid data-feed watchdog config', () => {
    process.env.LIVENESS_CHECK_INTERVAL_MS = '0';

    expect(() => loadConfig()).toThrow(/livenessCheckIntervalMs out of range/);
  });

  test('rejects invalid trace event websocket backpressure config', () => {
    process.env.TRACE_EVENT_MAX_BUFFERED_BYTES = '0';

    expect(() => loadConfig()).toThrow(/TRACE_EVENT_MAX_BUFFERED_BYTES out of range/);
  });

  test('rejects loose trace event websocket backpressure config', () => {
    process.env.TRACE_EVENT_MAX_BUFFERED_BYTES = '16777217';

    expect(() => loadConfig()).toThrow(/TRACE_EVENT_MAX_BUFFERED_BYTES out of range/);
  });

  test('stable TTP env attempts cannot override production venue guard config', () => {
    useProductionProfile();
    process.env.TTP_VOLUME_CAP_PERCENT = '1.5';
    process.env.TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS = '600000';
    process.env.TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE = '0';
    process.env.TTP_ACCOUNT_LIMITS_ENABLED = 'false';
    process.env.TTP_DAILY_LOSS_PAUSE_ENABLED = 'false';
    process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY = '0';
    process.env.TTP_EARNINGS_RESTRICTION_ENABLED = 'false';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '0';
    process.env.TTP_CONSISTENCY_ENABLED = 'false';
    process.env.TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO = '1.5';
    process.env.TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO = '0.50';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.ttp.volumeCap.percent).toBe(0.05);
    expect(loaded.config.evalRules.ttp.volumeCap.maxReferenceAgeMs).toBe(180000);
    expect(loaded.config.evalRules.ttp.marketTime.cutoffMinutesBeforeClose).toBe(10);
    expect(loaded.config.evalRules.ttp.accountLimits.enabled).toBe(true);
    expect(loaded.config.evalRules.ttp.accountLimits.enforceDailyLossPause).toBe(true);
    expect(loaded.config.evalRules.ttp.accountLimits.maxLossThresholdEquity).toBe(4850);
    expect(loaded.config.evalRules.ttp.earningsRestriction.enabled).toBe(true);
    expect(loaded.config.evalRules.ttp.consistency.enabled).toBe(true);
    expect(loaded.config.evalRules.ttp.consistency.profitTargetDollars).toBe(300);
  });

  test('rejects invalid operational TTP account equity refresh value', () => {
    useProductionProfile();
    process.env.TTP_ACCOUNT_START_OF_DAY_EQUITY = 'not-a-number';

    expect(() => loadConfig()).toThrow(/TTP_ACCOUNT_START_OF_DAY_EQUITY must be configured/);
  });

  test('warns on missing TTP start-of-day date when eval rules are enabled without blocking startup', () => {
    useProductionProfile();
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '';

    const loaded = loadConfig();

    expect(loaded.config.evalRules.ttp.accountLimits.accountStartOfDayDate).toBe('');
    expect(loaded.warnings.join('\n')).toMatch(/TTP_ACCOUNT_START_OF_DAY_DATE should be YYYY-MM-DD/);
  });

  test('warns on stale TTP start-of-day date during live eval startup without blocking startup', () => {
    useProductionProfile();
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '2026-01-01';

    const loaded = loadConfig();

    expect(loaded.config.evalRules.ttp.accountLimits.accountStartOfDayDate).toBe('2026-01-01');
    expect(loaded.warnings.join('\n')).toMatch(/TTP_ACCOUNT_START_OF_DAY_DATE 2026-01-01 does not match current New York date/);
  });

  test('ignores deprecated TTP earnings known-status knob without blocking startup', () => {
    useProductionProfile();
    process.env.TTP_EARNINGS_REQUIRE_KNOWN_STATUS = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.ttp.earningsRestriction).not.toHaveProperty('requireKnownStatus');
  });

  test('allows missing manual TTP earnings status without blocking startup', () => {
    useProductionProfile();
    delete process.env.TTP_EARNINGS_STATUS_JSON;

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.ttp.earningsRestriction.manualStatus).toBeNull();
  });

  test('warns on malformed manual TTP earnings status JSON without blocking startup', () => {
    useProductionProfile();
    process.env.TTP_EARNINGS_STATUS_JSON = '{bad-json';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.join('\n')).toMatch(/TTP_EARNINGS_STATUS_JSON parse failed and will be ignored/);
  });

  test('warns on non-boolean manual TTP earnings symbol values without blocking startup', () => {
    useProductionProfile();
    process.env.TTP_EARNINGS_STATUS_JSON = JSON.stringify({ date: currentNewYorkDate(), symbols: { TSLA: 'false' } });

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.join('\n')).toMatch(/TTP_EARNINGS_STATUS_JSON\.symbols\.TSLA should be boolean/);
  });

  test('legacy live/backtest env conflict cannot override launch-profile mode', () => {
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.LIVE_TRADING = 'true';
    process.env.RISK_MANAGER_BYPASS = 'true';
    process.env.ACCOUNT_DRAWDOWN_BYPASS = 'true';

    const paperLoaded = loadConfig();
    expect(paperLoaded.config.mode.execution).toBe('paper');
    expect(paperLoaded.config.mode.liveTrading).toBe(false);

    jest.resetModules();
    useBacktestProfile('backtest-all');
    const backtestLoaded = loadConfig();
    expect(backtestLoaded.config.mode.execution).toBe('backtest');
    expect(backtestLoaded.config.mode.backtest).toBe(true);
    expect(backtestLoaded.config.mode.liveTrading).toBe(false);
  });
});
