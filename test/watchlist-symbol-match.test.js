'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDomElement() {
  const element = {
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    appendChild: jest.fn(child => {
      element.children.push(child);
      return child;
    }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: jest.fn(() => null),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
    },
  };
  return element;
}

function loadWatchlist(options = {}) {
  let registered = null;
  const rootEl = options.rootEl || createDomElement();
  const headEl = options.headEl || createDomElement();
  const context = {
    console,
    setInterval: options.setInterval || jest.fn(() => 1),
    clearInterval: options.clearInterval || jest.fn(),
    window: {
      OGZ: {
        register: jest.fn((name, module) => {
          if (name === 'WatchlistStrip') registered = module;
        }),
        get: options.get || jest.fn(),
      },
    },
    document: {
      addEventListener: jest.fn(),
      createElement: jest.fn(() => createDomElement()),
      getElementById: jest.fn(id => (id === 'watchlistStrip' ? rootEl : null)),
      head: headEl,
    },
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

  test('subscribes once to both price and ticker_price socket channels', () => {
    const registerHandler = jest.fn();
    const setIntervalMock = jest.fn(() => 42);
    const clearIntervalMock = jest.fn();
    const socket = { registerHandler };
    const watchlist = loadWatchlist({
      get: jest.fn(name => (name === 'Socket' ? socket : null)),
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
    });

    watchlist.init();
    watchlist.init();
    watchlist.teardown();
    watchlist.init();

    expect(registerHandler).toHaveBeenCalledTimes(3);
    expect(registerHandler).toHaveBeenNthCalledWith(1, 'price', expect.any(Function));
    expect(registerHandler).toHaveBeenNthCalledWith(2, 'ticker_price', expect.any(Function));
    expect(registerHandler).toHaveBeenNthCalledWith(3, 'broker_status', expect.any(Function));
    expect(setIntervalMock).toHaveBeenCalledTimes(2);
    expect(clearIntervalMock).toHaveBeenCalledWith(42);
    expect(watchlist._compute().socketHandlersInstalled).toBe(true);
    expect(watchlist._compute().socketHandlerSocketBound).toBe(true);
    expect(watchlist._compute().positionSyncIntervalInstalled).toBe(true);
  });

  test('binds socket handlers again only when the Socket module identity changes', () => {
    const firstSocket = { registerHandler: jest.fn() };
    const secondSocket = { registerHandler: jest.fn() };
    let socket = firstSocket;
    const watchlist = loadWatchlist({
      get: jest.fn(name => (name === 'Socket' ? socket : null)),
    });

    watchlist.init();
    watchlist.init();
    socket = secondSocket;
    watchlist.init();

    expect(firstSocket.registerHandler).toHaveBeenCalledTimes(3);
    expect(secondSocket.registerHandler).toHaveBeenCalledTimes(3);
    expect(secondSocket.registerHandler).toHaveBeenNthCalledWith(1, 'price', expect.any(Function));
    expect(secondSocket.registerHandler).toHaveBeenNthCalledWith(2, 'ticker_price', expect.any(Function));
    expect(secondSocket.registerHandler).toHaveBeenNthCalledWith(3, 'broker_status', expect.any(Function));
  });
});
