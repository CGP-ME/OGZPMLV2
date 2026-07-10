'use strict';

describe('StrategyOrchestrator BreakRetest structural exits', () => {
  const originalEnv = process.env;

  function expectExitGeometryRejection(runEvaluation, expectedReason) {
    const result = runEvaluation();
    expect(result.action).toBe('HOLD');
    expect(result.filteredResults).toHaveLength(1);
    expect(result.filteredResults[0].rejectedBy).toBe('exit_geometry');
    expect(result.filteredResults[0].rejectReason).toMatch(expectedReason);
    return result;
  }

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
      overrideLevels: { stopLoss: 95, takeProfit: 110, pt2: 115 },
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

  test('rejects structural levels with no valid price basis instead of falling back to defaults', () => {
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

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [],
      { timeframe: '15m' }
    ), /EXIT-GEOMETRY.*entry price must be a finite positive price/);
  });

  test('converts valid short structural levels without masking direction', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'sell',
        confidence: 0.8,
        reason: 'valid short structural levels',
        overrideLevels: { stopLoss: 105, takeProfit: 90 },
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    );

    expect(result.action).toBe('SELL');
    expect(result.exitContract.stopLossPercent).toBeCloseTo(-5, 6);
    expect(result.exitContract.takeProfitPercent).toBeCloseTo(10, 6);
  });

  test('rejects wrong-side short structural levels instead of sign-masking them', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'sell',
        confidence: 0.8,
        reason: 'wrong-side short structural levels',
        overrideLevels: { stopLoss: 95, takeProfit: 110 },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*stopLoss/);
  });

  test('rejects wrong-side long structural stopLoss', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'wrong-side long structural stop',
        overrideLevels: { stopLoss: 105, takeProfit: 110 },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*stopLoss/);
  });

  test('rejects zero-distance structural stopLoss at entry price', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'zero-distance structural stop',
        overrideLevels: { stopLoss: 100, takeProfit: 110 },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*stopLoss/);
  });

  test.each([
    ['long takeProfit below entry', 'buy', 95, 90],
    ['short takeProfit above entry', 'sell', 105, 110],
    ['short takeProfit at entry', 'sell', 105, 100],
  ])('rejects wrong-side %s', (_label, direction, stopLoss, takeProfit) => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction,
        confidence: 0.8,
        reason: 'wrong-side structural take profit',
        overrideLevels: { stopLoss, takeProfit },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*takeProfit/);
  });

  test('rejects non-finite structural levels before percent conversion', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'sell',
        confidence: 0.8,
        reason: 'non-finite short structural levels',
        overrideLevels: { stopLoss: '90abc', takeProfit: '110abc' },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*stopLoss must be a finite positive price/);
  });

  test.each([
    ['empty string', ''],
    ['whitespace string', '   '],
    ['zero', 0],
    ['null', null],
    ['boolean false', false],
  ])('rejects %s structural stopLoss before JavaScript numeric coercion', (_label, stopLoss) => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'sell',
        confidence: 0.8,
        reason: 'coercion-prone short structural levels',
        overrideLevels: { stopLoss, takeProfit: 90 },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*stopLoss must be a finite positive price/);
  });

  test.each([
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -1],
    ['Infinity', Infinity],
  ])('rejects %s entry price before structural percent conversion', (_label, price) => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'invalid entry price structural levels',
        overrideLevels: { stopLoss: 95, takeProfit: 110 },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*entry price must be a finite positive price/);
  });

  test.each([
    ['empty string', ''],
    ['whitespace string', '   '],
    ['zero', 0],
    ['null', null],
    ['boolean false', false],
  ])('rejects %s structural takeProfit before JavaScript numeric coercion', (_label, takeProfit) => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'BreakRetest',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'coercion-prone long structural target',
        overrideLevels: { stopLoss: 95, takeProfit },
      }),
    }];

    expectExitGeometryRejection(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    ), /EXIT-GEOMETRY.*takeProfit must be a finite positive price/);
  });
});
