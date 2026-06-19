'use strict';

const originalSymbolRoutingEnv = { ...process.env };
process.env = {
  ...originalSymbolRoutingEnv,
  DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
  EXECUTION_MODE: 'backtest',
  CANDLE_SOURCE: 'file',
  BACKTEST_MODE: 'true',
  BROKER: 'alpaca',
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  TRADING_PAIR: 'TSLA',
  ASSET_CLASS: 'stocks',
  RISK_MANAGER_BYPASS: 'false',
  ACCOUNT_DRAWDOWN_BYPASS: 'false',
  MAX_DRAWDOWN: '5',
  MAX_DAILY_LOSS: '1',
  MAX_WEEKLY_LOSS: '5',
  MAX_MONTHLY_LOSS: '5',
};

const CandleProcessor = require('../core/CandleProcessor');
const ConfigLoader = require('../foundation/ConfigLoader');
const { getInstance: getStateManager } = require('../core/StateManager');

function primeConfigForSymbolRouting(overrides = {}) {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
    EXECUTION_MODE: 'backtest',
    CANDLE_SOURCE: 'file',
    BACKTEST_MODE: 'true',
    BROKER: 'alpaca',
    ALPACA_MODE: 'paper',
    ALPACA_API_KEY: 'test-alpaca-key',
    ALPACA_API_SECRET: 'test-alpaca-secret',
    ALPACA_SYMBOLS: '',
    TRADING_PAIR: 'TSLA',
    ASSET_CLASS: 'stocks',
    RISK_MANAGER_BYPASS: 'false',
    ACCOUNT_DRAWDOWN_BYPASS: 'false',
    MAX_DRAWDOWN: '5',
    MAX_DAILY_LOSS: '1',
    MAX_WEEKLY_LOSS: '5',
    MAX_MONTHLY_LOSS: '5',
    ...overrides,
  };
  ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
  process.env = originalEnv;
}

function makeSymCtx(symbol) {
  return {
    symbol,
    indicatorEngine: {
      updateCandle: jest.fn(),
      getRenderPacket: jest.fn(() => ({ indicators: {}, overlays: {} })),
      getSnapshot: jest.fn(() => ({ indicators: {} })),
    },
    emaCrossover: null,
    maDynamicSR: null,
    volumeProfile: null,
    priceHistory: [],
    marketData: null,
  };
}

function seedSymCtxCandle(symCtx, etime, symbol = symCtx.symbol) {
  symCtx.priceHistory.push({
    symbol,
    timeframe: '1m',
    t: etime - 60000,
    etime,
    o: 1,
    h: 1,
    l: 1,
    c: 1,
    v: 1,
  });
}

function makeCtx(symbolContexts, tradingPair = 'BTC-USD', candleTimeframe = '1m') {
  return {
    symbolContexts,
    tradingPair,
    candleTimeframe,
    _candleStore: {
      addCandle: jest.fn(),
    },
    priceHistory: [],
    indicatorEngine: {
      updateCandle: jest.fn(),
      getRenderPacket: jest.fn(() => ({ indicators: {}, overlays: {} })),
      getSnapshot: jest.fn(() => ({ indicators: {} })),
    },
    mtfAdapter: null,
    emaCrossover: null,
    maDynamicSR: null,
    liquiditySweep: null,
    volumeProfile: null,
    candleSaveCounter: 0,
    saveCandleHistory: jest.fn(),
    config: {
      enableBacktestMode: true,
      brokerId: 'kraken',
      accountId: 'acct-1',
      assetClass: 'crypto',
      executionMode: 'backtest',
      timeframe: candleTimeframe,
      dataFeed: {
        bootRestHydrationLimit: 60,
        livenessBackfillLimit: 10,
        livenessCheckIntervalMs: 60000,
        maxDataSilenceMs: 120000,
        activeTimeframeMultiplier: 1.5,
        activeTimeframeSlackMs: 60000,
        maxBackfillAgeMultiplier: 2,
        maxBackfillAgeSlackMs: 60000,
        staleDataMaxAgeMs: 120000,
        staleDataRecoveryAgeMs: 30000,
        gapThresholdMultiplier: 1.5,
        gapBackfillBufferCandles: 5,
        gapRecoveryCleanCandlesRequired: 3,
        gapBackfillRetryDelayMs: 60000,
        expectedQuietLogIntervalMs: 300000,
      },
    },
    dashboardWsConnected: false,
    dashboardWs: null,
    getCandlesForTimeframe: jest.fn(() => []),
    broadcastEdgeAnalytics: jest.fn(),
  };
}

