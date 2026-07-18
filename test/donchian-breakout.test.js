'use strict';

const DonchianBreakout = require('../modules/DonchianBreakout');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');

function candle(o, h, l, close, index) {
  return { o, h, l, c: close, v: 1000, t: index };
}

function rangeCandles(count, high = 105, low = 95, close = 100) {
  return Array.from({ length: count }, (_, index) => (
    candle(close - 1, high - (index % 3), low + (index % 2), close, index)
  ));
}

function donchianConfig(overrides = {}) {
  return {
    entryPeriod: 20,
    atrPeriod: 20,
    atrStopMult: 2.5,
    stopType: 'structural',
    trailType: 'channel',
    trailChannelBars: 10,
    tpMode: 'off',
    maxHoldMode: 'off',
    partialExit: {
      enabled: false,
      triggerR: 1,
      fraction: 0.5,
      remainderTrail: 'terrain',
    },
    invalidationConditions: ['donchian_channel_reentry'],
    ...overrides,
  };
}

describe('DonchianBreakout', () => {
  test('IndicatorCalculator calculates Donchian channel over the requested window', () => {
    const candles = [
      candle(10, 12, 9, 11, 1),
      candle(11, 13, 10, 12, 2),
      candle(12, 15, 8, 14, 3),
      candle(14, 16, 11, 15, 4),
    ];

    expect(IndicatorCalculator.calculateHighestHigh(candles, 3)).toBe(16);
    expect(IndicatorCalculator.calculateLowestLow(candles, 3)).toBe(8);
    expect(IndicatorCalculator.calculateDonchian(candles, 3)).toEqual({
      upper: 16,
      lower: 8,
      mid: 12,
    });
  });

  test('generates a long breakout only when close exceeds the prior channel high', () => {
    const strategy = new DonchianBreakout(donchianConfig());
    const candles = [
      ...rangeCandles(22, 105, 95, 100),
      candle(100, 109, 99, 108, 23),
    ];

    const signal = strategy.evaluate({ priceHistory: candles, indicators: { atr: 2 } });

    expect(signal).toMatchObject({
      strategy: 'DonchianBreakout',
      direction: 'buy',
    });
    expect(signal.confidence).toBeGreaterThan(0.55);
    expect(signal.exitContractHint.stopLossPercent).toBeCloseTo(-4.6296296296);
    expect(signal.exitContractHint.tpMode).toBe('off');
    expect(signal.exitContractHint.takeProfitPercent).toBeNull();
    expect(signal.exitContractHint.trailType).toBe('channel');
    expect(signal.exitContractHint.donchianChannelUpper).toBe(105);
  });

  test('fails loudly when ATR stop multiplier would create a zero or inverted stop', () => {
    expect(() => new DonchianBreakout(donchianConfig({ atrStopMult: 0 }))).toThrow(/atrStopMult must be positive/);

    expect(() => new DonchianBreakout(donchianConfig({ atrStopMult: -2.5 }))).toThrow(/atrStopMult must be positive/);
  });

  test('does not include the current candle in the breakout channel', () => {
    const strategy = new DonchianBreakout(donchianConfig());
    const candles = [
      ...rangeCandles(22, 105, 95, 100),
      candle(100, 110, 99, 106, 23),
    ];

    const signal = strategy.evaluate({ priceHistory: candles, indicators: { atr: 2 } });

    expect(signal).not.toBeNull();
    expect(signal.reason).toContain('prior 20-bar high 105.00');
  });

  test('returns null instead of emitting a false trade when ATR is zero', () => {
    const strategy = new DonchianBreakout(donchianConfig());
    const candles = [
      ...rangeCandles(22, 105, 95, 100),
      candle(100, 109, 99, 108, 23),
    ];

    expect(strategy.evaluate({ priceHistory: candles, indicators: { atr: 0 } })).toBeNull();
  });

  test('returns null instead of emitting a false trade when ATR is missing and cannot warm up', () => {
    const strategy = new DonchianBreakout(donchianConfig());

    expect(strategy.evaluate({ priceHistory: rangeCandles(21), indicators: {} })).toBeNull();
  });

  test('StrategyOrchestrator can register DonchianBreakout in solo mode when enabled', () => {
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
        strategies: { soloFilter: ['DonchianBreakout'] },
        pipeline: { enableDonchianBreakout: true },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(strategy => strategy.name)).toEqual(['DonchianBreakout']);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo Donchian is requested without its enable flag', () => {
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
        strategies: { soloFilter: ['DonchianBreakout'] },
        pipeline: { enableDonchianBreakout: false },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/DonchianBreakout was requested but its pipeline toggle is disabled/);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });
});
