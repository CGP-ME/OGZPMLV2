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
});
