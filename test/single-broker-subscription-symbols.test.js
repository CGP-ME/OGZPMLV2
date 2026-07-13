'use strict';

const fs = require('fs');
const path = require('path');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter-only market-data subscription ownership', () => {
  let restoreEnv;
  let logSpy;
  let errorSpy;

  function loadBot() {
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
    return require('../run-empire-v2');
  }

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
      ALPACA_SYMBOLS: 'TSLA,NVDA',
      TRADING_PAIR: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (restoreEnv) {
      restoreEnv();
      restoreEnv = null;
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('run-empire has no pre-router single-broker subscription resolver', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'run-empire-v2.js'), 'utf8');

    expect(source).not.toContain('function resolveSingleBrokerSubscriptionSymbols');
    expect(source).not.toContain('resolveSingleBrokerSubscriptionSymbols(');
    expect(source).not.toContain('single-broker subscriptions');
    expect(source).not.toContain('source=single broker');
  });

  test('subscribeToMarketData cannot revive the pre-router broker subscription path', () => {
    const OGZPrimeV14Bot = loadBot();
    const subscribeToCandles = jest.fn();
    const subscribeToTicker = jest.fn();
    const on = jest.fn();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      kraken: {
        subscribeToCandles,
        subscribeToTicker,
        on,
      },
    });

    bot.subscribeToMarketData();

    expect(subscribeToCandles).not.toHaveBeenCalled();
    expect(subscribeToTicker).not.toHaveBeenCalled();
    expect(on).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('V2 ARCHITECTURE: SessionRouter owns market-data subscriptions');
  });

  test('boot hydration resolves stocks from the SessionRouter route table', () => {
    const OGZPrimeV14Bot = loadBot();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        activeSession: 'stocks',
        stockSymbols: ['TSLA', 'NVDA'],
        cryptoSymbols: ['BTC-USD'],
      },
      tradingPair: 'NVDA',
    });

    expect(bot._getBootHydrationSymbols()).toEqual(['TSLA']);
  });

  test('boot hydration resolves crypto from the SessionRouter route table', () => {
    const OGZPrimeV14Bot = loadBot();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        activeSession: 'crypto',
        stockSymbols: ['TSLA'],
        cryptoSymbols: ['BTC-USD'],
      },
      tradingPair: 'TSLA',
    });

    expect(bot._getBootHydrationSymbols()).toEqual(['BTC-USD']);
  });
});
