'use strict';

const FeeModel = require('../core/FeeModel');
const { AdaptiveTimeframeSelector } = require('../core/AdaptiveTimeframeSelector');

function mtfAdapter() {
  return {
    getTimeframeIndicators: () => ({
      atr: 2,
      price: 100,
      trend: 'bullish',
      trendStrength: 0.8,
      rsi: 72,
    }),
  };
}

describe('AdaptiveTimeframeSelector fee model', () => {
  test('scores fee viability from the configured fee model', () => {
    const selector = new AdaptiveTimeframeSelector({
      mtfAdapter: mtfAdapter(),
      feeModel: new FeeModel({
        model: 'per_share_minimum',
        perShare: 0.005,
        minOrderFee: 0.75,
      }),
      feeContext: {
        entryNotionalUsd: 100,
        exitNotionalUsd: 100,
        entryQuantity: 1,
        exitQuantity: 1,
      },
      allowedTimeframes: ['15m'],
      defaultTimeframe: '15m',
    });

    const result = selector.evaluate();

    expect(result.details['15m'].reason).toContain('net 0.50%');
  });

  test('fails loudly when per-share fee viability lacks trade quantity context', () => {
    const selector = new AdaptiveTimeframeSelector({
      mtfAdapter: mtfAdapter(),
      feeModel: new FeeModel({
        model: 'per_share_minimum',
        perShare: 0.005,
        minOrderFee: 0.75,
      }),
      allowedTimeframes: ['15m'],
      defaultTimeframe: '15m',
    });

    expect(() => selector.evaluate()).toThrow(/requires feeContext/);
  });
});
