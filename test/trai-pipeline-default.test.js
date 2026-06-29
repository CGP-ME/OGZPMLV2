'use strict';

describe('TRAI pipeline default', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('enables TRAI by default unless env explicitly disables it', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.ENABLE_TRAI;

    try {
      const TradingConfig = require('../core/TradingConfig');
      expect(TradingConfig.get('pipeline.enableTRAI')).toBe(true);
    } finally {
      process.env = originalEnv;
    }
  });

  test('honors explicit ENABLE_TRAI=false override', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
    };

    try {
      const TradingConfig = require('../core/TradingConfig');
      expect(TradingConfig.get('pipeline.enableTRAI')).toBe(false);
    } finally {
      process.env = originalEnv;
    }
  });
});
