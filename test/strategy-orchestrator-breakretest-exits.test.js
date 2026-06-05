'use strict';

describe('StrategyOrchestrator BreakRetest structural exits', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SOLO_STRATEGY: 'BreakRetest',
      ENABLE_BREAKRETEST: 'true',
      ATR_FILTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('converts BreakRetest stopLoss and takeProfit levels into the final exit contract', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.breakAndRetestModule.update = jest.fn(() => ({
      direction: 'buy',
      confidence: 0.8,
      reason: 'test break retest',
      stopLoss: 95,
      takeProfit: 110,
      pt2: 115,
    }));

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    );

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('BreakRetest');
    expect(result.exitContract.stopLossPercent).toBeCloseTo(-5, 6);
    expect(result.exitContract.takeProfitPercent).toBeCloseTo(10, 6);
  });

  test('does not fall back to default exits when structural levels have no valid price basis', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'structural levels without price',
        overrideLevels: { stopLoss: 95, takeProfit: 110 },
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [],
      { timeframe: '15m' }
    );

    expect(result.action).toBe('HOLD');
    expect(result.exitContract).toBeNull();
    expect(result.reasons.join(' ')).toContain('No signals detected');
  });
});
