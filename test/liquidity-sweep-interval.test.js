'use strict';

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
});
