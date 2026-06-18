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
    const detector = new LiquiditySweepDetector({ disableSessionCheck: true });

    detector.feedCandle(candle(1_000_000));
    detector.feedCandle(candle(1_005_000));

    expect(detector._candleIntervalMin).toBeNull();
    expect(detector._entryWindowBars).toBeNull();
    expect(detector._openingRangeBars).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring sub-minute candle interval'));
  });

  test('detects a real one-minute candle boundary with finite windows', () => {
    const detector = new LiquiditySweepDetector({ disableSessionCheck: true });

    detector.feedCandle(candle(1_000_000));
    detector.feedCandle(candle(1_060_000));

    expect(detector._candleIntervalMin).toBe(1);
    expect(Number.isFinite(detector._entryWindowBars)).toBe(true);
    expect(Number.isFinite(detector._openingRangeBars)).toBe(true);
  });

  test('rejects explicit non-positive ATR multipliers instead of passing every opening candle', () => {
    expect(() => new LiquiditySweepDetector({ atrMultiplier: 0 }))
      .toThrow(/atrMultiplier must be a finite positive number/);
    expect(() => new LiquiditySweepDetector({ atrMultiplier: -0.5 }))
      .toThrow(/atrMultiplier must be a finite positive number/);
  });

  test('keeps ATR multiplier immutable after construction', () => {
    const detector = new LiquiditySweepDetector({
      disableSessionCheck: true,
      atrMultiplier: 0.5,
    });

    expect(() => {
      detector.config.atrMultiplier = -0.5;
    }).toThrow(TypeError);
    expect(detector.config.atrMultiplier).toBe(0.5);

    seedDailyATR(detector, 10);
    const signal = detector.feedCandle({
      t: 1_000_000,
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
    const detector = new LiquiditySweepDetector({
      disableSessionCheck: true,
      atrMultiplier: 0.5,
    });
    seedDailyATR(detector, 10);

    expect(() => {
      detector.state.dailyATR = 0.1;
    }).toThrow(/state\.dailyATR is read-only/);
    expect(detector.state.dailyATR).toBe(10);

    const signal = detector.feedCandle({
      t: 1_000_000,
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

  test('StrategyOrchestrator wires TradingConfig LiquiditySweep tunables into the detector', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'core', 'StrategyOrchestrator.js'),
      'utf8'
    );

    expect(source).toContain("TradingConfig.get('strategies.LiquiditySweep')");
    expect(source).toMatch(/new LiquiditySweepDetector\(\{\s*\.\.\.\(TradingConfig\.get\('strategies\.LiquiditySweep'\) \|\| \{\}\),\s*disableSessionCheck: true,\s*\}\)/s);
  });

  test('stops the session when the opening candle is below the ATR manipulation threshold', () => {
    const detector = new LiquiditySweepDetector({
      disableSessionCheck: true,
      atrMultiplier: 0.5,
    });
    seedDailyATR(detector, 10);

    const signal = detector.feedCandle({
      t: 1_000_000,
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
    const detector = new LiquiditySweepDetector({
      disableSessionCheck: true,
      atrMultiplier: 0.5,
    });
    seedDailyATR(detector, 10);

    const signal = detector.feedCandle({
      t: 1_000_000,
      o: 100,
      h: 106,
      l: 99,
      c: 101,
      v: 1000,
    });

    expect(signal.hasSignal).toBe(false);
    expect(signal.phase).toBe('watching_for_exit');
    expect(signal.box.isManipCandle).toBe(true);
    expect(detector.stats.totalSessionsAnalyzed).toBe(1);
    expect(detector.stats.manipCandlesDetected).toBe(1);
  });
});
