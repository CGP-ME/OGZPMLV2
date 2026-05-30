'use strict';

const CandleProcessor = require('../core/CandleProcessor');
const ConfigLoader = require('../foundation/ConfigLoader');

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
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
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
    const priorAlpacaSymbols = process.env.ALPACA_SYMBOLS;
    process.env.ALPACA_SYMBOLS = 'TSLA';
    try {
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
    } finally {
      if (priorAlpacaSymbols === undefined) {
        delete process.env.ALPACA_SYMBOLS;
      } else {
        process.env.ALPACA_SYMBOLS = priorAlpacaSymbols;
      }
    }
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
    const priorAlpacaSymbols = process.env.ALPACA_SYMBOLS;
    process.env.ALPACA_SYMBOLS = 'NVDA';
    try {
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
    } finally {
      if (priorAlpacaSymbols === undefined) {
        delete process.env.ALPACA_SYMBOLS;
      } else {
        process.env.ALPACA_SYMBOLS = priorAlpacaSymbols;
      }
    }
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
