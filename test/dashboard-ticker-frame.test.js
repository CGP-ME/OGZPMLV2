'use strict';

const fs = require('fs');
const path = require('path');
const { buildTickerPriceFrame, parseTickerSymbolList } = require('../server/dashboard-ticker-frame');

describe('dashboard ticker_price frame builder', () => {
  test('builds ticker_price from real positive ticker data without inventing unknown fields', () => {
    const frame = buildTickerPriceFrame({
      symbol: 'tsla',
      price: 123.45,
      close: 123.45,
      volume: 1000,
      change: 3.45,
      changePct: 2.875,
      timestamp: 1780000000000,
      source: 'alpaca',
      feed: 'iex',
    }, {
      brokerId: 'alpaca',
      assetClass: 'stock',
    });

    expect(frame).toEqual(expect.objectContaining({
      type: 'ticker_price',
      symbol: 'TSLA',
      asset: 'TSLA',
      price: 123.45,
      close: 123.45,
      volume: 1000,
      change: 3.45,
      changePct: 2.875,
      timestamp: 1780000000000,
      source: 'alpaca',
      feed: 'iex',
      brokerId: 'alpaca',
      assetClass: 'stock',
    }));
    expect(frame).not.toHaveProperty('change24h');
    expect(frame).not.toHaveProperty('data');
  });

  test('returns null instead of inventing ticker_price when required truth is missing', () => {
    expect(buildTickerPriceFrame({ symbol: 'TSLA', price: 0, timestamp: 1780000000000 })).toBeNull();
    expect(buildTickerPriceFrame({ symbol: '', price: 123.45, timestamp: 1780000000000 })).toBeNull();
    expect(buildTickerPriceFrame({ symbol: 'TSLA', price: 123.45, timestamp: null })).toBeNull();
    expect(buildTickerPriceFrame({ symbol: 'FAKE/USD', price: 123.45, timestamp: 1780000000000 })).toBeNull();
  });

  test('rejects ticker_price symbols outside the producer allow-list', () => {
    const frame = buildTickerPriceFrame({
      symbol: 'XBT/USD',
      price: 75000,
      timestamp: 1780000000000,
    }, {
      brokerId: 'kraken',
      assetClass: 'crypto',
    }, {
      allowedSymbols: ['BTC-USD', 'ETH-USD'],
    });

    expect(frame).toEqual(expect.objectContaining({
      type: 'ticker_price',
      symbol: 'XBT/USD',
      asset: 'BTC-USD',
      price: 75000,
    }));

    expect(buildTickerPriceFrame({
      symbol: 'DOGE/USD',
      price: 0.2,
      timestamp: 1780000000000,
    }, {
      brokerId: 'kraken',
      assetClass: 'crypto',
    }, {
      allowedSymbols: ['BTC-USD', 'ETH-USD'],
    })).toBeNull();
  });

  test('symbol list parser falls back when configured list has no valid symbols', () => {
    expect(parseTickerSymbolList(' , ,, ', 'BTC-USD,ETH-USD')).toEqual(['BTC-USD', 'ETH-USD']);
    expect(parseTickerSymbolList('tsla, nvda', 'BTC-USD')).toEqual(['TSLA', 'NVDA']);
  });

  test('allows registry-unknown stock tickers only when explicitly allow-listed', () => {
    expect(buildTickerPriceFrame({
      symbol: 'SHOP',
      price: 90.12,
      timestamp: 1780000000000,
    }, {}, {
      allowedSymbols: ['SHOP'],
    })).toMatchObject({
      symbol: 'SHOP',
      asset: 'SHOP',
      price: 90.12,
    });

    expect(buildTickerPriceFrame({
      symbol: 'SHOP/USD',
      price: 90.12,
      timestamp: 1780000000000,
    }, {}, {
      allowedSymbols: ['SHOP'],
    })).toBeNull();
  });

  test('dashboard Kraken ticker processor uses the asset registry instead of pair rewrite guessing', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'ogzprime-ssl-server.js'), 'utf8');

    expect(serverSource).toContain('normalizeAssetSymbol(pair)');
    expect(serverSource).not.toContain("pair.replace('XBT/'");
  });
});
