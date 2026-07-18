'use strict';

describe('StrategyOrchestrator symbol-scoped strategy state', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('creates one module instance per strategy and symbol', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const fallbackModule = { id: 'legacy' };
    let created = 0;

    const tslaA = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'TSLA',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const tslaB = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'tsla',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const nvda = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      'NVDA',
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const legacy = orchestrator._getSymbolStrategyModule(
      'ProbeStrategy',
      null,
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );

    expect(tslaA).toBe(tslaB);
    expect(nvda).not.toBe(tslaA);
    expect(legacy).toBe(fallbackModule);
    expect(created).toBe(2);
  });

  test('resolves stateful strategy scope from candle symbol when extras symbol is absent', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
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
      fallbackModule,
      () => ({ id: `created-${++created}` })
    );
    const nvdaOrb = orchestrator._getSymbolStrategyModule(
      'OpeningRangeBreakout',
      nvdaSymbol,
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

  test('records SmartMoneySweep trade results on the matching symbol module only', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const SmartMoneySweep = require('../modules/SmartMoneySweep');
    const ConfigLoader = require('../foundation/ConfigLoader');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const makeSmartMoneySweep = () => new SmartMoneySweep(
      ConfigLoader.get('strategies.SmartMoneySweep') || {}
    );

    const tslaSms = orchestrator._getSymbolStrategyModule(
      'SmartMoneySweep',
      'TSLA',
      orchestrator.smartMoneySweepModule,
      makeSmartMoneySweep
    );
    const nvdaSms = orchestrator._getSymbolStrategyModule(
      'SmartMoneySweep',
      'NVDA',
      orchestrator.smartMoneySweepModule,
      makeSmartMoneySweep
    );

    orchestrator.recordTradeResult('SmartMoneySweep', -1.25, 'TSLA');

    expect(tslaSms.dailyLosses).toBe(1);
    expect(nvdaSms.dailyLosses).toBe(0);
    expect(orchestrator.smartMoneySweepModule.dailyLosses).toBe(0);
  });
});
