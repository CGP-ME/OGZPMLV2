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
