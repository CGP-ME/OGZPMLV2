'use strict';

describe('ConfigLoader live trading safety guard', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
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
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
      SIGNALSTACK_WEBHOOK_URL: '',
      WEBHOOK_TIMEOUT_MS: '5000',
      WEBHOOK_ORDER_LOG_CAP: '500',
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
      TTP_ACCOUNT_START_OF_DAY_DATE: '2026-05-23',
      TTP_ACCOUNT_START_OF_DAY_EQUITY: '50000',
      TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
      TTP_MAX_LOSS_THRESHOLD_EQUITY: '47500',
      TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
      TTP_EARNINGS_BLOCK_ENTRIES: 'true',
      TTP_EARNINGS_REQUIRE_KNOWN_STATUS: 'true',
      TTP_CONSISTENCY_ENABLED: 'true',
      TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO: '0.30',
      TTP_PROFIT_TARGET_DOLLARS: '3000',
      TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO: '0.10',
      MIN_TRADE_CONFIDENCE: '0.50',
      MIN_STRATEGY_CONFIDENCE: '0.35',
      MAX_POSITION_SIZE_PCT: '0.05',
      STOP_LOSS_PERCENT: '1.5',
      TAKE_PROFIT_PERCENT: '2.0',
      INITIAL_BALANCE: '50000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadConfig(opts = { force: true, silent: true }) {
    return require('../foundation/ConfigLoader').load(opts);
  }

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

  test('allows live trading when both bypasses are disabled', () => {
    process.env.LIVE_TRADING = 'true';
    process.env.CONFIRM_LIVE_TRADING = 'true';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.mode.liveTrading).toBe(true);
    expect(loaded.config.risk.accountDrawdownBypass).toBe(false);
    expect(loaded.config.risk.riskManagerBypass).toBe(false);
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
    process.env.WEBHOOK_ORDERS_ENABLED = 'false';
    process.env.WEBHOOK_DRY_RUN = 'true';
    process.env.SIGNALSTACK_WEBHOOK_URL = '';

    const loaded = loadConfig();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.webhookOrders.enabled).toBe(false);
    expect(loaded.config.webhookOrders.dryRun).toBe(true);
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
          accountStartOfDayDate: '2026-05-23',
          accountStartOfDayEquity: 50000,
          dailyLossDollars: 500,
          maxLossThresholdEquity: 47500,
        }),
        earningsRestriction: expect.objectContaining({
          enabled: true,
          blockEntries: true,
          requireKnownStatus: true,
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

  test('rejects missing TTP start-of-day date when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '';

    expect(() => loadConfig()).toThrow(/TTP_ACCOUNT_START_OF_DAY_DATE must be YYYY-MM-DD/);
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

  test('rejects disabling TTP earnings restriction when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_RESTRICTION_ENABLED = 'false';

    expect(() => loadConfig()).toThrow(/TTP_EARNINGS_RESTRICTION_ENABLED=false is illegal/);
  });

  test('rejects allowing unknown TTP earnings status when eval rules are enabled', () => {
    process.env.EVAL_RULES_ENABLED = 'true';
    process.env.TTP_RULES_ENABLED = 'true';
    process.env.TTP_EARNINGS_REQUIRE_KNOWN_STATUS = 'false';

    expect(() => loadConfig()).toThrow(/TTP_EARNINGS_REQUIRE_KNOWN_STATUS=false is illegal/);
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

  test('keeps backtest bypass combinations non-blocking', () => {
    process.env.EXECUTION_MODE = 'backtest';
    process.env.CANDLE_SOURCE = 'file';
    process.env.LIVE_TRADING = 'true';
    process.env.RISK_MANAGER_BYPASS = 'true';
    process.env.ACCOUNT_DRAWDOWN_BYPASS = 'true';

    const loaded = loadConfig();

    expect(loaded.config.mode.backtest).toBe(true);
    expect(loaded.errors).toContain('Cannot enable both live trading and backtest mode');
    expect(loaded.errors).toContain('LIVE_TRADING=true cannot run with ACCOUNT_DRAWDOWN_BYPASS=true');
    expect(loaded.errors).toContain('LIVE_TRADING=true cannot run with RISK_MANAGER_BYPASS=true');
  });
});
