'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWatchlist() {
  let registered = null;
  const context = {
    console,
    window: {
      OGZ: {
        register: jest.fn((name, module) => {
          if (name === 'WatchlistStrip') registered = module;
        }),
      },
    },
    document: { addEventListener: jest.fn() },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/watchlist-strip.js'), 'utf8');
  vm.runInContext(source, context);
  return registered;
}

describe('watchlist price symbol matching', () => {
  test('normalizes backend crypto symbols to watchlist card keys', () => {
    const watchlist = loadWatchlist();

    expect(watchlist._normalizePriceSymbol('BTC-USD')).toBe('BTC');
    expect(watchlist._normalizePriceSymbol('BTC/USD')).toBe('BTC');
    expect(watchlist._normalizePriceSymbol('XBT/USD')).toBe('BTC');
    expect(watchlist._normalizePriceSymbol('BTCUSD')).toBe('BTC');
    expect(watchlist._normalizePriceSymbol('ETH-USD')).toBe('ETH');
    expect(watchlist._normalizePriceSymbol('ETHUSD')).toBe('ETH');
  });

  test('leaves stock symbols in canonical ticker form', () => {
    const watchlist = loadWatchlist();

    expect(watchlist._normalizePriceSymbol('TSLA')).toBe('TSLA');
    expect(watchlist._normalizePriceSymbol('nvda')).toBe('NVDA');
  });

  test('uses broker hints and rejects ambiguous duplicate-symbol matches', () => {
    const watchlist = loadWatchlist();
    const tickers = [
      { symbol: 'BTC', broker: 'KRA' },
      { symbol: 'BTC', broker: 'CB' },
    ];

    expect(watchlist._resolvePriceTicker('BTC-USD', 'kraken', tickers)).toEqual({ symbol: 'BTC', broker: 'KRA' });
    expect(watchlist._resolvePriceTicker('BTCUSD', 'coinbase', tickers)).toEqual({ symbol: 'BTC', broker: 'CB' });
    expect(watchlist._resolvePriceTicker('BTC-USD', null, tickers)).toBeNull();
  });
});
