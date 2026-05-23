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
      MIN_TRADE_CONFIDENCE: '0.50',
      MIN_STRATEGY_CONFIDENCE: '0.35',
      MAX_POSITION_SIZE_PCT: '0.05',
      STOP_LOSS_PERCENT: '1.5',
      TAKE_PROFIT_PERCENT: '2.0',
      INITIAL_BALANCE: '10000',
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
      }),
    }));
  });

  test('loads eval trace observability defaults from ConfigLoader', () => {
    const loaded = loadConfig();

    expect(loaded.config.observability).toEqual(expect.objectContaining({
      evalTraceEnabled: true,
      evalTraceBacktest: false,
    }));
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
