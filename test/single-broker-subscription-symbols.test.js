'use strict';

const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('single-broker market-data subscription symbols', () => {
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

  test('resolves every explicit Alpaca symbol for the single-broker feed', () => {
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      ALPACA_SYMBOLS: 'TSLA, nvda, SPY, TSLA',
      TRADING_PAIR: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });

    const OGZPrimeV14Bot = loadBot();

    expect(OGZPrimeV14Bot._test.resolveSingleBrokerSubscriptionSymbols({
      id: 'alpaca',
      alpacaSymbols: 'TSLA, nvda, SPY, TSLA',
      tradingPair: 'TSLA',
    })).toEqual(['TSLA', 'NVDA', 'SPY']);
  });

  test('does not invent an Alpaca subscription list from TRADING_PAIR', () => {
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      ALPACA_SYMBOLS: 'TSLA',
      TRADING_PAIR: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });

    const OGZPrimeV14Bot = loadBot();

    expect(() => OGZPrimeV14Bot._test.resolveSingleBrokerSubscriptionSymbols({
      id: 'alpaca',
      tradingPair: 'TSLA',
    })).toThrow(/ALPACA_SYMBOLS must provide at least one symbol/);
  });

  test('keeps non-Alpaca single-broker feeds single-symbol', () => {
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      ALPACA_SYMBOLS: 'TSLA',
      TRADING_PAIR: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });

    const OGZPrimeV14Bot = loadBot();

    expect(OGZPrimeV14Bot._test.resolveSingleBrokerSubscriptionSymbols({
      id: 'kraken',
      tradingPair: 'XBT/USD',
    })).toEqual(['BTC-USD']);
  });

  test('subscribes every configured Alpaca symbol in the single-broker runtime path', () => {
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

    const OGZPrimeV14Bot = loadBot();
    const subscribeToCandles = jest.fn();
    const on = jest.fn();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      kraken: {
        subscribeToCandles,
        on,
      },
    });

    bot.subscribeToMarketData();

    expect(subscribeToCandles).toHaveBeenCalledTimes(2);
    expect(subscribeToCandles).toHaveBeenNthCalledWith(1, 'TSLA', '15m');
    expect(subscribeToCandles).toHaveBeenNthCalledWith(2, 'NVDA', '15m');
    expect(on).toHaveBeenCalledWith('ohlc', expect.any(Function));
  });

  test('hydrates every configured Alpaca symbol in the single-broker runtime path', () => {
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

    const OGZPrimeV14Bot = loadBot();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      tradingPair: 'TSLA',
    });

    expect(bot._getBootHydrationSymbols()).toEqual(['TSLA', 'NVDA']);
  });

  test('drops symbol-less OHLC events instead of assigning them to the first Alpaca symbol', () => {
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

    const OGZPrimeV14Bot = loadBot();
    let ohlcHandler;
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      symbolContexts: new Map([['TSLA', {}], ['NVDA', {}]]),
      kraken: {
        subscribeToCandles: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'ohlc') ohlcHandler = handler;
        }),
      },
      storeTimeframeCandle: jest.fn(),
      storeSymbolTimeframeCandle: jest.fn(),
      handleMarketData: jest.fn(),
      run15mTradingCycle: jest.fn(),
    });

    bot.subscribeToMarketData();
    ohlcHandler({
      timeframe: '15m',
      data: {
        t: '2026-06-15T13:30:00.000Z',
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 1000,
      },
    });

    expect(bot.storeTimeframeCandle).not.toHaveBeenCalled();
    expect(bot.storeSymbolTimeframeCandle).not.toHaveBeenCalled();
    expect(bot.handleMarketData).not.toHaveBeenCalled();
    expect(bot.run15mTradingCycle).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('missing symbol | broker=alpaca contexts=TSLA,NVDA'));
  });

  test('routes Alpaca bars whose symbol is on the raw S field', () => {
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

    const OGZPrimeV14Bot = loadBot();
    let ohlcHandler;
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      symbolContexts: new Map([['TSLA', {}], ['NVDA', {}]]),
      candleTimeframe: '15m',
      timeframeSelector: { currentTimeframe: '15m' },
      config: { assetClass: 'stocks' },
      kraken: {
        subscribeToCandles: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'ohlc') ohlcHandler = handler;
        }),
      },
      storeTimeframeCandle: jest.fn(() => ({
        isNewCandle: false,
        candle: { etime: 1781530200000 },
      })),
      storeSymbolTimeframeCandle: jest.fn(),
      _markActiveTimeframeData: jest.fn(),
      getCandleScopeEnvelope: jest.fn(() => ({})),
      syncDashboardRuntimeScope: jest.fn(),
      handleMarketData: jest.fn(),
      run15mTradingCycle: jest.fn(),
    });

    bot.subscribeToMarketData();
    ohlcHandler({
      timeframe: '15m',
      data: {
        S: 'NVDA',
        t: '2026-06-15T13:30:00.000Z',
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 1000,
      },
    });

    expect(bot.storeTimeframeCandle).toHaveBeenCalledWith('15m', expect.any(Array), 'NVDA');
    expect(bot.storeSymbolTimeframeCandle).toHaveBeenCalledWith('NVDA', '15m', expect.any(Array));
    expect(bot.handleMarketData).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'NVDA',
      timeframe: '15m',
    }));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('missing symbol'));
  });
});
