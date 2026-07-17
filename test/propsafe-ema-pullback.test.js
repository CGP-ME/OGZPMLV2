'use strict';

const PropSafeEMAPullback = require('../modules/PropSafeEMAPullback');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');

function candle(o, h, l, close, minutesFromOpen) {
  const ts = Date.UTC(2026, 5, 15, 13, 30 + minutesFromOpen);
  return { o, h, l, c: close, v: 100000, t: ts };
}

function buildTrendCandles() {
  const candles = [];
  let index = 0;
  for (; index < 30; index += 1) {
    const close = 100 + index * 0.03;
    candles.push(candle(close - 0.02, close + 0.30, close - 0.30, close, index));
  }

  for (let pullback = 0; pullback < 8; pullback += 1, index += 1) {
    const close = 100.80 - pullback * 0.18;
    candles.push(candle(close + 0.06, close + 0.25, close - 0.55, close, index));
  }

  for (let recovery = 0; recovery < 8; recovery += 1, index += 1) {
    const close = 99.60 + recovery * 0.35;
    candles.push(candle(close - 0.12, close + 0.45, close - 0.35, close, index));
  }
  return candles;
}

function strategy(overrides = {}) {
  return new PropSafeEMAPullback({
    fastEmaPeriod: 3,
    pullbackEmaPeriod: 5,
    trendEmaPeriod: 12,
    atrPeriod: 5,
    crossLookbackBars: 8,
    pullbackLookbackBars: 8,
    pullbackMinAtr: 0,
    pullbackMaxAtr: 2.0,
    atrStopMult: 1.1,
    targetRR: 3,
    trailActivationR: 1.5,
    trailDistanceR: 1,
    maxHoldTimeMinutes: 240,
    confidenceBase: 0.62,
    confidenceTrendBonus: 0.06,
    confidencePullbackBonus: 0.08,
    confidenceConfirmationBonus: 0.08,
    confidenceFreshCrossBonus: 0.06,
    maxConfidence: 0.90,
    requireRth: true,
    rthStartET: '09:30',
    rthEndET: '16:00',
    sessionTimeZone: 'America/New_York',
    allowShorts: false,
    ...overrides,
  });
}

