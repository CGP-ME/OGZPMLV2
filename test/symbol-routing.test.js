'use strict';

const CandleProcessor = require('../core/CandleProcessor');

function makeSymCtx(symbol) {
  return {
    symbol,
    indicatorEngine: { updateCandle: jest.fn() },
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
    indicatorEngine: { updateCandle: jest.fn() },
    mtfAdapter: null,
    emaCrossover: null,
    maDynamicSR: null,
    liquiditySweep: null,
    volumeProfile: null,
    candleSaveCounter: 0,
    saveCandleHistory: jest.fn(),
    config: { enableBacktestMode: true },
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

  test('gap recovery backfills the active runtime symbol and timeframe', async () => {
    const priorAlpacaSymbols = process.env.ALPACA_SYMBOLS;
    process.env.ALPACA_SYMBOLS = 'TSLA';
    try {
      const btc = makeSymCtx('BTC-USD');
      const ctx = makeCtx(new Map([['BTC-USD', btc]]), 'BTC-USD', '1m');
      ctx.kraken = { getCandles: jest.fn().mockResolvedValue([]) };
      const processor = new CandleProcessor(ctx);

      expect(processor.candleIntervalMs).toBe(60 * 1000);
      await processor.attemptBackfill(0, 60 * 1000);

      expect(ctx.kraken.getCandles).toHaveBeenCalledWith('BTC-USD', '1m', 6);
    } finally {
      if (priorAlpacaSymbols === undefined) {
        delete process.env.ALPACA_SYMBOLS;
      } else {
        process.env.ALPACA_SYMBOLS = priorAlpacaSymbols;
      }
    }
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
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing active trading symbol'));
  });
});
