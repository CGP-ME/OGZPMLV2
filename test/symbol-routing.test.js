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

function makeCtx(symbolContexts, tradingPair = 'BTC-USD') {
  return {
    symbolContexts,
    tradingPair,
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
      '15m',
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
      '15m',
      expect.objectContaining({ symbol: 'BTC-USD', c: 77725 })
    );
    expect(tsla.indicatorEngine.updateCandle).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('symbol=BTC-USD has no SymbolTradingContext'));
  });
});
