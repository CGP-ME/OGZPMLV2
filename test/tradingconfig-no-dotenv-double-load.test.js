'use strict';

describe('TradingConfig dotenv ownership', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('dotenv');
  });

  test('does not load dotenv at module import time', () => {
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    const dotenv = require('dotenv');

    require('../core/TradingConfig');

    expect(dotenv.config).not.toHaveBeenCalled();
  });
});
