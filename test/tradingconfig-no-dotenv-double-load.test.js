'use strict';

describe('ConfigLoader dotenv ownership', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('dotenv');
  });

  test('does not load dotenv at module import time', () => {
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    const dotenv = require('dotenv');

    require('../foundation/ConfigLoader');

    expect(dotenv.config).not.toHaveBeenCalled();
  });
});
