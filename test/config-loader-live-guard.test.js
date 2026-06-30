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

  test('keeps risk defaults sourced from trading.config.json without weakening explicit-source guard', () => {
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.BACKTEST_MODE = 'true';
    delete process.env.MAX_DRAWDOWN;
    delete process.env.MAX_DAILY_LOSS;

    const loaded = loadConfig();

    expect(loaded.config.risk.maxDrawdown).toBe(configFileValue('risk.maxDrawdown'));
    expect(loaded.config.risk.maxDailyLoss).toBe(configFileValue('risk.maxDailyLoss'));
    expect(loaded.sources['risk.maxDrawdown']).toBe('default');
    expect(loaded.sources['risk.maxDailyLoss']).toBe('default');
    expect(loaded.errors).toEqual(expect.arrayContaining([
      'risk.maxDrawdown requires explicit env/profile source',
      'risk.maxDailyLoss requires explicit env/profile source',
    ]));
  });

  test('throws during silent startup when live trading enables account drawdown bypass', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.ACCOUNT_DRAWDOWN_BYPASS = 'true';

    expect(() => loadConfig()).toThrow(/ACCOUNT_DRAWDOWN_BYPASS=true/);
  });

  test('throws during silent startup when live trading enables risk manager bypass', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.RISK_MANAGER_BYPASS = 'true';

    expect(() => loadConfig()).toThrow(/RISK_MANAGER_BYPASS=true/);
  });

  test('throws during live startup without explicit live confirmation', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'false';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';

    expect(() => loadConfig()).toThrow(/CONFIRM_LIVE_TRADING=true/);
  });

  test('allows live trading when both bypasses are disabled', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.mode.liveTrading).toBe(true);
    expect(loaded.config.risk.accountDrawdownBypass).toBe(false);
    expect(loaded.config.risk.riskManagerBypass).toBe(false);
  });

  test('allows live startup at configured MIN_TRADE_CONFIDENCE eval floor', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.MIN_TRADE_CONFIDENCE = '0.5';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.confidence.minTradeConfidence).toBe(0.5);
  });

  test('throws during live startup when MIN_TRADE_CONFIDENCE is missing or below eval floor', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.MIN_TRADE_CONFIDENCE = '0.49';

    expect(() => loadConfig()).toThrow(/MIN_TRADE_CONFIDENCE >= 0\.5/);

    jest.resetModules();
    delete process.env.MIN_TRADE_CONFIDENCE;

    expect(() => loadConfig()).toThrow(/MIN_TRADE_CONFIDENCE from process env/);
  });

  test('throws during live startup when MIN_TRADE_CONFIDENCE only comes from dotenv', () => {
    process.env.DOTENV_CONFIG_PATH = path.join(__dirname, 'fixtures', 'live-confidence-dotenv.env');
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    delete process.env.MIN_TRADE_CONFIDENCE;

    expect(() => loadConfig()).toThrow(/MIN_TRADE_CONFIDENCE from process env, got dotenv:MIN_TRADE_CONFIDENCE/);
  });

  test('throws during live startup when EVAL_RULES_ENABLED is false or unset', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'true';

    expect(() => loadConfig()).toThrow(/EVAL_RULES_ENABLED unset or false/);

    jest.resetModules();
    delete process.env.EVAL_RULES_ENABLED;

    expect(() => loadConfig()).toThrow(/EVAL_RULES_ENABLED unset or false/);
  });

  test('derives live posture from execution-mode aliases before eval guard validation', () => {
    process.env.LIVE_TRADING = 'false';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EXECUTION_MODE = 'live';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'true';

    expect(() => loadConfig()).toThrow(/EVAL_RULES_ENABLED unset or false/);

    jest.resetModules();
    process.env.EXECUTION_MODE = 'paper';
    process.env.TRADING_MODE = 'live';

    expect(() => loadConfig()).toThrow(/EVAL_RULES_ENABLED unset or false/);

    jest.resetModules();
    process.env.TRADING_MODE = 'paper';
    process.env.ENABLE_LIVE_TRADING = 'true';

    expect(() => loadConfig()).toThrow(/EVAL_RULES_ENABLED unset or false/);
  });

  test('throws during live startup when TTP_RULES_ENABLED is false or unset while eval rules are enabled', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/TTP_RULES_ENABLED unset or false/);

    jest.resetModules();
    delete process.env.TTP_RULES_ENABLED;

    expect(() => loadConfig()).toThrow(/TTP_RULES_ENABLED unset or false/);
  });

  test('keeps eval rule flags non-blocking for paper and backtest posture', () => {
    process.env.LIVE_TRADING = 'false';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';

    const paperLoaded = loadConfig();

    expect(paperLoaded.errors).toEqual([]);
    expect(paperLoaded.config.mode.liveTrading).toBe(false);
    expect(paperLoaded.config.evalRules.enabled).toBe(false);

    jest.resetModules();
    process.env.EXECUTION_MODE = 'backtest';
    process.env.BACKTEST_MODE = 'true';
    process.env.CANDLE_SOURCE = 'file';
    process.env.LIVE_TRADING = 'false';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';

    const backtestLoaded = loadConfig();

    expect(backtestLoaded.errors).toEqual([]);
    expect(backtestLoaded.config.mode.backtest).toBe(true);
    expect(backtestLoaded.config.evalRules.enabled).toBe(false);
  });

  test('throws during live startup when enabled webhook route is still dry-run', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'true';
    process.env.SIGNALSTACK_WEBHOOK_URL = 'https://signalstack.example/webhook';

    expect(() => loadConfig()).toThrow(/WEBHOOK_DRY_RUN=true/);
  });

  test('throws during live startup when enabled webhook route has no URL', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.WEBHOOK_ORDERS_ENABLED = 'true';
    process.env.WEBHOOK_DRY_RUN = 'false';
    process.env.SIGNALSTACK_WEBHOOK_URL = '';

    expect(() => loadConfig()).toThrow(/missing SIGNALSTACK_WEBHOOK_URL/);
  });

  test('throws during live startup when enabled webhook route uses placeholder URL', () => {
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
          dailyLossDollars: 500,
          maxLossThresholdEquity: 47500,
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
          profitTargetDollars: 3000,
          maxProfitTargetInitialBalanceRatio: 0.10,
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

  test('rejects invalid TTP volume cap config when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_VOLUME_CAP_PERCENT = '1.5';

    expect(() => loadConfig()).toThrow(/TTP_VOLUME_CAP_PERCENT out of range/);
  });

  test('does not silently fall back on non-numeric TTP volume cap percent', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_VOLUME_CAP_PERCENT = 'not-a-number';

    expect(() => loadConfig()).toThrow(/TTP_VOLUME_CAP_PERCENT out of range/);
  });

  test('rejects invalid TTP reference-age config when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS = '0';

    expect(() => loadConfig()).toThrow(/TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS out of range/);
  });

  test('rejects loose TTP reference-age config when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS = '600000';

    expect(() => loadConfig()).toThrow(/TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS too loose/);
  });

  test('rejects invalid TTP liquidation cutoff config when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE = '0';

    expect(() => loadConfig()).toThrow(/TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE out of range/);
  });

  test('rejects disabling both TTP cutoff blocking and liquidation enforcement', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_BLOCK_ENTRIES_AFTER_CUTOFF = 'false';
    process.env.TTP_LIQUIDATION_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/cannot disable both cutoff entry blocking and liquidation enforcement/);
  });

  test('rejects missing TTP daily loss pause config when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_ACCOUNT_START_OF_DAY_EQUITY = '';

    expect(() => loadConfig()).toThrow(/TTP_ACCOUNT_START_OF_DAY_EQUITY must be configured/);
  });

  test('warns on missing TTP start-of-day date when eval rules are enabled without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '';

    const loaded = loadConfig();

    expect(loaded.config.evalRules.ttp.accountLimits.accountStartOfDayDate).toBe('');
    expect(loaded.warnings.join('\n')).toMatch(/TTP_ACCOUNT_START_OF_DAY_DATE should be YYYY-MM-DD/);
  });

  test('warns on stale TTP start-of-day date during live eval startup without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '2026-01-01';

    const loaded = loadConfig();

    expect(loaded.config.evalRules.ttp.accountLimits.accountStartOfDayDate).toBe('2026-01-01');
    expect(loaded.warnings.join('\n')).toMatch(/TTP_ACCOUNT_START_OF_DAY_DATE 2026-01-01 does not match current New York date/);
  });

  test('rejects disabling TTP account limits when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_ACCOUNT_LIMITS_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/TTP_ACCOUNT_LIMITS_ENABLED=false is illegal/);
  });

  test('rejects partial TTP account limit enforcement when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_DAILY_LOSS_PAUSE_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/requires both daily loss pause and max loss enforcement/);
  });

  test('rejects missing TTP max loss threshold when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY = '0';

    expect(() => loadConfig()).toThrow(/TTP_MAX_LOSS_THRESHOLD_EQUITY must be configured/);
  });

  test('warns when TTP earnings restriction is disabled without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_RESTRICTION_ENABLED = 'false';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.join('\n')).toMatch(/earnings calendar lane will not block entries/);
  });

  test('ignores deprecated TTP earnings known-status knob without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_REQUIRE_KNOWN_STATUS = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.ttp.earningsRestriction).not.toHaveProperty('requireKnownStatus');
  });

  test('allows missing manual TTP earnings status without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    delete process.env.TTP_EARNINGS_STATUS_JSON;

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.evalRules.ttp.earningsRestriction.manualStatus).toBeNull();
  });

  test('warns on malformed manual TTP earnings status JSON without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_STATUS_JSON = '{bad-json';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.join('\n')).toMatch(/TTP_EARNINGS_STATUS_JSON parse failed and will be ignored/);
  });

  test('warns on non-boolean manual TTP earnings symbol values without blocking startup', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_STATUS_JSON = JSON.stringify({ date: currentNewYorkDate(), symbols: { TSLA: 'false' } });

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings.join('\n')).toMatch(/TTP_EARNINGS_STATUS_JSON\.symbols\.TSLA should be boolean/);
  });

  test('rejects missing TTP profit target when consistency rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '0';

    expect(() => loadConfig()).toThrow(/TTP_PROFIT_TARGET_DOLLARS must be configured/);
  });

  test('rejects disabling TTP consistency enforcement when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_CONSISTENCY_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/TTP_CONSISTENCY_ENABLED=false is illegal/);
  });

  test('rejects invalid TTP consistency ratio when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO = '1.5';

    expect(() => loadConfig()).toThrow(/TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO out of range/);
  });

  test('rejects TTP profit targets above the configured initial-balance ratio cap', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.INITIAL_BALANCE = '50000';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '6000';

    expect(() => loadConfig()).toThrow(/TTP_PROFIT_TARGET_DOLLARS too high for initial balance/);
  });

  test('rejects loosening the TTP profit-target ratio cap above the funded maximum', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO = '0.50';

    expect(() => loadConfig()).toThrow(/TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO out of range/);
  });

  test('throws when live trading is combined with backtest bypass posture', () => {
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.LIVE_TRADING = 'true';
    process.env.RISK_MANAGER_BYPASS = 'true';
    process.env.ACCOUNT_DRAWDOWN_BYPASS = 'true';

    expect(() => loadConfig()).toThrow(/Cannot enable both live trading and backtest mode/);
    expect(() => loadConfig()).toThrow(/ACCOUNT_DRAWDOWN_BYPASS=true/);
    expect(() => loadConfig()).toThrow(/RISK_MANAGER_BYPASS=true/);
  });
});
