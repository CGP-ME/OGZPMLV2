'use strict';

describe('StrategyOrchestrator MTF ConfigLoader ownership', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      PROFILE: 'backtest-all',
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      MTF_TIMEFRAMES: '5m,15m,1h',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('uses frozen ConfigLoader mtfTimeframes instead of post-load env drift', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    const loaded = ConfigLoader.load({ force: true, silent: true });

    process.env.MTF_TIMEFRAMES = '1m';

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe: '1m' });

    expect(loaded.config.orchestrator.mtfTimeframes).toEqual(['5m', '15m', '1h']);
    expect(loaded.sources['orchestrator.mtfTimeframes']).toBe('env:MTF_TIMEFRAMES');
    expect(orchestrator.mtfAdapter.getSnapshot().activeTimeframes).toEqual(['1m', '5m', '15m', '1h']);
  });
});
