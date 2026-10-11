'use strict';

const { AdaptiveTimeframeSelector } = require('../core/AdaptiveTimeframeSelector');

function mtfAdapter(atr) {
  return {
    getTimeframeIndicators: () => ({
      atr,
      price: 100,
      trend: 'bullish',
      trendStrength: 0.8,
      rsi: 72,
    }),
  };
}

describe('AdaptiveTimeframeSelector opportunity discovery', () => {
  test('scores every allowed ready frame before trade sizing', () => {
    const selector = new AdaptiveTimeframeSelector({
      mtfAdapter: mtfAdapter(2),
      allowedTimeframes: ['5m', '15m', '1h'],
      defaultTimeframe: '15m',
    });

    const result = selector.evaluate();

    expect(Object.keys(result.scores)).toEqual(['5m', '15m', '1h']);
  });

  test('does not eliminate a ready frame using fees for an unsized trade', () => {
    const selector = new AdaptiveTimeframeSelector({
      mtfAdapter: mtfAdapter(0.001),
      allowedTimeframes: ['15m'],
      defaultTimeframe: '15m',
    });

    expect(selector.evaluate().scores['15m']).toBeGreaterThan(0);
  });
});
