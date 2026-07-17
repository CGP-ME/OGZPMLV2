'use strict';

const FairValueGapDetector = require('../modules/FairValueGapDetector');
const LiquiditySweepDetector = require('../modules/LiquiditySweepDetector');
const NoWickImbalance = require('../modules/NoWickImbalance');
const SmartMoneySweep = require('../modules/SmartMoneySweep');
const { calculateDynamicLevels } = require('../src/indicators/ogzTwoPoleOscillator');

describe('exit geometry producer contracts', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('LiquiditySweep next-candle-open patterns do not emit market-entry override levels', () => {
    const detector = new LiquiditySweepDetector({ disableSessionCheck: true });
    detector.state.box = {
      high: 110,
      low: 90,
      range: 20,
      atrPct: '200.0',
      validations: { sweepsHighs: false, sweepsLows: true, closesInsideRange: true },
    };
    detector.state.exitSide = 'below';
    detector.state.barsAfterOpen = 2;

    detector._generateSignal(
      { type: 'hammer', direction: 'bullish', wickExtreme: 89 },
      { o: 95, h: 100, l: 89, c: 98, v: 1000, t: 1 }
    );

    const signal = detector.getSignal();
    expect(signal.hasSignal).toBe(true);
    expect(signal.entryType).toBe('next_candle_open');
    expect(signal.stopLoss).toBeGreaterThan(0);
    expect(signal.takeProfit).toBeGreaterThan(0);
    expect(signal.overrideLevels).toBeNull();
  });

  test('LiquiditySweep known-entry patterns stop at producer on invalid exit geometry', () => {
    const detector = new LiquiditySweepDetector({ disableSessionCheck: true });
    detector.state.box = {
      high: 105,
      low: 90,
      range: 15,
      atrPct: '150.0',
      validations: { sweepsHighs: false, sweepsLows: true, closesInsideRange: true },
    };
    detector.state.exitSide = 'below';
    detector.state.barsAfterOpen = 2;

    detector._generateSignal(
      { type: 'bullish_engulfing', direction: 'bullish', entryLevel: 100, stopLevel: 101 },
      { o: 99, h: 103, l: 98, c: 102, v: 1000, t: 1 }
    );

    expect(detector.getSignal()).toEqual(expect.objectContaining({
      hasSignal: false,
      direction: 'neutral',
      phase: 'done',
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid exit geometry'));
  });

  test('SmartMoneySweep refuses invalid current price before emitting override levels', () => {
    const sms = new SmartMoneySweep({});
    const candles = [
      { o: 100, h: 101, l: 99, c: 100, v: 1000, t: 1 },
      { o: 101, h: 102, l: 100, c: 101, v: 1000, t: 2 },
      { o: 102, h: 103, l: 101, c: 102, v: 1000, t: 3 },
      { o: 103, h: 104, l: 102, c: 103, v: 1000, t: 4 },
    ];

    expect(sms._computeExitLevels(
      'buy',
      Number.NaN,
      candles,
      1.5,
      { poc: 101, vah: 102, val: 99 },
      2
    )).toBeNull();
  });

  test('NoWickImbalance removes tapped levels when structural stop becomes non-positive', () => {
    const strategy = new NoWickImbalance({
      swingLookback: 5,
      entryMode: 'tap',
      stopLookbackBars: 5,
      stopBufferAtr: 1,
    });
    jest.spyOn(strategy, '_detectNoWick').mockReturnValue(null);
    jest.spyOn(strategy, '_detectTrend').mockReturnValue('uptrend');
    strategy.scopedState.set('TSLA:15M', {
      candleCount: 5,
      pendingLevels: [{
        type: 'bullish',
        level: 10,
        formationCount: 4,
        trend: 'uptrend',
        timestamp: 1,
      }],
      invalidatedLevels: [],
    });

    const candles = [
      { o: 9, h: 11, l: 8, c: 10, v: 1000, t: 1, symbol: 'TSLA', timeframe: '15m' },
      { o: 10, h: 12, l: 9, c: 11, v: 1000, t: 2, symbol: 'TSLA', timeframe: '15m' },
      { o: 11, h: 13, l: 10, c: 12, v: 1000, t: 3, symbol: 'TSLA', timeframe: '15m' },
      { o: 12, h: 14, l: 11, c: 13, v: 1000, t: 4, symbol: 'TSLA', timeframe: '15m' },
      { o: 10, h: 22, l: 10, c: 20, v: 1000, t: 5, symbol: 'TSLA', timeframe: '15m' },
    ];

    expect(strategy.evaluate({
      priceHistory: candles,
      indicators: { atr: 100 },
      extras: { symbol: 'TSLA', timeframe: '15m' },
    })).toBeNull();
    expect(strategy._getScopeState('TSLA:15M').pendingLevels).toHaveLength(0);
  });

  test('FairValueGapDetector refuses FVG levels with stop on the wrong side', () => {
    const detector = new FairValueGapDetector();

    expect(detector.calculateLevels({
      direction: 'bullish',
      gapHigh: 100,
      gapLow: 99,
      midpoint: 99.5,
      firstCandleLow: 101,
      firstCandleHigh: 102,
    }, 'top', 0.05, 2)).toBeNull();
  });

  test('OGZTPO dynamic levels require finite entry, volatility, direction, and multiplier', () => {
    expect(calculateDynamicLevels(100, 1, 'LONG', 1.5)).toEqual(expect.objectContaining({
      stopLoss: 98.5,
      takeProfit: 102.25,
    }));
    expect(calculateDynamicLevels(100, 0, 'LONG', 1.5)).toBeNull();
    expect(calculateDynamicLevels(100, 1, 'SIDEWAYS', 1.5)).toBeNull();
    expect(calculateDynamicLevels(100, 1, 'SHORT', 0)).toBeNull();
  });
});
