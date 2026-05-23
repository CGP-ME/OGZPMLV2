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
