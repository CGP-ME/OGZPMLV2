'use strict';

describe('StrategyOrchestrator OpeningRangeBreakout exit hint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ATR_FILTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('uses ORB entry-based exitContractHint instead of current-price override level math', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    orchestrator.strategies = [{
      name: 'OpeningRangeBreakout',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'orb structural limit entry',
        overrideLevels: {
          stopLoss: 100,
          takeProfit: 110,
        },
        exitContractHint: {
          strategyName: 'OpeningRangeBreakout',
          stopLossPercent: -0.5,
          takeProfitPercent: 1.5,
          trailingStopPercent: 0.6,
          trailingActivation: 0.8,
          maxHoldTimeMinutes: 180,
          invalidationConditions: ['fvg_filled', 'or_break_reversal'],
        },
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 99, h: 100, l: 98, c: 99, t: 1 }],
      { price: 99, timeframe: '15m' }
    );

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('OpeningRangeBreakout');
    expect(result.exitContract.stopLossPercent).toBeCloseTo(-0.5, 6);
    expect(result.exitContract.takeProfitPercent).toBeCloseTo(1.5, 6);
    expect(result.exitContract.trailingStopPercent).toBeCloseTo(0.6, 6);
    expect(result.exitContract.trailingActivation).toBeCloseTo(0.8, 6);
    expect(result.exitContract.maxHoldTimeMinutes).toBe(180);
    expect(result.exitContract.invalidationConditions).toEqual(['fvg_filled', 'or_break_reversal']);
  });

  test('rejects malformed ORB exitContractHint before contract creation', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    orchestrator.strategies = [{
      name: 'OpeningRangeBreakout',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'bad orb hint',
        exitContractHint: {
          stopLossPercent: 0.5,
          takeProfitPercent: 1.5,
        },
      }),
    }];

    expect(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 99, h: 100, l: 98, c: 99, t: 1 }],
      { price: 99, timeframe: '15m' }
    )).toThrow(/exitContractHint\.stopLossPercent must be a negative finite risk distance/);
  });

  test('rejects invalid optional ORB exitContractHint fields before contract creation', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    orchestrator.strategies = [{
      name: 'OpeningRangeBreakout',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'bad optional orb hint',
        exitContractHint: {
          stopLossPercent: -0.5,
          takeProfitPercent: 1.5,
          trailingStopPercent: 0,
        },
      }),
    }];

    expect(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 99, h: 100, l: 98, c: 99, t: 1 }],
      { price: 99, timeframe: '15m' }
    )).toThrow(/exitContractHint\.trailingStopPercent must be positive when provided/);
  });

  test('rejects malformed ORB invalidation conditions before contract creation', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    orchestrator.strategies = [{
      name: 'OpeningRangeBreakout',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'bad invalidation hint',
        exitContractHint: {
          stopLossPercent: -0.5,
          takeProfitPercent: 1.5,
          invalidationConditions: 'fvg_filled',
        },
      }),
    }];

    expect(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 99, h: 100, l: 98, c: 99, t: 1 }],
      { price: 99, timeframe: '15m' }
    )).toThrow(/exitContractHint\.invalidationConditions must be an array when provided/);
  });

  test('ignores ORB override-level fallback when entry-based hint is missing', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    orchestrator.strategies = [{
      name: 'OpeningRangeBreakout',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'missing orb hint',
        overrideLevels: {
          stopLoss: 100,
          takeProfit: 110,
        },
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 99, h: 100, l: 98, c: 99, t: 1 }],
      { price: 99, timeframe: '15m' }
    );

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('OpeningRangeBreakout');
    expect(result.exitContract.stopLossPercent).toBeLessThan(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OpeningRangeBreakout overrideLevels ignored'));
    warnSpy.mockRestore();
  });
});
