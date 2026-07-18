'use strict';

const TimeSeriesMomentum = require('../modules/TimeSeriesMomentum');

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
  return new TimeSeriesMomentum({
    lookback: 3,
    trendPeriod: 5,
    atrPeriod: 3,
    minReturn: 0.005,
    allowShorts: false,
    stopType: 'atr',
    atrStopMult: 2.0,
    trailType: 'atr',
    trailAtrMult: 1.0,
    tpMode: 'off',
    maxHoldMode: 'off',
    partialExit: {
      enabled: false,
      triggerR: 1,
      fraction: 0.5,
      remainderTrail: 'atr',
    },
    confidenceBase: 0.50,
    confidenceReturnMultiplier: 4.0,
    maxConfidence: 0.85,
    invalidationConditions: ['regime_change'],
    ...overrides,
  });
}

describe('TimeSeriesMomentum', () => {
  test('emits long signal when trailing return and trend filter align', () => {
    const candles = [100, 101, 102, 103, 104, 105, 106].map(candle);

    const signal = strategy().evaluate({ priceHistory: candles, indicators: {} });

    expect(signal).toMatchObject({
      strategy: 'TimeSeriesMomentum',
      direction: 'buy',
    });
    expect(signal.confidence).toBeGreaterThan(0.50);
    expect(signal.confidence).toBeLessThanOrEqual(0.85);
    expect(signal.exitContractHint.maxHoldMode).toBe('off');
    expect(signal.exitContractHint.maxHoldTimeMinutes).toBeNull();
    expect(signal.exitContractHint.tpMode).toBe('off');
    expect(signal.exitContractHint.takeProfitPercent).toBeNull();
    expect(signal.exitContractHint.trailType).toBe('atr');
    expect(signal.signalData.trailingReturn).toBeGreaterThan(0.005);
  });

  test('blocks short signal unless allowShorts is explicit', () => {
    const candles = [106, 105, 104, 103, 102, 101, 100].map(candle);

    expect(strategy().evaluate({ priceHistory: candles, indicators: {} })).toBeNull();

    const signal = strategy({ allowShorts: true }).evaluate({ priceHistory: candles, indicators: {} });
    expect(signal).toMatchObject({
      strategy: 'TimeSeriesMomentum',
      direction: 'sell',
    });
  });

  test('fails loudly on invalid config instead of accepting a fallback', () => {
    expect(() => strategy({ lookback: 0 })).toThrow(/lookback must be a positive integer/);
    expect(() => strategy({ atrStopMult: 0 })).toThrow(/atrStopMult must be positive/);
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
      instance.cfg = { ...instance.cfg, lookback: 10 };
    }).toThrow(TypeError);
  });

  test('StrategyOrchestrator can register TimeSeriesMomentum in solo mode when enabled', () => {
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
        strategies: { soloFilter: ['TimeSeriesMomentum'] },
        pipeline: { enableTimeSeriesMomentum: true },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['TimeSeriesMomentum']);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo TimeSeriesMomentum is requested without enable flag', () => {
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
        strategies: { soloFilter: ['TimeSeriesMomentum'] },
        pipeline: { enableTimeSeriesMomentum: false },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/TimeSeriesMomentum was requested but its pipeline toggle is disabled/);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator keeps wake strategy modules isolated per symbol', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SOLO_STRATEGY: 'TimeSeriesMomentum',
      ENABLE_TSMOM: 'true',
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'false',
    };

    try {
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      const fallback = { symbol: 'fallback' };
      let created = 0;
      const factory = () => ({ created: created += 1 });

      const tslaModule = orchestrator._getSymbolStrategyModule('TimeSeriesMomentum', 'TSLA', fallback, factory);
      const nvdaModule = orchestrator._getSymbolStrategyModule('TimeSeriesMomentum', 'NVDA', fallback, factory);
      const tslaAgain = orchestrator._getSymbolStrategyModule('TimeSeriesMomentum', 'TSLA', fallback, factory);
      const missingSymbol = orchestrator._getSymbolStrategyModule('TimeSeriesMomentum', '', fallback, factory);

      expect(tslaModule).not.toBe(nvdaModule);
      expect(tslaAgain).toBe(tslaModule);
      expect(missingSymbol).toBe(fallback);
      expect(created).toBe(2);
    } finally {
      process.env = originalEnv;
    }
  });
});
