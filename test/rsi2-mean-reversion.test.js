'use strict';

const RSI2MeanReversion = require('../modules/RSI2MeanReversion');

function candle(close, offset = 0) {
  return {
    o: close,
    h: close + 0.2,
    l: close - 0.2,
    c: close,
    v: 100000,
    t: Date.UTC(2026, 5, 15, 13, 30 + offset),
  };
}

function strategy(overrides = {}) {
  return new RSI2MeanReversion({
    rsiPeriod: 2,
    rsiEntry: 5,
    rsiEntryOB: 95,
    trendPeriod: 5,
    allowShorts: false,
    stopLossPercent: -1.0,
    takeProfitPercent: 1.5,
    trailingStopPercent: 0.6,
    trailingActivation: 0.8,
    maxHoldTimeMinutes: 240,
    confidenceBase: 0.50,
    confidenceDepthMultiplier: 0.40,
    maxConfidence: 0.90,
    invalidationConditions: ['rsi2_exit_long', 'regime_change'],
    ...overrides,
  });
}

function upTrendWithDeepPullback() {
  const closes = [];
  for (let i = 0; i < 200; i++) {
    closes.push(100 + i * 0.2);
  }
  closes.push(136, 134);
  return closes.map(candle);
}

function downTrendWithDeepBounce() {
  const closes = [];
  for (let i = 0; i < 200; i++) {
    closes.push(150 - i * 0.2);
  }
  closes.push(114, 116);
  return closes.map(candle);
}

describe('RSI2MeanReversion', () => {
  test('emits long signal when RSI2 is deeply oversold above trend SMA', () => {
    const candles = upTrendWithDeepPullback();

    const signal = strategy({ trendPeriod: 200 }).evaluate({ priceHistory: candles, indicators: {} });

    expect(signal).toMatchObject({
      strategy: 'RSI2MeanReversion',
      direction: 'buy',
    });
    expect(signal.confidence).toBeGreaterThanOrEqual(0.50);
    expect(signal.confidence).toBeLessThanOrEqual(0.90);
    expect(signal.exitContractHint.stopLossPercent).toBeLessThan(0);
    expect(signal.exitContractHint.takeProfitPercent).toBeGreaterThan(0);
    expect(signal.exitContractHint.rsiPeriod).toBe(2);
    expect(signal.exitContractHint.rsiExitLong).toBe(80);
    expect(signal.exitContractHint.invalidationConditions).toContain('rsi2_exit_long');
    expect(signal.signalData.rsi).toBeLessThan(5);
    expect(signal.signalData.rsiExitLong).toBe(80);
  });

  test('blocks short signal unless allowShorts is explicit', () => {
    const candles = downTrendWithDeepBounce();

    expect(strategy({ trendPeriod: 200 }).evaluate({ priceHistory: candles, indicators: {} })).toBeNull();

    const signal = strategy({ allowShorts: true, trendPeriod: 200 }).evaluate({ priceHistory: candles, indicators: {} });
    expect(signal).toMatchObject({
      strategy: 'RSI2MeanReversion',
      direction: 'sell',
    });
  });

  test('fails loudly on invalid exit contract shape', () => {
    expect(() => strategy({ stopLossPercent: 1 })).toThrow(/stopLossPercent must be negative/);
    expect(() => strategy({ invalidationConditions: 'regime_change' })).toThrow(/must be an array/);
  });

  test('seals validated config against post-construction mutation', () => {
    const instance = strategy();

    expect(Object.isFrozen(instance.cfg)).toBe(true);
    expect(Object.isFrozen(instance.cfg.invalidationConditions)).toBe(true);
    expect(() => {
      instance.cfg.invalidationConditions.push('late_mutation');
    }).toThrow(TypeError);
    expect(() => {
      instance.cfg = { ...instance.cfg, rsiEntry: 10 };
    }).toThrow(TypeError);
  });

  test('StrategyOrchestrator can register RSI2MeanReversion in solo mode when enabled', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'false',
      MIN_STRATEGY_CONFIDENCE: '0.35',
    };
    let ConfigLoader;

    try {
      ConfigLoader = require('../foundation/ConfigLoader');
      ConfigLoader.setOverrides({
        strategies: { soloFilter: ['RSI2MeanReversion'] },
        pipeline: { enableRSI2MeanReversion: true },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['RSI2MeanReversion']);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo RSI2MeanReversion is requested without enable flag', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
    };
    let ConfigLoader;

    try {
      ConfigLoader = require('../foundation/ConfigLoader');
      ConfigLoader.setOverrides({
        strategies: { soloFilter: ['RSI2MeanReversion'] },
        pipeline: { enableRSI2MeanReversion: false },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/RSI2MeanReversion was requested but its pipeline toggle is disabled/);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });
});
