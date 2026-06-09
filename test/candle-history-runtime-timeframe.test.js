'use strict';

const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('runtime candle history timeframe ownership', () => {
  let restoreEnv;
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      TRADING_PAIR: 'TSLA',
      ALPACA_SYMBOLS: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    restoreEnv();
    jest.resetModules();
  });

  function makeBot(overrides = {}) {
    jest.doMock('../instrument.js', () => ({
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    }));
    jest.doMock('../core/SingletonLock', () => ({
      OGZSingletonLock: jest.fn().mockImplementation(() => ({
        acquireLock: jest.fn(),
        releaseLock: jest.fn(),
      })),
      checkCriticalPorts: jest.fn(),
    }));
    const OGZPrimeV14Bot = require('../run-empire-v2');
    return Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      candleTimeframe: '15m',
      tradingPair: 'TSLA',
      priceHistory: [],
      _candleStore: {
        loadFromDisk: jest.fn(),
        getCandles: jest.fn(() => [{ symbol: 'TSLA', timeframe: '15m', c: 420 }]),
        addCandles: jest.fn(),
        saveToDisk: jest.fn(),
      },
      ...overrides,
    });
  }

  test('loads saved history from the configured runtime timeframe slot', () => {
    const bot = makeBot({
      priceHistory: [{ symbol: 'TSLA', timeframe: '1m', c: 100 }],
    });

    bot.loadCandleHistory();

    expect(bot._candleStore.loadFromDisk).toHaveBeenCalledWith(
      expect.stringContaining('data/candle-history.json'),
      'TSLA',
      '15m'
    );
    expect(bot._candleStore.getCandles).toHaveBeenCalledWith('TSLA', '15m');
    expect(bot.priceHistory).toEqual([{ symbol: 'TSLA', timeframe: '15m', c: 420 }]);
  });

  test('saves priceHistory back to the configured runtime timeframe slot', () => {
    const candles = [{ symbol: 'TSLA', timeframe: '15m', c: 421 }];
    const bot = makeBot({ priceHistory: candles });

    bot.saveCandleHistory();

    expect(bot._candleStore.addCandles).toHaveBeenCalledWith('TSLA', '15m', candles);
    expect(bot._candleStore.saveToDisk).toHaveBeenCalledWith(
      expect.stringContaining('data/candle-history.json'),
      'TSLA',
      '15m',
      200
    );
  });

  test('fails closed when runtime timeframe is missing', () => {
    const bot = makeBot({ candleTimeframe: '' });

    expect(() => bot.loadCandleHistory()).toThrow(/candleTimeframe missing/);
    expect(() => bot.saveCandleHistory()).toThrow(/candleTimeframe missing/);
    expect(bot._candleStore.loadFromDisk).not.toHaveBeenCalled();
    expect(bot._candleStore.saveToDisk).not.toHaveBeenCalled();
  });
});
