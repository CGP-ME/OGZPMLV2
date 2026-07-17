'use strict';

const fs = require('fs');
const path = require('path');
const LiquiditySweepDetector = require('../modules/LiquiditySweepDetector');

function candle(t, close = 100) {
  return {
    t,
    o: close,
    h: close + 1,
    l: close - 1,
    c: close,
    v: 1000,
  };
}

function liquidityConfig(overrides = {}) {
  return {
    atrMultiplier: 0.25,
    atrPeriod: 14,
    entryWindowMinutes: 90,
    openingRangeMinutes: 15,
    hammerBodyMaxPct: 0.35,
    hammerWickMinRatio: 2,
    engulfMinRatio: 1,
    stopBufferPct: 0.05,
    sweepMinExtensionPct: 0.1,
    sweepExtensionBandMult: 5,
    sweepLookbackBars: 50,
    weights: {
      manipCandle: 0.2,
      wickSweep: 0.15,
      sweepReject: 0.15,
      hammerPattern: 0.25,
      engulfPattern: 0.25,
    },
    ...overrides,
  };
}

function seedDailyATR(detector, dailyATR = 10) {
  detector.state.dailyCandles = Array.from(
    { length: detector.config.atrPeriod + 1 },
    () => ({ high: 100 + dailyATR / 2, low: 100 - dailyATR / 2, close: 100 })
  );
  detector._computeDailyATR();
  expect(detector.state.dailyATR).toBe(dailyATR);
}