describe('PropSafeEMAPullback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('emits long signal only after EMA trend, pullback, and bullish confirmation align', () => {
    const signal = strategy().evaluate({
      priceHistory: buildTrendCandles(),
      indicators: { atr: 0.8 },
    });

    expect(signal).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'buy',
    });
    expect(signal.confidence).toBeGreaterThanOrEqual(0.68);
    expect(signal.confidence).toBeLessThanOrEqual(0.90);
    expect(signal.exitContractHint.stopLossPercent).toBeLessThan(0);
    expect(signal.exitContractHint.takeProfitPercent).toBeGreaterThan(Math.abs(signal.exitContractHint.stopLossPercent));
    expect(signal.signalData).toMatchObject({
      atrStopMult: 1.1,
      targetRR: 3,
    });
  });

  test('does not require a fresh EMA crossover when pullback confirmation is valid', () => {
    const signal = strategy({ crossLookbackBars: 2 }).evaluate({
      priceHistory: buildTrendCandles(),
      indicators: { atr: 0.8 },
    });

    expect(signal).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'buy',
      signalData: {
        crossBarsAgo: null,
      },
    });
  });

  test('does not re-emit once the prior pullback leaves the configured lookback window', () => {
    const base = buildTrendCandles();
    const instance = strategy({ crossLookbackBars: 2, pullbackMaxAtr: 0.05 });

    expect(instance.evaluate({
      priceHistory: base,
      indicators: { atr: 0.8 },
    })).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'buy',
    });

    const laterCandles = [...base];
    for (let offset = 0; offset < instance.cfg.pullbackLookbackBars + 3; offset += 1) {
      const close = 160.00 + offset * 3;
      laterCandles.push(candle(close - 0.10, close + 0.55, close - 0.05, close + 0.35, 46 + offset));
    }

    for (let length = base.length + instance.cfg.pullbackLookbackBars + 1; length <= laterCandles.length; length += 1) {
      expect(instance.evaluate({
        priceHistory: laterCandles.slice(0, length),
        indicators: { atr: 0.8 },
      })).toBeNull();
    }
  });

  test('blocks non-RTH candles when RTH is required', () => {
    const candles = buildTrendCandles().map((item, index) => ({
      ...item,
      t: Date.UTC(2026, 5, 15, 8, 0 + index),
    }));

    expect(strategy().evaluate({ priceHistory: candles, indicators: { atr: 0.8 } })).toBeNull();
  });

  test('returns null when pullback distance is outside the configured ATR band', () => {
    expect(strategy({ pullbackMinAtr: 5, pullbackMaxAtr: 6 }).evaluate({
      priceHistory: buildTrendCandles(),
      indicators: { atr: 0.8 },
    })).toBeNull();
  });

  test('finds a valid pullback inside the configured lookback window even when the latest candle is outside the band', () => {
    const candles = Array.from({ length: 20 }, (_, index) => {
      if (index === 17) {
        return candle(100.30, 100.45, 99.95, 100.20, index);
      }
      if (index === 19) {
        return candle(120.10, 120.40, 119.90, 120.30, index);
      }
      const close = 118 + index * 0.04;
      return candle(close - 0.05, close + 0.20, close - 0.20, close, index);
    });
    const instance = strategy({
      crossLookbackBars: 4,
      pullbackLookbackBars: 4,
      pullbackMaxAtr: 0.25,
    });

    jest.spyOn(IndicatorCalculator, 'calculateEMA').mockImplementation((input, period) => {
      if (period === instance.cfg.fastEmaPeriod) return 110;
      if (period === instance.cfg.pullbackEmaPeriod) return input.length === candles.length ? 100 : 99;
      if (period === instance.cfg.trendEmaPeriod) return input.length === candles.length ? 90 : 89;
      return NaN;
    });

    const signal = instance.evaluate({
      priceHistory: candles,
      indicators: { atr: 1 },
    });

    expect(signal).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'buy',
      signalData: {
        pullbackDistanceAtr: 0,
      },
    });
  });

  test('finds a valid short pullback inside the configured lookback window when shorts are enabled', () => {
    const candles = Array.from({ length: 20 }, (_, index) => {
      if (index === 17) {
        return candle(100.30, 100.45, 99.95, 100.20, index);
      }
      if (index === 19) {
        return candle(80.30, 80.40, 79.90, 80.10, index);
      }
      const close = 82 - index * 0.04;
      return candle(close + 0.05, close + 0.20, close - 0.20, close, index);
    });
    const instance = strategy({
      allowShorts: true,
      crossLookbackBars: 4,
      pullbackLookbackBars: 4,
      pullbackMaxAtr: 0.25,
    });

    jest.spyOn(IndicatorCalculator, 'calculateEMA').mockImplementation((input, period) => {
      if (period === instance.cfg.fastEmaPeriod) return 90;
      if (period === instance.cfg.pullbackEmaPeriod) return input.length === candles.length ? 100 : 101;
      if (period === instance.cfg.trendEmaPeriod) return input.length === candles.length ? 110 : 111;
      return NaN;
    });

    const signal = instance.evaluate({
      priceHistory: candles,
      indicators: { atr: 1 },
    });

    expect(signal).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'sell',
      signalData: {
        pullbackDistanceAtr: 0,
      },
    });
  });

  test('fails loudly on invalid EMA ordering', () => {
    expect(() => strategy({ fastEmaPeriod: 21, pullbackEmaPeriod: 9 }))
      .toThrow(/EMA periods must satisfy fast < pullback < trend/);
  });

  test('fails loudly on invalid session timezone before runtime evaluation', () => {
    expect(() => strategy({ sessionTimeZone: 'Bad/Zone' }))
      .toThrow(/sessionTimeZone must be a valid IANA timezone/);
  });

  test('seals validated config against post-construction mutation', () => {
    const instance = strategy();

    expect(Object.isFrozen(instance.cfg)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(instance, 'cfg')).toMatchObject({
      writable: false,
      configurable: false,
      enumerable: true,
    });
    expect(() => {
      instance.cfg.sessionTimeZone = 'Bad/Zone';
    }).toThrow(TypeError);
    expect(() => {
      instance.cfg = { ...instance.cfg, sessionTimeZone: 'Bad/Zone' };
    }).toThrow(TypeError);
    expect(instance.cfg.sessionTimeZone).toBe('America/New_York');
  });

  test('StrategyOrchestrator can register PropSafeEMAPullback in solo mode when enabled', () => {
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
        strategies: { soloFilter: ['PropSafeEMAPullback'] },
        pipeline: { enablePropSafeEMAPullback: true },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['PropSafeEMAPullback']);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo PropSafeEMAPullback is requested without enable flag', () => {
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
        strategies: { soloFilter: ['PropSafeEMAPullback'] },
        pipeline: { enablePropSafeEMAPullback: false },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/PropSafeEMAPullback was requested but its pipeline toggle is disabled/);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });
});