function ohlc(close = 77724) {
  const start = 1779440400;
  return [start, start + 60, close - 10, close + 20, close - 30, close, close, 12.5, 42];
}

function candleObject(overrides = {}) {
  return {
    symbol: 'BTC-USD',
    timeframe: '1m',
    t: 1779440400000,
    etime: 1779440460000,
    o: 77714,
    h: 77744,
    l: 77694,
    c: 77724,
    v: 12.5,
    ...overrides,
  };
}

describe('symbol-aware candle routing', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    primeConfigForSymbolRouting();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalSymbolRoutingEnv;
  });

  test('routes Kraken XBT slash symbols into BTC-USD context, not TSLA', () => {
    const btc = makeSymCtx('BTC-USD');
    const tsla = makeSymCtx('TSLA');
    const ctx = makeCtx(new Map([
      ['TSLA', tsla],
      ['BTC-USD', btc],
    ]));
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({ data: ohlc(), symbol: 'XBT/USD', timeframe: '1m' });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '1m',
      expect.objectContaining({ symbol: 'BTC-USD', c: 77724 })
    );
    expect(btc.indicatorEngine.updateCandle).toHaveBeenCalledTimes(1);
    expect(tsla.indicatorEngine.updateCandle).not.toHaveBeenCalled();
    expect(ctx.marketData.symbol).toBe('BTC-USD');
    expect(btc.marketData.symbol).toBe('BTC-USD');
  });

  test('keeps non-primary Alpaca candles out of the legacy root price history mirror', () => {
    const tsla = makeSymCtx('TSLA');
    const nvda = makeSymCtx('NVDA');
    const ctx = makeCtx(new Map([
      ['TSLA', tsla],
      ['NVDA', nvda],
    ]), 'TSLA', '15m');
    const processor = new CandleProcessor(ctx);

    processor.processNewCandle(candleObject({
      symbol: 'TSLA',
      timeframe: '15m',
      c: 400,
    }));
    processor.processNewCandle(candleObject({
      symbol: 'NVDA',
      timeframe: '15m',
      c: 900,
    }));

    expect(ctx.priceHistory).toHaveLength(1);
    expect(ctx.priceHistory[0]).toEqual(expect.objectContaining({ symbol: 'TSLA', c: 400 }));
    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'NVDA',
      '15m',
      expect.objectContaining({ symbol: 'NVDA', c: 900 })
    );
    expect(tsla.indicatorEngine.updateCandle).toHaveBeenCalledTimes(1);
    expect(nvda.indicatorEngine.updateCandle).toHaveBeenCalledTimes(1);
    expect(ctx.indicatorEngine.updateCandle).toHaveBeenCalledTimes(1);
  });

  test('gap detection compares non-primary candles against their own symbol history', () => {
    primeConfigForSymbolRouting({
      BACKTEST_MODE: 'false',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      ALPACA_SYMBOLS: 'TSLA,NVDA',
    });
    const tsla = makeSymCtx('TSLA');
    const nvda = makeSymCtx('NVDA');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const startSeconds = nowSeconds - 60;
    const endMs = nowSeconds * 1000;
    seedSymCtxCandle(tsla, endMs - (10 * 60 * 1000), 'TSLA');
    seedSymCtxCandle(nvda, endMs, 'NVDA');
    const ctx = makeCtx(new Map([
      ['TSLA', tsla],
      ['NVDA', nvda],
    ]), 'TSLA', '1m');
    ctx.config.enableBacktestMode = false;
    ctx.config.assetClass = 'stocks';
    ctx.config.brokerId = 'alpaca';
    ctx.priceHistory = tsla.priceHistory;
    const processor = new CandleProcessor(ctx);
    processor.attemptBackfill = jest.fn();

    processor.handleMarketData({
      data: [startSeconds, nowSeconds, 899, 901, 898, 900, 900, 1000, 1],
      symbol: 'NVDA',
      timeframe: '1m',
      brokerId: 'alpaca',
      accountId: 'acct-1',
      assetClass: 'stocks',
      executionMode: 'paper',
    });

    expect(processor.attemptBackfill).not.toHaveBeenCalled();
  });

  test('stores raw seconds-array candle timestamps as integer milliseconds', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]));
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({
      data: [
        1779850177.477202,
        1779850800.000000,
        75628.1,
        75656.3,
        75613.5,
        75642.2,
        75640.0,
        1.33538492,
        42,
      ],
      symbol: 'BTC-USD',
      timeframe: '1m',
    });

    expect(ctx.marketData.timestamp).toBe(1779850177477);
    expect(ctx.marketData.timestamp).toBe(btc.marketData.timestamp);
    expect(ctx.priceHistory[0].t).toBe(1779850177477);
    expect(ctx.priceHistory[0].etime).toBe(1779850800000);
  });

  test('stores object candle timestamps as integer milliseconds without double scaling', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]));
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({
      data: {
        symbol: 'BTC-USD',
        timeframe: '1m',
        t: '1779850177.477202',
        etime: '1779850800.000000',
        o: '75628.10000',
        h: '75656.30000',
        l: '75613.50000',
        c: '75642.20000',
        v: '1.33538492',
      },
      symbol: 'BTC-USD',
      timeframe: '1m',
    });

    expect(ctx.marketData.timestamp).toBe(1779850177477);
    expect(ctx.marketData.timestamp).toBe(btc.marketData.timestamp);
    expect(ctx.priceHistory[0].t).toBe(1779850177477);
    expect(ctx.priceHistory[0].etime).toBe(1779850800000);
  });

  test('falls back to ConfigLoader dataFeed when local context omits dataFeed config', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    delete ctx.config.dataFeed;

    const processor = new CandleProcessor(ctx);

    expect(processor.dataFeedConfig).toEqual(expect.objectContaining({
      maxDataSilenceMs: expect.any(Number),
      gapThresholdMultiplier: expect.any(Number),
      gapBackfillRetryDelayMs: expect.any(Number),
    }));
  });

  test('processNewCandle stamps immutable scope before storage', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    const processor = new CandleProcessor(ctx);

    processor.processNewCandle(candleObject({ symbol: 'XBT/USD' }));

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '1m',
      expect.objectContaining({
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'acct-1',
        assetClass: 'crypto',
        executionMode: 'backtest',
        timeframe: '1m',
        scopeKey: 'backtest:kraken:acct-1:crypto:BTC-USD:1m',
        scopeKeyVersion: 2,
      })
    );
  });

  test('processNewCandle rejects non-millisecond timestamps instead of storing ambiguous candles', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    const processor = new CandleProcessor(ctx);

    expect(() => processor.processNewCandle(candleObject({
      t: 1779850177,
      etime: 1779850800,
    }))).toThrow('invalid millisecond timestamp field(s): t, etime');

    expect(() => processor.processNewCandle(candleObject({
      t: 1779850177477.202,
      etime: 1779850800000,
    }))).toThrow('invalid millisecond timestamp field(s): t');

    expect(ctx._candleStore.addCandle).not.toHaveBeenCalled();
  });

  test('does not pause stock runtime for stale candle during non-RTH expected quiet', () => {
    primeConfigForSymbolRouting({
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'websocket',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
    });
    const now = Date.parse('2026-06-05T21:17:28Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const stateManager = getStateManager();
    const pauseSpy = jest.spyOn(stateManager, 'pauseTrading').mockImplementation(() => {});
    try {
      const tsla = makeSymCtx('TSLA');
      const ctx = makeCtx(new Map([['TSLA', tsla]]), 'TSLA', '15m');
      ctx.config.enableBacktestMode = false;
      ctx.config.brokerId = 'alpaca';
      ctx.config.assetClass = 'stocks';
      ctx.config.executionMode = 'paper';
      const processor = new CandleProcessor(ctx);
      processor.marketCalendar.getMarketPhase = jest.fn(() => ({
        phase: 'ah',
        isOpen: true,
        isRTH: false,
        nextTransition: 'After-hours ends 20:00 ET',
        rthCloseMinute: 960,
      }));

      processor.handleMarketData(candleObject({
        symbol: 'TSLA',
        timeframe: '15m',
        t: now - (75 * 60 * 1000),
        etime: now - (60 * 60 * 1000),
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'paper',
      }));

      expect(pauseSpy).not.toHaveBeenCalled();
      expect(ctx.staleFeedPaused).not.toBe(true);
    } finally {
      pauseSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  test('still pauses stock runtime for stale candle during RTH', () => {
    primeConfigForSymbolRouting({
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'websocket',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
    });
    const now = Date.parse('2026-06-05T15:17:28Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const stateManager = getStateManager();
    const pauseSpy = jest.spyOn(stateManager, 'pauseTrading').mockImplementation(() => {});
    try {
      const tsla = makeSymCtx('TSLA');
      const ctx = makeCtx(new Map([['TSLA', tsla]]), 'TSLA', '15m');
      ctx.config.enableBacktestMode = false;
      ctx.config.brokerId = 'alpaca';
      ctx.config.assetClass = 'stocks';
      ctx.config.executionMode = 'paper';
      const processor = new CandleProcessor(ctx);
      processor.marketCalendar.getMarketPhase = jest.fn(() => ({
        phase: 'rth',
        isOpen: true,
        isRTH: true,
        nextTransition: 'RTH closes 16:00 ET',
        rthCloseMinute: 960,
      }));

      processor.handleMarketData(candleObject({
        symbol: 'TSLA',
        timeframe: '15m',
        t: now - (75 * 60 * 1000),
        etime: now - (60 * 60 * 1000),
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'paper',
      }));

      expect(pauseSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stale data:'),
        expect.objectContaining({
          source: 'data_feed_liveness',
          recoverable: true,
          scope: expect.objectContaining({
            symbol: 'TSLA',
            timeframe: '15m',
            brokerId: 'alpaca',
            accountId: 'acct-1',
            assetClass: 'stocks',
            executionMode: 'paper',
          }),
        })
      );
      expect(ctx.staleFeedPaused).toBe(true);
    } finally {
      pauseSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  test('fails closed for stale stock candle when market phase omits isRTH', () => {
    primeConfigForSymbolRouting({
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'websocket',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
    });
    const now = Date.parse('2026-06-05T15:17:28Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const stateManager = getStateManager();
    const pauseSpy = jest.spyOn(stateManager, 'pauseTrading').mockImplementation(() => {});
    try {
      const tsla = makeSymCtx('TSLA');
      const ctx = makeCtx(new Map([['TSLA', tsla]]), 'TSLA', '15m');
      ctx.config.enableBacktestMode = false;
      ctx.config.brokerId = 'alpaca';
      ctx.config.assetClass = 'stocks';
      ctx.config.executionMode = 'paper';
      const processor = new CandleProcessor(ctx);
      processor.marketCalendar.getMarketPhase = jest.fn(() => ({
        phase: 'holiday',
        nextTransition: 'Holiday',
        rthCloseMinute: 960,
      }));

      processor.handleMarketData(candleObject({
        symbol: 'TSLA',
        timeframe: '15m',
        t: now - (75 * 60 * 1000),
        etime: now - (60 * 60 * 1000),
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'paper',
      }));

      expect(pauseSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stale data:'),
        expect.objectContaining({
          source: 'data_feed_liveness',
          recoverable: true,
        })
      );
      expect(ctx.staleFeedPaused).toBe(true);
    } finally {
      pauseSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  test('fails closed for stale stock candle when market phase contradicts isRTH', () => {
    primeConfigForSymbolRouting({
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'websocket',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
    });
    const now = Date.parse('2026-06-05T15:17:28Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const stateManager = getStateManager();
    const pauseSpy = jest.spyOn(stateManager, 'pauseTrading').mockImplementation(() => {});
    try {
      const tsla = makeSymCtx('TSLA');
      const ctx = makeCtx(new Map([['TSLA', tsla]]), 'TSLA', '15m');
      ctx.config.enableBacktestMode = false;
      ctx.config.brokerId = 'alpaca';
      ctx.config.assetClass = 'stocks';
      ctx.config.executionMode = 'paper';
      const processor = new CandleProcessor(ctx);
      processor.marketCalendar.getMarketPhase = jest.fn(() => ({
        phase: 'rth',
        isOpen: true,
        isRTH: false,
        nextTransition: 'RTH closes 16:00 ET',
        rthCloseMinute: 960,
      }));

      processor.handleMarketData(candleObject({
        symbol: 'TSLA',
        timeframe: '15m',
        t: now - (75 * 60 * 1000),
        etime: now - (60 * 60 * 1000),
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'paper',
      }));

      expect(pauseSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stale data:'),
        expect.objectContaining({
          source: 'data_feed_liveness',
          recoverable: true,
        })
      );
      expect(ctx.staleFeedPaused).toBe(true);
    } finally {
      pauseSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  test('dashboard price frame carries symbol on top-level, data, and candle payload', () => {
    const priorBacktestFast = process.env.BACKTEST_FAST;
    process.env.BACKTEST_FAST = 'false';
    ConfigLoader.load({ force: true, silent: true });
    try {
      const btc = makeSymCtx('BTC-USD');
      const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
      ctx.dashboardWsConnected = true;
      ctx.dashboardWs = { send: jest.fn() };
      ctx.dashboardTimeframe = '1m';
      ctx.getCandlesForTimeframe = jest.fn(() => [candleObject({ symbol: 'BTC-USD' })]);
      const processor = new CandleProcessor(ctx);

      processor.handleMarketData({ data: ohlc(77724), symbol: 'XBT/USD', timeframe: '1m' });

      expect(ctx.dashboardWs.send).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(ctx.dashboardWs.send.mock.calls[0][0]);
      expect(payload.type).toBe('price');
      expect(payload.symbol).toBe('BTC-USD');
      expect(payload.asset).toBe('BTC-USD');
      expect(payload.price).toBe(77724);
      expect(payload.close).toBe(77724);
      expect(payload.timeframe).toBe('1m');
      expect(payload.candle.symbol).toBe('BTC-USD');
      expect(payload.candle.timeframe).toBe('1m');
      expect(payload.candle.close).toBe(77724);
      expect(payload.timestamp).toBe(payload.candle.timestamp);
      expect(payload.indicators).toEqual({
        rsi: null,
        atr: null,
        macd: null,
        macdSignal: null,
        macdHistogram: null,
        volume: 12.5,
      });
      expect(payload.data.symbol).toBe('BTC-USD');
      expect(payload.data.asset).toBe('BTC-USD');
      expect(payload.data.price).toBe(77724);
      expect(payload.data.close).toBe(77724);
      expect(payload.data.timeframe).toBe('1m');
      expect(payload.data.candle.symbol).toBe('BTC-USD');
      expect(payload.data.candle.timeframe).toBe('1m');
      expect(payload.data.candle.close).toBe(77724);
      expect(payload.data.timestamp).toBe(payload.timestamp);
      expect(payload.data.candle.timestamp).toBe(payload.timestamp);
      expect(payload.data.indicators).toEqual(payload.indicators);
    } finally {
      if (priorBacktestFast === undefined) {
        delete process.env.BACKTEST_FAST;
      } else {
        process.env.BACKTEST_FAST = priorBacktestFast;
      }
      ConfigLoader.load({ force: true, silent: true });
    }
  });

  test('dashboard price frame carries numeric indicator DTO for readout panels', () => {
    const priorBacktestFast = process.env.BACKTEST_FAST;
    process.env.BACKTEST_FAST = 'false';
    ConfigLoader.load({ force: true, silent: true });
    try {
      const btc = makeSymCtx('BTC-USD');
      const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
      ctx.dashboardWsConnected = true;
      ctx.dashboardWs = { send: jest.fn() };
      ctx.dashboardTimeframe = '1m';
      ctx.getCandlesForTimeframe = jest.fn(() => [candleObject({ symbol: 'BTC-USD' })]);
      ctx.indicatorEngine.getRenderPacket.mockReturnValue({
        indicators: { macd: { macd: 99, signal: 98, hist: 1 }, renderOnly: { debug: true } },
        overlays: { lines: [] },
      });
      ctx.indicatorEngine.getSnapshot.mockReturnValue({
        indicators: {
          rsi: 61.4,
          macd: 1.25,
          macdSignal: 1.1,
          macdHistogram: 0.15,
          atr: 22.8,
          volume: 42,
        },
      });
      const processor = new CandleProcessor(ctx);

      processor.handleMarketData({ data: ohlc(77724), symbol: 'BTC-USD', timeframe: '1m' });

      const payload = JSON.parse(ctx.dashboardWs.send.mock.calls[0][0]);
      expect(payload.indicators).toMatchObject({
        rsi: 61.4,
        macd: 1.25,
        macdSignal: 1.1,
        macdHistogram: 0.15,
        atr: 22.8,
        volume: 42,
      });
      expect(payload.data.indicators).toEqual(payload.indicators);
      expect(payload.indicators.macd).not.toEqual(expect.any(Object));
      expect(Object.keys(payload.indicators).sort()).toEqual([
        'atr',
        'macd',
        'macdHistogram',
        'macdSignal',
        'rsi',
        'volume',
      ]);
    } finally {
      if (priorBacktestFast === undefined) {
        delete process.env.BACKTEST_FAST;
      } else {
        process.env.BACKTEST_FAST = priorBacktestFast;
      }
      ConfigLoader.load({ force: true, silent: true });
    }
  });

  test('processNewCandle rejects missing symbol instead of using ctx tradingPair', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.config.evalTraceEnabled = true;
    ctx.config.evalTraceBacktest = true;
    const processor = new CandleProcessor(ctx);

    expect(() => processor.processNewCandle(
      candleObject({ symbol: undefined }),
      { traceId: 'trace_missing_symbol', source: 'unit' }
    )).toThrow('missing immutable candle scope field(s): symbol');

    expect(logSpy.mock.calls.some(([message]) => (
      String(message).includes('[EVAL-TRACE][CANDLE_SCOPE_REJECTED]')
      && String(message).includes('missingFields=["symbol"]')
    ))).toBe(true);
    expect(ctx._candleStore.addCandle).not.toHaveBeenCalled();
  });

  test('processNewCandle rejects missing timeframe instead of using ctx timeframe', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.config.evalTraceEnabled = true;
    ctx.config.evalTraceBacktest = true;
    const processor = new CandleProcessor(ctx);

    expect(() => processor.processNewCandle(
      candleObject({ timeframe: undefined }),
      { traceId: 'trace_missing_timeframe', source: 'unit' }
    )).toThrow('missing immutable candle scope field(s): timeframe');

    expect(logSpy.mock.calls.some(([message]) => (
      String(message).includes('[EVAL-TRACE][CANDLE_SCOPE_REJECTED]')
      && String(message).includes('missingFields=["timeframe"]')
    ))).toBe(true);
    expect(ctx._candleStore.addCandle).not.toHaveBeenCalled();
  });

  test('handleMarketData stamps legacy array input from active runtime context', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData(ohlc(77727), { traceId: 'trace_backtest_array' });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '1m',
      expect.objectContaining({
        symbol: 'BTC-USD',
        symbolSource: 'ctx.tradingPair',
        brokerId: 'kraken',
        accountId: 'acct-1',
        assetClass: 'crypto',
        executionMode: 'backtest',
        scopeKey: 'backtest:kraken:acct-1:crypto:BTC-USD:1m',
      })
    );
  });

  test('handleBackfillSuccess stamps scope from active runtime context', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    const processor = new CandleProcessor(ctx);

    processor.handleBackfillSuccess([[1779440400000, 1779440460000, 1, 2, 0.5, 1.5, 1.5, 20, 3]], {
      traceId: 'trace_backfill',
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      accountId: 'acct-1',
      accountIdSource: 'config',
      assetClass: 'crypto',
      executionMode: 'backtest',
    });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '1m',
      expect.objectContaining({
        symbol: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'acct-1',
        assetClass: 'crypto',
        executionMode: 'backtest',
        scopeKey: 'backtest:kraken:acct-1:crypto:BTC-USD:1m',
      })
    );
  });

  test('handleBackfillSuccess rejects missing replay scope instead of reading current ctx', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.config.evalTraceEnabled = true;
    ctx.config.evalTraceBacktest = true;
    const processor = new CandleProcessor(ctx);

    expect(() => processor.handleBackfillSuccess(
      [[1779440400000, 1779440460000, 1, 2, 0.5, 1.5, 1.5, 20, 3]],
      { traceId: 'trace_backfill_missing', symbol: 'BTC-USD', timeframe: '1m' }
    )).toThrow('missing immutable candle scope field(s): brokerId, accountId, assetClass, executionMode');

    expect(logSpy.mock.calls.some(([message]) => (
      String(message).includes('[EVAL-TRACE][CANDLE_SCOPE_REJECTED]')
      && String(message).includes('missingFields=["brokerId","accountId","assetClass","executionMode"]')
    ))).toBe(true);
    expect(ctx._candleStore.addCandle).not.toHaveBeenCalled();
  });

  test('does not fall back to sole TSLA context when candle is explicitly BTC-USD', () => {
    const tsla = makeSymCtx('TSLA');
    const ctx = makeCtx(new Map([['TSLA', tsla]]), 'TSLA');
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({ data: ohlc(77725), symbol: 'BTC-USD', timeframe: '1m' });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '1m',
      expect.objectContaining({ symbol: 'BTC-USD', c: 77725 })
    );
    expect(tsla.indicatorEngine.updateCandle).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('symbol=BTC-USD has no SymbolTradingContext'));
  });

  test('stores candles under the incoming timeframe key', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '15m');
    const processor = new CandleProcessor(ctx);

    processor.handleMarketData({ data: ohlc(77726), symbol: 'BTC-USD', timeframe: '15m' });

    expect(ctx._candleStore.addCandle).toHaveBeenCalledWith(
      'BTC-USD',
      '15m',
      expect.objectContaining({ symbol: 'BTC-USD', c: 77726, timeframe: '15m' })
    );
    expect(ctx.marketData.timeframe).toBe('15m');
  });

  test('gap recovery backfills the explicit candle symbol and timeframe', async () => {
    primeConfigForSymbolRouting({ ALPACA_SYMBOLS: 'TSLA' });
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.config.dataFeed.gapBackfillBufferCandles = 2;
    ctx.kraken = { getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    expect(processor.candleIntervalMs).toBe(60 * 1000);
    await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      assetClass: 'crypto'
    });

    expect(ctx.kraken.getCandles).toHaveBeenCalledWith('BTC-USD', '1m', 3);
  });

  test('gap recovery uses immutable candle symbol instead of contaminated runtime default', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'NVDA', '1m');
    ctx.config.dataFeed.gapBackfillBufferCandles = 2;
    ctx.kraken = { id: 'kraken', getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      assetClass: 'crypto'
    });

    expect(ctx.kraken.getCandles).toHaveBeenCalledWith('BTC-USD', '1m', 3);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalledWith('NVDA', '1m', expect.any(Number));
  });

  test('gap recovery refuses stock symbols through Kraken', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'NVDA', '1m');
    ctx.kraken = { id: 'kraken', getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'NVDA',
      timeframe: '1m',
      brokerId: 'kraken',
      assetClass: 'stocks'
    });

    expect(candles).toEqual([]);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to backfill stock symbol NVDA through Kraken'));
  });

  test('gap recovery refuses configured stock symbols with USD suffix through Kraken', async () => {
    primeConfigForSymbolRouting({ ALPACA_SYMBOLS: 'NVDA' });
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.kraken = { id: 'kraken', getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'NVDA-USD',
      timeframe: '1m',
      brokerId: 'kraken'
    });

    expect(candles).toEqual([]);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to backfill stock symbol NVDA-USD through Kraken'));
  });

  test('gap recovery refuses configured stock USD suffix through Kraken even when mislabeled crypto', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    ctx.kraken = { id: 'kraken', getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'TSLA-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      assetClass: 'crypto'
    });

    expect(candles).toEqual([]);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to backfill stock symbol TSLA-USD through Kraken'));
  });

  test('gap recovery refuses crypto symbols through Alpaca', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    const alpaca = { id: 'alpaca', getCandles: jest.fn().mockResolvedValue([]) };
    ctx.sessionRouter = { activeBroker: alpaca };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'alpaca',
      assetClass: 'crypto'
    });

    expect(candles).toEqual([]);
    expect(alpaca.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to backfill crypto symbol BTC-USD through Alpaca'));
  });

  test('gap recovery refuses broker-ambiguous REST fetches', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
    delete ctx.config.brokerId;
    ctx.kraken = { getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      assetClass: 'crypto'
    });

    expect(candles).toEqual([]);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing broker identity for BTC-USD backfill'));
  });

  test('gap recovery refuses missing runtime timeframe instead of using global defaults', () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '');

    expect(() => new CandleProcessor(ctx)).toThrow('invalid candle timeframe');
  });

  test('gap recovery refuses missing runtime symbol instead of using config fallback', async () => {
    const btc = makeSymCtx('BTC-USD');
    const ctx = makeCtx(new Map([['BTC-USD', btc]]), '', '1m');
    ctx.config.tradingPair = 'TSLA';
    ctx.kraken = { getCandles: jest.fn().mockResolvedValue([]) };
    const processor = new CandleProcessor(ctx);

    const candles = await processor.attemptBackfill(0, 60 * 1000);

    expect(candles).toEqual([]);
    expect(ctx.kraken.getCandles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing candle symbol'));
  });
});
