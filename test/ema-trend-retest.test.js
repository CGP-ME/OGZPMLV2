'use strict';

const EMATrendRetest = require('../modules/EMATrendRetest');

function candle(open, high, low, close, minutesFromOpen) {
  const ts = Date.UTC(2026, 5, 15, 13, 30 + minutesFromOpen);
  return { o: open, h: high, l: low, c: close, v: 100000, t: ts };
}

function buildLongRetestCandles({ bearishConfirm = false } = {}) {
  const closes = [100, 101, 102, 103, 104, 105, 106, 105.2, bearishConfirm ? 105.0 : 106.4];
  return closes.map((close, index) => {
    if (index === 7) {
      return candle(106.0, 106.2, 104.4, close, index);
    }
    if (index === 8) {
      return bearishConfirm
        ? candle(106.0, 106.2, 104.9, close, index)
        : candle(105.4, 106.6, 105.2, close, index);
    }
    return candle(close - 0.1, close + 0.25, close - 0.25, close, index);
  });
}

function buildFlatTouchCandles() {
  return Array.from({ length: 9 }, (_, index) => candle(100, 100.25, 99.75, 100, index));
}

function strategy(overrides = {}) {
  return new EMATrendRetest({
    emaPeriods: [3, 5],
    atrPeriod: 3,
    slopeLookbackBars: 2,
    minSlopePct: 0.03,
    retestLookbackBars: 3,
    touchZoneAtr: 0.75,
    closeAwayAtr: 0.05,
    maxExtensionAtr: 2.5,
    confidenceBase: 0.58,
    confidenceSlopeBonus: 0.08,
    confidenceRetestBonus: 0.12,
    confidenceConfirmationBonus: 0.08,
    maxConfidence: 0.88,
    atrStopMult: 1,
    targetRR: 3,
    trailActivationR: 1.5,
    trailDistanceR: 1,
    maxHoldTimeMinutes: 240,
    requireRth: true,
    rthStartET: '09:30',
    rthEndET: '16:00',
    sessionTimeZone: 'America/New_York',
    allowShorts: false,
    ...overrides,
  });
}

describe('EMATrendRetest', () => {
  test('emits long signal after rising EMA retest and bullish confirmation', () => {
    const signal = strategy().evaluate({
      priceHistory: buildLongRetestCandles(),
      indicators: { atr: 1 },
    });

    expect(signal).toMatchObject({
      strategy: 'EMATrendRetest',
      direction: 'buy',
    });
    expect(signal.confidence).toBeGreaterThanOrEqual(0.70);
    expect(signal.confidence).toBeLessThanOrEqual(0.88);
    expect(signal.reason).toMatch(/trend retest buy/);
    expect(signal.signalData.emaPeriod).toBeGreaterThanOrEqual(3);
    expect(signal.signalData.retestBarsAgo).toBeLessThanOrEqual(3);
    expect(signal.exitContractHint.stopLossPercent).toBeLessThan(0);
    expect(signal.exitContractHint.takeProfitPercent)
      .toBeCloseTo(Math.abs(signal.exitContractHint.stopLossPercent) * 3);
  });

  test('blocks flat EMA touches instead of treating touch alone as edge', () => {
    expect(strategy().evaluate({
      priceHistory: buildFlatTouchCandles(),
      indicators: { atr: 1 },
    })).toBeNull();
  });

  test('blocks retests without confirmation candle', () => {
    expect(strategy().evaluate({
      priceHistory: buildLongRetestCandles({ bearishConfirm: true }),
      indicators: { atr: 1 },
    })).toBeNull();
  });

  test('fails loudly on invalid EMA period bank', () => {
    expect(() => strategy({ emaPeriods: [] })).toThrow(/emaPeriods must contain/);
    expect(() => strategy({ emaPeriods: [1, 3] })).toThrow(/integers > 1/);
  });

  test('seals validated config against post-construction mutation', () => {
    const instance = strategy();

    expect(Object.isFrozen(instance.cfg)).toBe(true);
    expect(Object.isFrozen(instance.cfg.emaPeriods)).toBe(true);
    expect(() => {
      instance.cfg.emaPeriods.push(200);
    }).toThrow(TypeError);
    expect(() => {
      instance.cfg = { ...instance.cfg, maxConfidence: 1 };
    }).toThrow(TypeError);
  });

  test('StrategyOrchestrator can register EMATrendRetest in solo mode when enabled', () => {
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
        strategies: { soloFilter: ['EMATrendRetest'] },
        pipeline: { enableEMATrendRetest: true },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['EMATrendRetest']);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when solo EMATrendRetest is requested without enable flag', () => {
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
        strategies: { soloFilter: ['EMATrendRetest'] },
        pipeline: { enableEMATrendRetest: false },
      });
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/EMATrendRetest was requested but its pipeline toggle is disabled/);
    } finally {
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator fails loudly when pipeline toggle is missing instead of silently enabling a missing-toggle lane', () => {
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
        strategies: { soloFilter: ['EMATrendRetest'] },
        pipeline: { enableEMATrendRetest: true },
      });
      const realGet = ConfigLoader.get.bind(ConfigLoader);
      jest.spyOn(ConfigLoader, 'get').mockImplementation((path, defaultValue) => {
        if (path === 'pipeline') {
          const pipeline = { ...realGet(path, defaultValue) };
          delete pipeline.enableEMATrendRetest;
          return pipeline;
        }
        return realGet(path, defaultValue);
      });

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/EMATrendRetest pipeline toggle must be boolean/);
    } finally {
      jest.restoreAllMocks();
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });

  test('StrategyOrchestrator does not instantiate disabled EMATrendRetest during unrelated solo runs', () => {
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
        strategies: { soloFilter: ['RSI'] },
        pipeline: { enableEMATrendRetest: false },
      });
      const realGet = ConfigLoader.get.bind(ConfigLoader);
      jest.spyOn(ConfigLoader, 'get').mockImplementation((path, defaultValue) => {
        if (path === 'strategies.EMATrendRetest') {
          throw new Error('EMATrendRetest config should not be read while disabled');
        }
        return realGet(path, defaultValue);
      });

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

      expect(orchestrator.strategies.map(item => item.name)).toEqual(['RSI']);
    } finally {
      jest.restoreAllMocks();
      if (ConfigLoader) ConfigLoader.clearOverrides();
      process.env = originalEnv;
    }
  });
});
