'use strict';

describe('StrategyOrchestrator symbol-scoped strategy state', () => {
  const originalEnv = process.env;
  let ConfigLoader;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-strategy-state-test-missing.env',
      PROFILE: 'paper',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'file',
      MTF_TIMEFRAMES: '5m,15m,1h',
      WEBSOCKET_AUTH_TOKEN: 'test-dashboard-token',
      ALPACA_API_KEY: 'test-alpaca-key',
      ALPACA_API_SECRET: 'test-alpaca-secret',
      KRAKEN_API_KEY: 'test-kraken-key',
      KRAKEN_API_SECRET: 'test-kraken-secret',
      ENABLE_TRAI: 'false',
    };
    ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('creates one module instance per strategy, symbol, and evaluation timeframe', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1, mtfBaseTimeframe: '15m' });
    const fallbackModule = { id: 'legacy' };
    let created = 0;

    const tslaA = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'TSLA',
      '15m',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const tslaB = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'tsla',
      '15m',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const tsla1h = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'TSLA',
      '1h',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const nvda = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'NVDA',
      '15m',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const legacy = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      null,
      null,
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const mtfA = orchestrator._getSymbolStrategyModule(
      'MtfConfluenceService',
      'TSLA',
      null,
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const mtfB = orchestrator._getSymbolStrategyModule(
      'MtfConfluenceService',
      'tsla',
      null,
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );

    expect(tslaA).toBe(tslaB);
    expect(tsla1h).not.toBe(tslaA);
    expect(nvda).not.toBe(tslaA);
    expect(mtfA).toBe(mtfB);
    expect(legacy).toBe(fallbackModule);
    expect(created).toBe(4);
  });

  test('resolves stateful strategy scope from candle symbol when extras symbol is absent', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1, mtfBaseTimeframe: '15m' });
    const fallbackModule = { id: 'legacy' };
    let created = 0;

    const tslaSymbol = orchestrator._resolveStrategyStateSymbol(
      { extras: {} },
      { symbol: 'TSLA', h: 105, l: 98, c: 103, t: Date.now() }
    );
    const nvdaSymbol = orchestrator._resolveStrategyStateSymbol(
      { extras: {} },
      { symbol: 'NVDA', h: 510, l: 500, c: 505, t: Date.now() }
    );

    const tslaOrb = orchestrator._getSymbolStrategyModule(
      'OpeningRangeBreakout',
      tslaSymbol,
      '15m',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const nvdaOrb = orchestrator._getSymbolStrategyModule(
      'OpeningRangeBreakout',
      nvdaSymbol,
      '15m',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );

    expect(tslaSymbol).toBe('TSLA');
    expect(nvdaSymbol).toBe('NVDA');
    expect(tslaOrb).not.toBe(fallbackModule);
    expect(nvdaOrb).not.toBe(fallbackModule);
    expect(tslaOrb).not.toBe(nvdaOrb);
    expect(created).toBe(2);
  });

  test('retains symbol- and timeframe-local SmartMoneySweep IVB state', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const SmartMoneySweep = require('../modules/SmartMoneySweep');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1, mtfBaseTimeframe: '15m' });
    const makeSmartMoneySweep = () => new SmartMoneySweep(
      () => ConfigLoader.get('strategies.SmartMoneySweep')
    );

    const tslaSms = orchestrator._getSymbolStrategyModule(
      'SmartMoneySweep',
      'TSLA',
      '15m',
      orchestrator.smartMoneySweepModule,
      makeSmartMoneySweep
    );
    const tslaSms1h = orchestrator._getSymbolStrategyModule(
      'SmartMoneySweep',
      'TSLA',
      '1h',
      orchestrator.smartMoneySweepModule,
      makeSmartMoneySweep
    );
    const nvdaSms = orchestrator._getSymbolStrategyModule(
      'SmartMoneySweep',
      'NVDA',
      '15m',
      orchestrator.smartMoneySweepModule,
      makeSmartMoneySweep
    );

    const sessionCandle = { t: Date.UTC(2026, 0, 5, 15, 0), o: 100, h: 101, l: 99, c: 100, v: 1000 };
    const secondFrameCandle = { ...sessionCandle, h: 202, l: 198, c: 200 };
    tslaSms._updateIVB(sessionCandle, 15);
    tslaSms1h._updateIVB(secondFrameCandle, 60);

    expect(tslaSms1h).not.toBe(tslaSms);
    expect(tslaSms.ivbHigh).toBe(101);
    expect(tslaSms1h.ivbHigh).toBe(202);
    expect(tslaSms.sessionDay).toBe('2026-01-05');
    expect(tslaSms1h.sessionDay).toBe('2026-01-05');
  });
});
