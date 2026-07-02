'use strict';

describe('StrategyOrchestrator EMASMACrossover validity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SOLO_STRATEGY: 'EMASMACrossover',
      ATR_FILTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
      MIN_STRATEGY_CONFIDENCE: '0.35',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function buildAlignedCandles(count = 220) {
    const start = Date.UTC(2026, 0, 1, 14, 30);
    return Array.from({ length: count }, (_, index) => {
      const close = 100 + index * 0.25;
      return {
        t: start + index * 900000,
        o: close - 0.1,
        h: close + 0.2,
        l: close - 0.2,
        c: close,
        v: 1000 + index,
        timeframe: '15m',
      };
    });
  }

  test('labels alignment continuation honestly when there are zero fresh crosses', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const priceHistory = buildAlignedCandles();
    const price = priceHistory[priceHistory.length - 1].c;

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1, trend: 'uptrend' },
      [],
      { currentRegime: 'trending_up', confidence: 0.5, positionMultiplier: 1 },
      priceHistory,
      { price, timeframe: '15m' }
    );

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('EMASMACrossover');
    expect(result.reasons.join(' ')).not.toMatch(/0 crosses/);
    expect(result.reasons.join(' ')).toMatch(/EMA\/SMA Alignment buy \(no fresh crosses\)/);
    expect(result.allResults[0].signalData.signalBasis).toBe('ma_alignment');
    expect(result.allResults[0].signalData.crossoverCount).toBe(0);
    expect(result.signalBreakdown.signals[0].signalBasis).toBe('ma_alignment');
    expect(result.signalBreakdown.signals[0].crossoverCount).toBe(0);
  });
});
