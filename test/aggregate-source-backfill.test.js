'use strict';

const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');
const { CandleAggregator } = require('../core/CandleAggregator');

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

function candleAt(ms, close = 100) {
  return {
    t: ms,
    etime: ms + 60_000,
    o: close,
    h: close,
    l: close,
    c: close,
    v: 100,
  };
}

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('active timeframe aggregate source backfill', () => {
  let restoreEnv;
  let logSpy;
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
      ALPACA_SYMBOLS: 'TSLA',
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

  test('repairs missing source candles without firing a stale aggregate trade cycle', async () => {
    const OGZPrimeV14Bot = loadBot();
    const periodStart = Date.UTC(2026, 5, 18, 15, 30, 0);
    const completeSource = Array.from({ length: 15 }, (_, index) => candleAt(periodStart + index * 60_000, 100 + index));
    const incompleteSource = completeSource.filter(candle => candle.t !== periodStart + 8 * 60_000);
    const rawBackfillCandles = completeSource.map(candle => ({
      t: candle.t,
      o: candle.o,
      h: candle.h,
      l: candle.l,
      c: candle.c,
      v: candle.v,
    }));
    const broker = {
      getCandles: jest.fn().mockResolvedValue(rawBackfillCandles),
    };
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      candleAggregator: new CandleAggregator(),
      _emittedAggregatedActiveCandles: new Set(),
      _settledAggregatedActiveCandles: new Set(),
      _aggregateSourceBackfills: new Set(),
      symbolTimeframeHistories: new Map([
        ['TSLA', new Map([['1m', incompleteSource]])],
      ]),
      config: {
        dataFeed: {
          livenessBackfillLimit: 1,
          gapBackfillBufferCandles: 2,
        },
        assetClass: 'stocks',
        brokerId: 'alpaca',
      },
      kraken: broker,
      priceHistory: [],
      storeTimeframeCandle: jest.fn(),
      storeSymbolTimeframeCandle: jest.fn(OGZPrimeV14Bot.prototype.storeSymbolTimeframeCandle),
      _markActiveTimeframeData: jest.fn(),
      getCandleScopeEnvelope: jest.fn(() => ({})),
      handleMarketData: jest.fn(),
      run15mTradingCycle: jest.fn(),
    });

    const result = bot._feedAggregatedActiveCandle({
      symbol: 'TSLA',
      sourceTimeframe: '1m',
      activeTimeframe: '15m',
      sourceLabel: 'single:alpaca',
      traceId: 'trace_test',
    });

    expect(result).toBeNull();
    expect(bot.handleMarketData).not.toHaveBeenCalled();
    expect(bot.run15mTradingCycle).not.toHaveBeenCalled();
    expect(broker.getCandles).toHaveBeenCalledWith('TSLA', '1m', 17);

    await flushPromises();

    expect(bot.storeTimeframeCandle).toHaveBeenCalledTimes(15);
    expect(bot.storeSymbolTimeframeCandle).toHaveBeenCalledTimes(15);
    expect(bot.handleMarketData).not.toHaveBeenCalled();
    expect(bot.run15mTradingCycle).not.toHaveBeenCalled();
    expect(bot._settledAggregatedActiveCandles.has(`TSLA:15m:${periodStart}`)).toBe(true);
  });

  test('refuses unaligned source backfill candles instead of storing corrupted source slots', async () => {
    const OGZPrimeV14Bot = loadBot();
    const periodStart = Date.UTC(2026, 5, 18, 15, 30, 0);
    const incompleteSource = Array.from({ length: 14 }, (_, index) => candleAt(periodStart + index * 60_000, 100 + index));
    const broker = {
      getCandles: jest.fn().mockResolvedValue([
        { t: periodStart + 45_000, o: 100, h: 100, l: 100, c: 100, v: 100 },
      ]),
    };
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      candleAggregator: new CandleAggregator(),
      _emittedAggregatedActiveCandles: new Set(),
      _settledAggregatedActiveCandles: new Set(),
      _aggregateSourceBackfills: new Set(),
      symbolTimeframeHistories: new Map([
        ['TSLA', new Map([['1m', incompleteSource]])],
      ]),
      config: {
        dataFeed: {
          livenessBackfillLimit: 15,
          gapBackfillBufferCandles: 2,
        },
        assetClass: 'stocks',
        brokerId: 'alpaca',
      },
      kraken: broker,
      priceHistory: [],
      storeTimeframeCandle: jest.fn(),
      storeSymbolTimeframeCandle: jest.fn(),
      _markActiveTimeframeData: jest.fn(),
      getCandleScopeEnvelope: jest.fn(() => ({})),
      handleMarketData: jest.fn(),
      run15mTradingCycle: jest.fn(),
    });

    bot._feedAggregatedActiveCandle({
      symbol: 'TSLA',
      sourceTimeframe: '1m',
      activeTimeframe: '15m',
      sourceLabel: 'single:alpaca',
      traceId: 'trace_test',
    });

    await flushPromises();

    expect(bot.storeTimeframeCandle).not.toHaveBeenCalled();
    expect(bot.storeSymbolTimeframeCandle).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[VIS][OHLC][Aggregate] refusing unaligned 1m source backfill candle for TSLA: 2026-06-18T15:30:45.000Z'
    );
  });

  test('settling one incomplete aggregate does not block the next complete aggregate', () => {
    const OGZPrimeV14Bot = loadBot();
    const firstPeriodStart = Date.UTC(2026, 5, 18, 15, 30, 0);
    const secondPeriodStart = firstPeriodStart + 15 * 60_000;
    const incompleteFirstPeriod = Array.from({ length: 15 }, (_, index) => candleAt(firstPeriodStart + index * 60_000, 100 + index))
      .filter(candle => candle.t !== firstPeriodStart + 4 * 60_000);
    const completeSecondPeriod = Array.from({ length: 15 }, (_, index) => candleAt(secondPeriodStart + index * 60_000, 200 + index));
    const broker = {
      getCandles: jest.fn().mockResolvedValue([]),
    };
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      candleAggregator: new CandleAggregator(),
      _emittedAggregatedActiveCandles: new Set(),
      _settledAggregatedActiveCandles: new Set(),
      _aggregateSourceBackfills: new Set(),
      symbolTimeframeHistories: new Map([
        ['TSLA', new Map([['1m', [...incompleteFirstPeriod, ...completeSecondPeriod]]])],
      ]),
      config: {
        dataFeed: {
          livenessBackfillLimit: 20,
          gapBackfillBufferCandles: 2,
        },
        assetClass: 'stocks',
        brokerId: 'alpaca',
      },
      kraken: broker,
      priceHistory: [],
      storeTimeframeCandle: jest.fn(() => ({ isNewCandle: true, candle: { etime: secondPeriodStart + 15 * 60_000 } })),
      storeSymbolTimeframeCandle: jest.fn(),
      _markActiveTimeframeData: jest.fn(),
      getCandleScopeEnvelope: jest.fn(() => ({})),
      handleMarketData: jest.fn(),
      run15mTradingCycle: jest.fn(),
    });

    const result = bot._feedAggregatedActiveCandle({
      symbol: 'TSLA',
      sourceTimeframe: '1m',
      activeTimeframe: '15m',
      sourceLabel: 'single:alpaca',
      traceId: 'trace_test',
    });

    expect(result.activeCandle.t).toBe(secondPeriodStart);
    expect(bot._settledAggregatedActiveCandles.has(`TSLA:15m:${firstPeriodStart}`)).toBe(true);
    expect(bot._settledAggregatedActiveCandles.has(`TSLA:15m:${secondPeriodStart}`)).toBe(true);
    expect(bot.handleMarketData).toHaveBeenCalledTimes(1);
    expect(bot.run15mTradingCycle).toHaveBeenCalledTimes(1);
    expect(bot.handleMarketData.mock.calls[0][0]).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      timeframe: '15m',
    }));
  });
});
