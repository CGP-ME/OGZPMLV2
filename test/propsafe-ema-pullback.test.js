'use strict';

const PropSafeEMAPullback = require('../modules/PropSafeEMAPullback');

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

  test('does not re-emit on later green candles that no longer touch the pullback EMA', () => {
    const base = buildTrendCandles();
    const instance = strategy({ crossLookbackBars: 2 });

    expect(instance.evaluate({
      priceHistory: base,
      indicators: { atr: 0.8 },
    })).toMatchObject({
      strategy: 'PropSafeEMAPullback',
      direction: 'buy',
    });

    const laterCandles = [
      ...base,
      candle(108.00, 108.80, 107.95, 108.50, 46),
      candle(108.50, 109.05, 108.40, 108.85, 47),
      candle(108.85, 109.40, 108.80, 109.20, 48),
    ];

    for (let length = base.length + 1; length <= laterCandles.length; length += 1) {
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
      SOLO_STRATEGY: 'PropSafeEMAPullback',
      ENABLE_PROPSAFE_EMA: 'true',
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'false',
      MIN_STRATEGY_CONFIDENCE: '0.35',
    };

    try {
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['PropSafeEMAPullback']);
    } finally {
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo PropSafeEMAPullback is requested without enable flag', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      SOLO_STRATEGY: 'PropSafeEMAPullback',
      ENABLE_PROPSAFE_EMA: 'false',
      ENABLE_TRAI: 'false',
    };

    try {
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/PropSafeEMAPullback was requested but its pipeline toggle is disabled/);
    } finally {
      process.env = originalEnv;
    }
  });
});