describe('LiquiditySweep interval detection', () => {
  let warnSpy;
  let logSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('ignores sub-minute update noise instead of creating Infinity windows', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig());

    detector.feedCandle(candle(1_000_000));
    detector.feedCandle(candle(1_005_000));

    expect(detector._candleIntervalMin).toBeNull();
    expect(detector._entryWindowBars).toBeNull();
    expect(detector._openingRangeBars).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring sub-minute candle interval'));
  });

  test('detects a real one-minute candle boundary with finite windows', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig());

    detector.feedCandle(candle(1_000_000));
    detector.feedCandle(candle(1_060_000));

    expect(detector._candleIntervalMin).toBe(1);
    expect(Number.isFinite(detector._entryWindowBars)).toBe(true);
    expect(Number.isFinite(detector._openingRangeBars)).toBe(true);
  });

  test('rejects explicit non-positive ATR multipliers instead of passing every opening candle', () => {
    expect(() => new LiquiditySweepDetector(liquidityConfig({ atrMultiplier: 0 })))
      .toThrow(/atrMultiplier must be a finite positive number/);
    expect(() => new LiquiditySweepDetector(liquidityConfig({ atrMultiplier: -0.5 })))
      .toThrow(/atrMultiplier must be a finite positive number/);
  });

  test('keeps ATR multiplier immutable after construction', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({
      atrMultiplier: 0.5,
      openingRangeMinutes: 1,
    }));

    expect(() => {
      detector.config.atrMultiplier = -0.5;
    }).toThrow(TypeError);
    expect(detector.config.atrMultiplier).toBe(0.5);

    seedDailyATR(detector, 10);
    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 101,
      l: 100,
      c: 100.5,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('done');
    expect(detector.stats.manipCandlesDetected).toBe(0);
  });

  test('rejects direct dailyATR state mutation instead of weakening the manipulation gate', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({
      atrMultiplier: 0.5,
      openingRangeMinutes: 1,
    }));
    seedDailyATR(detector, 10);

    expect(() => {
      detector.state.dailyATR = 0.1;
    }).toThrow(/state\.dailyATR is read-only/);
    expect(detector.state.dailyATR).toBe(10);

    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('done');
    expect(detector.state.box.atrThreshold).toBe(5);
    expect(detector.stats.manipCandlesDetected).toBe(0);
  });

  test('StrategyOrchestrator wires ConfigLoader LiquiditySweep tunables into the detector', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'core', 'StrategyOrchestrator.js'),
      'utf8'
    );

    expect(source).toContain("ConfigLoader.get('strategies.LiquiditySweep')");
    expect(source).toMatch(/new LiquiditySweepDetector\(\s*ConfigLoader\.get\('strategies\.LiquiditySweep'\)\s*\)/s);
  });

  test('active LiquiditySweep constructors do not retain stale session bypass or partial defaults', () => {
    const activeFiles = [
      'run-empire-v2.js',
      path.join('core', 'StrategyOrchestrator.js'),
      path.join('tools', 'trade-validator.js'),
      path.join('scripts', 'smoke-test.js'),
      path.join('tuning', 'pipeline-diagnostic.js'),
    ];

    for (const relativePath of activeFiles) {
      const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
      expect(source).not.toMatch(/disableSessionCheck/);
      expect(source).not.toMatch(/LIQSWEEP_/);
      expect(source).not.toMatch(/new LiquiditySweepDetector\(\s*\{/);
      expect(source).not.toMatch(/new LiquiditySweepDetector\(\s*\)/);
    }
  });

  test('stops the session when the opening candle is below the ATR manipulation threshold', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({
      atrMultiplier: 0.5,
      openingRangeMinutes: 1,
    }));
    seedDailyATR(detector, 10);
    detector.state.priorHighs = [105.6];

    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('done');
    expect(signal.box.isManipCandle).toBe(false);
    expect(signal.box.atrThreshold).toBeUndefined();
    expect(detector.state.box.atrThreshold).toBe(5);
    expect(detector.stats.totalSessionsAnalyzed).toBe(1);
    expect(detector.stats.manipCandlesDetected).toBe(0);
  });

  test('continues watching when the opening candle meets the ATR manipulation threshold', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({
      atrMultiplier: 0.5,
      openingRangeMinutes: 1,
    }));
    seedDailyATR(detector, 10);
    detector.state.priorHighs = [105.6];

    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 106,
      l: 99,
      c: 101,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('watching_for_exit');
    expect(signal.box.isManipCandle).toBe(true);
    expect(signal.box.validations.sweepsHighs).toBe(true);
    expect(signal.box.validations.closesInsideRange).toBe(true);
    expect(detector.stats.totalSessionsAnalyzed).toBe(1);
    expect(detector.stats.manipCandlesDetected).toBe(1);
  });

  test('refuses swept opening candles that do not close back inside the swept level', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({ openingRangeMinutes: 1 }));
    seedDailyATR(detector, 10);
    detector.state.priorHighs = [105];

    detector.feedCandle(candle(Date.UTC(2026, 0, 2, 14, 29), 100));
    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 105.5,
      l: 99,
      c: 105.3,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('done');
    expect(signal.box.validations.sweepsHighs).toBe(true);
    expect(signal.box.validations.closesInsideRange).toBe(false);
    expect(detector.state.box.validationScore).toBe(1);
    expect(detector.stats.manipCandlesDetected).toBe(1);
    expect(detector.stats.manipCandlesValidated).toBe(0);
  });

  test('refuses low sweeps that close below the swept level', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({ openingRangeMinutes: 1 }));
    seedDailyATR(detector, 10);
    detector.state.priorLows = [95];

    detector.feedCandle(candle(Date.UTC(2026, 0, 2, 14, 29), 100));
    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 101,
      l: 94.6,
      c: 94.8,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('done');
    expect(signal.box.validations.sweepsLows).toBe(true);
    expect(signal.box.validations.closesInsideRange).toBe(false);
    expect(detector.state.box.validationScore).toBe(1);
    expect(detector.stats.manipCandlesDetected).toBe(1);
    expect(detector.stats.manipCandlesValidated).toBe(0);
  });

  test('continues watching when low sweeps close back above the swept level', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig({ openingRangeMinutes: 1 }));
    seedDailyATR(detector, 10);
    detector.state.priorLows = [95];

    detector.feedCandle(candle(Date.UTC(2026, 0, 2, 14, 29), 100));
    const signal = detector.feedCandle({
      t: Date.UTC(2026, 0, 2, 14, 30),
      o: 100,
      h: 101,
      l: 94.6,
      c: 96,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('watching_for_exit');
    expect(signal.box.validations.sweepsLows).toBe(true);
    expect(signal.box.validations.closesInsideRange).toBe(true);
    expect(detector.state.box.validationScore).toBe(2);
    expect(detector.stats.manipCandlesDetected).toBe(1);
    expect(detector.stats.manipCandlesValidated).toBe(1);
  });

  test('requires explicit confidence weights and sweep extension band config', () => {
    expect(() => new LiquiditySweepDetector({
      ...liquidityConfig(),
      sweepExtensionBandMult: undefined,
    })).toThrow(/sweepExtensionBandMult is required/);

    expect(() => new LiquiditySweepDetector({
      ...liquidityConfig(),
      weights: {
        wickSweep: 0.15,
        sweepReject: 0.15,
        hammerPattern: 0.25,
        engulfPattern: 0.25,
      },
    })).toThrow(/manipCandle is required/);
  });

  test('consumes a generated signal instead of replaying stale structural levels', () => {
    const detector = new LiquiditySweepDetector(liquidityConfig());
    detector.state.signal = {
      hasSignal: true,
      direction: 'buy',
      confidence: 0.7,
      stopLoss: 99,
      takeProfit: 105,
    };
    detector.state.phase = 'signal_active';

    expect(detector.getSignal()).toEqual(expect.objectContaining({
      hasSignal: true,
      direction: 'buy',
      stopLoss: 99,
      takeProfit: 105,
    }));

    detector.consumeSignal();

    expect(detector.getSignal()).toEqual(expect.objectContaining({
      hasSignal: false,
      direction: 'neutral',
      phase: 'done',
    }));
  });
});
