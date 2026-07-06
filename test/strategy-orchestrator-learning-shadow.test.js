'use strict';

describe('StrategyOrchestrator pattern learning shadow snapshot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ATR_FILTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
      MIN_STRATEGY_CONFIDENCE: '0.35',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function addContract(ConfigLoader, strategyName) {
    ConfigLoader.BASE_CONFIG.exitContracts[strategyName] = {
      ...ConfigLoader.BASE_CONFIG.exitContracts.default,
      minConfidence: null,
      atrMinPercent: null,
    };
  }

  function buildOrchestrator(strategies) {
    const ConfigLoader = require('../foundation/ConfigLoader');
    strategies.forEach(strategy => addContract(ConfigLoader, strategy.name));
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = strategies;
    return orchestrator;
  }

  const indicators = { atr: 1, volatility: 1 };
  const regime = { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 };
  const priceHistory = [{ o: 100, h: 101, l: 99, c: 100, t: 1 }];
  const patternScope = {
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-1',
    accountIdSource: 'test',
    assetClass: 'stocks',
    executionMode: 'live',
    timeframe: '15m',
  };

  test('attaches learning snapshot without changing winner selection', () => {
    const memory = {
      getConfidence: jest.fn(() => ({
        confidence: 0.72,
        source: 'learned_success',
        status: 'promoted',
        stats: { wins: 8, losses: 3, totalTrades: 11 },
      })),
    };
    const orchestrator = buildOrchestrator([
      {
        name: 'LowerSignal',
        evaluate: () => ({ direction: 'buy', confidence: 0.50, reason: 'lower' }),
      },
      {
        name: 'HigherSignal',
        evaluate: () => ({ direction: 'buy', confidence: 0.70, reason: 'higher' }),
      },
    ]);

    const result = orchestrator.evaluate(
      indicators,
      [{ name: 'Learning Pattern', confidence: 0.72, direction: 'buy', features: [1, 2, 3] }],
      regime,
      priceHistory,
      { price: 100, timeframe: '15m', patternMemory: memory, patternScope }
    );

    expect(result.winnerStrategy).toBe('HigherSignal');
    expect(result.confidence).toBe(70);
    expect(memory.getConfidence).toHaveBeenCalledWith([1, 2, 3], patternScope);
    expect(result.allResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        strategyName: 'HigherSignal',
        learningSnapshot: expect.objectContaining({
          mode: 'shadow',
          applied: false,
          decisionImpact: 'none_shadow_only',
          featureSource: 'patterns[0].features',
          source: 'learned_success',
          status: 'promoted',
          confidence: 0.72,
          wins: 8,
          losses: 3,
          sampleCount: 11,
          modifier: null,
        }),
      }),
    ]));
  });

  test('does not invent learning data when pattern memory is absent', () => {
    const orchestrator = buildOrchestrator([
      {
        name: 'PlainSignal',
        evaluate: () => ({ direction: 'buy', confidence: 0.70, reason: 'plain' }),
      },
    ]);

    const result = orchestrator.evaluate(
      indicators,
      [{ name: 'Learning Pattern', confidence: 0.72, direction: 'buy', features: [1, 2, 3] }],
      regime,
      priceHistory,
      { price: 100, timeframe: '15m', patternScope }
    );

    expect(result.winnerStrategy).toBe('PlainSignal');
    expect(result.allResults[0].learningSnapshot).toBeNull();
  });

  test('records unavailable snapshot when memory exists but features are missing', () => {
    const memory = { getConfidence: jest.fn() };
    const orchestrator = buildOrchestrator([
      {
        name: 'NoFeatureSignal',
        evaluate: () => ({ direction: 'buy', confidence: 0.70, reason: 'plain' }),
      },
    ]);

    const result = orchestrator.evaluate(
      indicators,
      [],
      regime,
      priceHistory,
      { price: 100, timeframe: '15m', patternMemory: memory, patternScope }
    );

    expect(memory.getConfidence).not.toHaveBeenCalled();
    expect(result.allResults[0].learningSnapshot).toEqual(expect.objectContaining({
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      featureSource: null,
      source: 'no_features',
      status: 'unavailable',
      modifier: null,
    }));
  });
});
