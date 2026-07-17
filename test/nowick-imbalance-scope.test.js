'use strict';

const NoWickImbalance = require('../modules/NoWickImbalance');

function makeCandles(symbol, timeframe, closes) {
  return closes.map((close, index) => ({
    symbol,
    timeframe,
    o: close - 0.2,
    h: close + 0.5,
    l: close - 0.5,
    c: close,
    v: 1000,
    t: `2026-06-12T14:${String(index).padStart(2, '0')}:00Z`,
  }));
}

function makeCtx(symbol, timeframe, closes) {
  return {
    priceHistory: makeCandles(symbol, timeframe, closes),
    indicators: { atr: 1 },
    extras: { symbol, timeframe },
  };
}

describe('NoWickImbalance scoped pending levels', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENABLE_NOWICK: 'true',
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('keeps pending levels isolated by symbol and timeframe', () => {
    const strategy = new NoWickImbalance({ swingLookback: 5 });
    const tslaScope = 'TSLA:15M';
    strategy.scopedState.set(tslaScope, {
      candleCount: 4,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 3,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const spyResult = strategy.evaluate(makeCtx('SPY', '15m', [101, 102, 101.5, 103, 102.5, 99.5]));

    expect(spyResult).toBeNull();
    expect(strategy.scopedState.get(tslaScope).pendingLevels).toHaveLength(1);
    expect(strategy.scopedState.get('SPY:15M')).toEqual(expect.objectContaining({
      candleCount: 1,
      pendingLevels: [],
    }));
  });

  test('requires explicit symbol and timeframe instead of using a shared fallback bucket', () => {
    const strategy = new NoWickImbalance({ swingLookback: 5 });
    expect(() => strategy.evaluate({
      priceHistory: makeCandles('TSLA', '15m', [101, 102, 101.5, 103, 102.5, 99.5]).map(({ symbol, timeframe, ...candle }) => candle),
      indicators: { atr: 1 },
      extras: {},
    })).toThrow(/\[STRATEGY-SCOPE\] NoWickImbalance symbol is required/);
  });

  test('can reset one scope without clearing sibling symbol state', () => {
    const strategy = new NoWickImbalance({ swingLookback: 5 });
    strategy.scopedState.set('TSLA:15M', { candleCount: 2, pendingLevels: [{ level: 100 }] });
    strategy.scopedState.set('SPY:15M', { candleCount: 3, pendingLevels: [{ level: 400 }] });

    strategy.reset({ symbol: 'TSLA', timeframe: '15m' });

    expect(strategy.scopedState.has('TSLA:15M')).toBe(false);
    expect(strategy.scopedState.get('SPY:15M').pendingLevels).toHaveLength(1);
  });

  test('keeps same-symbol pending levels isolated across timeframes', () => {
    const strategy = new NoWickImbalance({ swingLookback: 5 });
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 4,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 3,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const oneMinuteResult = strategy.evaluate(makeCtx('TSLA', '1m', [101, 102, 101.5, 103, 102.5, 99.5]));

    expect(oneMinuteResult).toBeNull();
    expect(strategy.scopedState.get('TSLA:15M').pendingLevels).toHaveLength(1);
    expect(strategy.scopedState.get('TSLA:1M')).toEqual(expect.objectContaining({
      candleCount: 1,
      pendingLevels: [],
    }));
  });

  test('builds bullish stop and target from actual current entry price', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      entryMode: 'tap',
      stopLookbackBars: 5,
      stopBufferAtr: 0.1,
      targetRR: 1,
    });
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('uptrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 4,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const result = strategy.evaluate({
      priceHistory: [
        ...makeCandles('TSLA', '15m', [101, 102, 103, 104]),
        { symbol: 'TSLA', timeframe: '15m', o: 100.4, h: 100.5, l: 99.4, c: 99.5, v: 1000, t: '2026-06-12T14:05:00Z' },
      ],
      indicators: { atr: 1 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    });

    expect(result.direction).toBe('buy');
    expect(result.signalData.entryPrice).toBe(99.5);
    expect(result.overrideLevels.stopLoss).toBeLessThan(99.5);
    expect(result.overrideLevels.takeProfit).toBeGreaterThan(99.5);
    expect(result.signalData.structuralLevel).toBe(99.4);
    expect(result.signalData.stopBuffer).toBe(0.1);
    expect(result.overrideLevels.takeProfit).toBeCloseTo(99.5 + (99.5 - 99.3), 6);
  });

  test('builds bearish stop and target from actual current entry price', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      entryMode: 'tap',
      stopLookbackBars: 5,
      stopBufferAtr: 0.1,
      targetRR: 1,
    });
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('downtrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bearish',
        level: 100,
        formationCount: 4,
        trend: 'downtrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const result = strategy.evaluate({
      priceHistory: [
        ...makeCandles('TSLA', '15m', [104, 103, 102, 101]),
        { symbol: 'TSLA', timeframe: '15m', o: 99.6, h: 100.6, l: 99.5, c: 100.5, v: 1000, t: '2026-06-12T14:05:00Z' },
      ],
      indicators: { atr: 1 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    });

    expect(result.direction).toBe('sell');
    expect(result.signalData.entryPrice).toBe(100.5);
    expect(result.overrideLevels.stopLoss).toBeGreaterThan(100.5);
    expect(result.overrideLevels.takeProfit).toBeLessThan(100.5);
    expect(result.signalData.structuralLevel).toBe(104.5);
    expect(result.signalData.stopBuffer).toBe(0.1);
    expect(result.overrideLevels.takeProfit).toBeCloseTo(100.5 - ((104.5 + 0.1) - 100.5), 6);
  });

  test('tap mode can fire on a continuation candle that slices through the level', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      entryMode: 'tap',
      stopLookbackBars: 5,
      stopBufferAtr: 0,
    });
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('uptrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 4,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const result = strategy.evaluate({
      priceHistory: [
        ...makeCandles('TSLA', '15m', [101, 102, 103, 104]),
        { symbol: 'TSLA', timeframe: '15m', o: 100.5, h: 101, l: 99, c: 99.5, v: 1000, t: '2026-06-12T14:05:00Z' },
      ],
      indicators: { atr: 1 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    });

    expect(result).toEqual(expect.objectContaining({
      direction: 'buy',
      reason: expect.stringContaining('tap'),
    }));
  });

  test('rejection mode refuses a continuation candle that slices through the level', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      entryMode: 'rejection',
      stopLookbackBars: 5,
      stopBufferAtr: 0,
    });
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('uptrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 4,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const result = strategy.evaluate({
      priceHistory: [
        ...makeCandles('TSLA', '15m', [101, 102, 103, 104]),
        { symbol: 'TSLA', timeframe: '15m', o: 100.5, h: 101, l: 99, c: 99.5, v: 1000, t: '2026-06-12T14:05:00Z' },
      ],
      indicators: { atr: 1 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    });

    expect(result).toBeNull();
    expect(strategy._getScopeState('TSLA:15M').pendingLevels).toHaveLength(0);
    expect(strategy._getScopeState('TSLA:15M').invalidatedLevels).toEqual([
      expect.objectContaining({ reason: 'touch_without_rejection', level: 100 }),
    ]);
  });

  test('wick on the entry side is not a NoWick signature', () => {
    const strategy = new NoWickImbalance({ entrySideWickMaxPct: 5 });

    expect(strategy._detectNoWick({
      o: 100,
      h: 102,
      l: 99.8,
      c: 101.5,
      v: 1000,
      t: '2026-06-12T14:05:00Z',
    })).toBeNull();
    expect(strategy._detectNoWick({
      o: 100,
      h: 100.2,
      l: 98,
      c: 98.5,
      v: 1000,
      t: '2026-06-12T14:10:00Z',
    })).toBeNull();
  });

  test('almost-touch reversal invalidates the level before later entry', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      almostTouchPct: 0.05,
    });
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('uptrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bullish',
        level: 100,
        formationCount: 4,
        trend: 'uptrend',
        timestamp: '2026-06-12T14:00:00Z',
      }],
    });

    const nearMiss = strategy.evaluate({
      priceHistory: [
        ...makeCandles('TSLA', '15m', [101, 102, 103, 104]),
        { symbol: 'TSLA', timeframe: '15m', o: 101, h: 101.5, l: 100.04, c: 101.2, v: 1000, t: '2026-06-12T14:05:00Z' },
      ],
      indicators: { atr: 1 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    });

    expect(nearMiss).toBeNull();
    expect(strategy._getScopeState('TSLA:15M').pendingLevels).toHaveLength(0);
    expect(strategy._getScopeState('TSLA:15M').invalidatedLevels).toEqual([
      expect.objectContaining({ reason: 'almost_touch_reversal', level: 100 }),
    ]);
  });

  test('normalizes reset scope casing to the same key used during evaluation', () => {
    const strategy = new NoWickImbalance({ swingLookback: 5 });
    strategy.scopedState.set('TSLA:15M', { candleCount: 2, pendingLevels: [{ level: 100 }] });

    strategy.reset({ symbol: 'tsla', timeframe: '15m' });

    expect(strategy.scopedState.has('TSLA:15M')).toBe(false);
  });

  test('orchestrator rethrows NoWick scope errors instead of converting them to hold', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const noWick = orchestrator.strategies.find(strategy => strategy.name === 'NoWickImbalance');
    expect(noWick).toBeDefined();
    orchestrator.strategies = [noWick];

    expect(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      makeCandles('TSLA', '15m', Array.from({ length: 20 }, (_, index) => 100 + index * 0.1))
        .map(({ symbol, timeframe, ...candle }) => candle),
      { price: 102 }
    )).toThrow(/\[STRATEGY-SCOPE\] NoWickImbalance symbol is required/);
  });

  test('orchestrator reset hook clears NoWick state for session transitions', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.noWickModule.scopedState.set('TSLA:15M', { candleCount: 2, pendingLevels: [{ level: 100 }] });
    orchestrator.noWickModule.scopedState.set('BTC-USD:1M', { candleCount: 4, pendingLevels: [{ level: 70000 }] });

    orchestrator.resetNoWickState();

    expect(orchestrator.noWickModule.scopedState.size).toBe(0);
  });

  test('orchestrator expands NoWick twin split into two entry fanout legs', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'NoWickImbalance',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'NoWick twin split proof',
        overrideLevels: { stopLoss: 99, takeProfit: 105 },
        entryGroupType: 'twin',
        entryGroupId: 'bullish:1:2',
        entryTriggerClass: 'nowick_retrace',
        entryFanout: [{
          fanoutIndex: 0,
          fanoutCount: 2,
          entryGroupType: 'twin',
          entryGroupId: 'bullish:1:2',
          direction: 'buy',
          sizingMultiplier: 0.5,
          reason: 'NoWick twin leg 1',
          overrideLevels: { stopLoss: 99, takeProfit: 105 },
        }, {
          fanoutIndex: 1,
          fanoutCount: 2,
          entryGroupType: 'twin',
          entryGroupId: 'bullish:1:2',
          direction: 'buy',
          sizingMultiplier: 0.5,
          reason: 'NoWick twin leg 2',
          overrideLevels: { stopLoss: 98.5, takeProfit: 106 },
        }],
        signalData: { twinSplit: { active: true, fanoutCount: 2 } },
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      makeCandles('TSLA', '15m', Array.from({ length: 20 }, (_, index) => 100 + index * 0.1)),
      { price: 102, symbol: 'TSLA', timeframe: '15m' }
    );

    expect(result.action).toBe('BUY');
    expect(result.sizingMultiplier).toBe(1);
    expect(result.entryFanout).toHaveLength(2);
    expect(result.entryFanout.map(entry => entry.sizingMultiplier)).toEqual([0.5, 0.5]);
    expect(result.entryFanout.map(entry => entry.exitContract.stopLossPercent))
      .toEqual([expect.closeTo(-2.941176, 4), expect.closeTo(-3.431373, 4)]);
    expect(result.signalBreakdown.fanoutCount).toBe(2);
  });
});
