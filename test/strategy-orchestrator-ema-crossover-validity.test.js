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

  test('trey-spec blocks trend strategies in chop and uses ATR-scaled runner contract in trend', async () => {
    const TradingConfig = require('../core/TradingConfig');
    await TradingConfig.runWithTuningProfile(
      'trey-spec',
      async () => {
        const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
        const priceHistory = buildAlignedCandles();
        const price = 100;
        const indicators = { atr: 2, volatility: 2, trend: 'uptrend' };

        const choppy = new StrategyOrchestrator({ minConfluenceCount: 1 });
        choppy.strategies = [{
          name: 'EMASMACrossover',
          evaluate: () => ({ direction: 'buy', confidence: 0.9, reason: 'unit trend signal' }),
        }];

        const choppyResult = choppy.evaluate(
          indicators,
          [],
          { currentRegime: 'sideways', confidence: 0.8, positionMultiplier: 1 },
          priceHistory,
          { price, timeframe: '15m' }
        );

        expect(choppyResult.action).toBe('HOLD');
        expect(choppyResult.filteredResults[0]).toEqual(expect.objectContaining({
          strategyName: 'EMASMACrossover',
          rejectedBy: 'trend_regime_entry_eligibility',
        }));
        expect(choppyResult.filteredResults[0].decisionAttribution.contributors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'trend_regime_entry_eligibility',
              passed: false,
              regimeType: 'ranging',
            }),
          ])
        );

        const trending = new StrategyOrchestrator({ minConfluenceCount: 1 });
        trending.strategies = [{
          name: 'EMASMACrossover',
          evaluate: () => ({ direction: 'buy', confidence: 0.9, reason: 'unit trend signal' }),
        }];

        const trendResult = trending.evaluate(
          indicators,
          [],
          { currentRegime: 'trending_up', confidence: 0.8, positionMultiplier: 1 },
          priceHistory,
          { price, timeframe: '15m' }
        );

        expect(trendResult.action).toBe('BUY');
        expect(trendResult.exitContract.stopLossPercent).toBeCloseTo(-4, 6);
        expect(trendResult.exitContract.trailingStopPercent).toBeCloseTo(4, 6);
        expect(trendResult.exitContract.trailingActivation).toBeCloseTo(4, 6);
        expect(trendResult.allResults[0].decisionAttribution.contributors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'trend_regime_entry_eligibility',
              passed: true,
              regimeType: 'trending',
            }),
            expect.objectContaining({
              name: 'atr_scaled_exit_contract',
              atr: 2,
              price,
              stopMultiplier: 2,
              trailMultiplier: 2,
            }),
          ])
        );
      },
      {
        phase: 'startup',
        requireFlat: true,
        flatState: { flat: true, source: 'unit-test' },
        source: 'unit-test',
      }
    );
  });
});
