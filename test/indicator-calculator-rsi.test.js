'use strict';

const { IndicatorCalculator } = require('../core/IndicatorCalculator');

function candlesFromCloses(closes) {
  return closes.map((close, index) => ({
    o: close,
    h: close,
    l: close,
    c: close,
    t: index,
  }));
}

describe('IndicatorCalculator shared Wilder RSI', () => {
  test('calculateRSI uses Wilder smoothing instead of trailing simple-average RSI', () => {
    const closes = [
      44, 44.15, 43.9, 44.35, 44.1, 44.8, 44.55, 45.05, 44.7, 45.4,
      45.1, 45.8, 45.45, 46.1, 45.75, 46.4, 46.05, 46.9, 46.5, 47.2,
      46.85, 47.6, 47.25, 48.1, 47.7, 48.45, 48.05, 48.8, 48.35, 49.1,
    ];

    const rsi = IndicatorCalculator.calculateRSI(candlesFromCloses(closes), 14);

    expect(rsi).toBeCloseTo(67.93891980520883, 10);
    expect(rsi).not.toBeCloseTo(66.66666666666666, 10);
    expect(IndicatorCalculator.calculateWilderRSIFromCloses(closes, 14))
      .toBeCloseTo(rsi, 10);
  });
});

describe('IndicatorCalculator shared Wilder ATR', () => {
  test('calculateWilderATR uses seeded Wilder smoothing instead of trailing simple-average ATR', () => {
    const candles = [
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 104, l: 99, c: 103 },
      { o: 103, h: 106, l: 102, c: 105 },
      { o: 105, h: 107, l: 101, c: 102 },
      { o: 102, h: 105, l: 100, c: 104 },
      { o: 104, h: 110, l: 103, c: 109 },
      { o: 109, h: 111, l: 108, c: 110 },
      { o: 110, h: 115, l: 109, c: 114 },
    ];

    const wilderAtr = IndicatorCalculator.calculateWilderATR(candles, 3);

    expect(wilderAtr).toBeCloseTo(5.185185185185185, 12);
    expect(wilderAtr).not.toBeCloseTo(5.333333333333333, 12);
  });
});
