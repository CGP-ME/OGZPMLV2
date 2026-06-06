'use strict';

const TradingConfig = require('../core/TradingConfig');

describe('TradingConfig runtime profile contract', () => {
  test('known runtime profiles resolve explicitly', () => {
    expect(TradingConfig.getProfile('balanced')).toEqual(
      expect.objectContaining({
        minConfidence: expect.any(Number),
        maxPositionSize: expect.any(Number),
        riskPercent: expect.any(Number),
      })
    );
  });

  test('unknown runtime profiles fail loudly instead of falling back to balanced', () => {
    expect(() => TradingConfig.getProfile('missing-profile'))
      .toThrow(/Unknown trading profile 'missing-profile'/);
    expect(() => TradingConfig.getProfile())
      .toThrow(/Unknown trading profile 'undefined'/);
  });
});
