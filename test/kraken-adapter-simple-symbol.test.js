const KrakenAdapterSimple = require('../kraken_adapter_simple');
const KrakenDepth = require('../server/kraken-depth-adapter');

describe('KrakenAdapterSimple WebSocket symbol attribution', () => {
  beforeEach(() => {
    KrakenDepth._resetForTest();
  });

  test('normalizes Kraken WebSocket pairs to dashboard symbols', () => {
    const adapter = new KrakenAdapterSimple();

    expect(adapter.normalizeKrakenWsPair('XBT/USD')).toBe('BTC-USD');
    expect(adapter.normalizeKrakenWsPair('XXBTZUSD')).toBe('BTC-USD');
    expect(adapter.normalizeKrakenWsPair('BTC-USD')).toBe('BTC-USD');
    expect(adapter.normalizeKrakenWsPair('XBT-USD')).toBe('BTC-USD');
    expect(adapter.normalizeKrakenWsPair('ETH/USD')).toBe('ETH-USD');
    expect(adapter.normalizeKrakenWsPair('XETHZUSD')).toBe('ETH-USD');
    expect(adapter.normalizeKrakenWsPair('SOL/USD')).toBe('SOL-USD');
    expect(adapter.normalizeKrakenWsPair('SOLUSD')).toBe('SOL-USD');
    expect(adapter.normalizeKrakenWsPair('XDG/USD')).toBe('DOGE-USD');
    expect(adapter.toKrakenWsPair('DOGE-USD')).toBe('XDG/USD');
    expect(adapter.normalizeKrakenWsPair('FAKE/USD')).toBeNull();
    expect(adapter.toKrakenWsPair('FAKE-USD')).toBeNull();
  });

  test('rejects missing pairs instead of inventing a default symbol', () => {
    const adapter = new KrakenAdapterSimple();

    expect(adapter.normalizeKrakenWsPair('')).toBeNull();
    expect(adapter.normalizeKrakenWsPair(null)).toBeNull();
    expect(adapter.normalizeKrakenWsPair('BTC--USD')).toBeNull();
  });

  test('builds price callback frames with top-level and nested symbol metadata', () => {
    const adapter = new KrakenAdapterSimple();
    const frame = adapter.buildPriceCallbackFrame('BTC-USD', 75000, 12.5, 1770000000000);
    const aliasedFrame = adapter.buildPriceCallbackFrame(' XBT/USD ', 75000, 12.5, 1770000000000);

    expect(frame).toMatchObject({
      type: 'price',
      symbol: 'BTC-USD',
      asset: 'BTC-USD',
      price: 75000,
      close: 75000,
      volume: 12.5,
      timestamp: 1770000000000,
      source: 'kraken',
      data: {
        symbol: 'BTC-USD',
        asset: 'BTC-USD',
        price: 75000,
        close: 75000,
        volume: 12.5,
        timestamp: 1770000000000,
        source: 'kraken'
      }
    });
    expect(aliasedFrame.symbol).toBe('BTC-USD');
    expect(aliasedFrame.data.symbol).toBe('BTC-USD');
    expect(frame.data.asset).not.toBe('BTC--USD');
  });

  test('refuses malformed price callback symbols', () => {
    const adapter = new KrakenAdapterSimple();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(adapter.buildPriceCallbackFrame('BTC--USD', 75000, 12.5, 1770000000000)).toBeNull();
    expect(adapter.buildPriceCallbackFrame('FAKE-USD', 75000, 12.5, 1770000000000)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[Kraken] BUILD_PRICE_INVALID_SYMBOL: BTC--USD');
    expect(errorSpy).toHaveBeenCalledWith('[Kraken] BUILD_PRICE_INVALID_SYMBOL: FAKE-USD');
    errorSpy.mockRestore();
  });

  test('uses configured symbols for Kraken WebSocket subscriptions', () => {
    const adapter = new KrakenAdapterSimple({
      symbols: ['BTC-USD', 'ETH-USD', 'XBT/USD', 'ETH/USD']
    });

    expect(adapter.wsPairs).toEqual(['XBT/USD', 'ETH/USD']);
  });

  test('refuses websocket subscription without explicit configured symbols', () => {
    const adapter = new KrakenAdapterSimple();

    expect(() => adapter.getWebSocketPairs()).toThrow(
      '[Kraken] WebSocket stream requires config.tradingPair'
    );
  });

  test('refuses invalid configured websocket symbols', () => {
    expect(() => new KrakenAdapterSimple({ symbols: ['BTC--USD'] })).toThrow(
      '[Kraken] Invalid configured websocket symbol: BTC--USD'
    );
  });

  test('builds scoped depth_update frames from Kraken book levels', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const bids = Array.from({ length: 12 }, (_, index) => [75000 - index, 30]);
    const asks = Array.from({ length: 12 }, (_, index) => [75100 + index, 28]);

    const frame = adapter.buildDepthCallbackFrame('BTC-USD', bids, asks, 1770000000000);
    const aliasedFrame = adapter.buildDepthCallbackFrame(' XBT/USD ', bids, asks, 1770000000000);

    expect(frame).toMatchObject({
      type: 'depth_update',
      symbol: 'BTC-USD',
      source: 'kraken',
      isLive: true,
      timestamp: 1770000000000
    });
    expect(frame.walls[0]).toMatchObject({ side: 'BID', price: 75000, size: 2250000 });
    expect(frame.depth.bids).toHaveLength(12);
    expect(frame.depth.asks).toHaveLength(12);
    expect(aliasedFrame.symbol).toBe('BTC-USD');
  });

  test('refuses depth_update frames for registry-unknown dashboard symbols', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(adapter.buildDepthCallbackFrame('FAKE-USD', [[75000, 30]], [], 1770000000000)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[Kraken] BUILD_DEPTH_INVALID_SYMBOL: FAKE-USD');

    errorSpy.mockRestore();
  });

  test('extracts Kraken order-book pair from snapshot and update message shapes', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });

    expect(adapter.extractKrakenBookPair([42, { bs: [['75000', '1']] }, 'book-25', 'XBT/USD']))
      .toBe('XBT/USD');
    expect(adapter.extractKrakenBookPair([42, { a: [['75100', '1']] }, { b: [['75000', '1']] }, 'book-25', 'XBT/USD']))
      .toBe('XBT/USD');
    expect(adapter.normalizeKrakenWsPair(adapter.extractKrakenBookPair([
      42,
      { a: [['75100', '1']] },
      { b: [['75000', '1']] },
      'book-25',
      'XBT/USD'
    ]))).toBe('BTC-USD');
  });

  test('merges split Kraken book update payload objects before building depth frames', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const levels = adapter.extractKrakenBookLevels([
      42,
      { a: [['75100', '2']] },
      { b: [['75000', '3']] },
      'book-25',
      'XBT/USD'
    ]);

    expect(levels).toEqual({
      asks: [['75100', '2']],
      bids: [['75000', '3']],
      hasBookPayload: true
    });

    const frame = adapter.buildDepthCallbackFrame('BTC-USD', levels.bids, levels.asks, 1770000000000);
    expect(frame.depth.bids).toEqual([[75000, 3]]);
    expect(frame.depth.asks).toEqual([[75100, 2]]);
  });

  test('treats empty Kraken book deltas as no payload instead of invalid levels', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });

    expect(adapter.extractKrakenBookLevels([
      42,
      { a: [] },
      { b: [] },
      'book-25',
      'XBT/USD'
    ])).toEqual({
      asks: [],
      bids: [],
      hasBookPayload: false
    });
  });

  test('does not classify ticker bid/ask arrays as order-book depth', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const tickerMessage = [
      42,
      {
        a: ['73673.10000', 0, '0.00110451'],
        b: ['73673.00000', 0, '0.35689989']
      },
      'ticker',
      'XBT/USD'
    ];

    expect(adapter.isKrakenBookMessage(tickerMessage)).toBe(false);
    expect(adapter.extractKrakenBookPair(tickerMessage)).toBeNull();
    expect(adapter.extractKrakenBookLevels(tickerMessage)).toEqual({
      asks: [],
      bids: [],
      hasBookPayload: false
    });

    const malformedTickerChannel = [
      42,
      { c: ['73673.00000'] },
      'book-ticker',
      'XBT/USD'
    ];
    expect(adapter.isKrakenBookMessage(malformedTickerChannel)).toBe(false);
  });

  test('depth liveness is adapter-local and clears across websocket lifecycle', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const bids = Array.from({ length: 12 }, (_, index) => [75000 - index, 30]);

    expect(adapter.buildDepthCallbackFrame('BTC-USD', bids, [], 1770000000000).isLive).toBe(true);
    adapter.depthLiveSymbolTimestamps.clear();

    expect(adapter.buildDepthCallbackFrame('BTC-USD', [[75000, 30]], [], 1770000001000).isLive).toBe(false);
  });

  test('depth liveness expires after the adapter data timeout', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const bids = Array.from({ length: 12 }, (_, index) => [75000 - index, 30]);

    expect(adapter.buildDepthCallbackFrame('BTC-USD', bids, [], 1770000000000).isLive).toBe(true);
    expect(adapter.buildDepthCallbackFrame('BTC-USD', [[75000, 30]], [], 1770000000000 + adapter.dataTimeout + 1).isLive).toBe(false);
  });

  test('warns and refuses depth_update when all book levels are unusable', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(adapter.buildDepthCallbackFrame('BTC-USD', [[0, 1]], [['bad', 2]], 1770000000000)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[Kraken] WS_BOOK_INVALID_LEVELS: no usable bid/ask levels for BTC-USD');

    warnSpy.mockRestore();
  });

  test('subscribes open websocket order book once per pair', () => {
    const adapter = new KrakenAdapterSimple({ tradingPair: 'BTC-USD' });
    const send = jest.fn();
    adapter.ws = { readyState: 1, send };

    expect(adapter.subscribeOrderBookPair('BTC-USD')).toBe(true);
    expect(adapter.subscribeOrderBookPair('XBT/USD')).toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      event: 'subscribe',
      pair: ['XBT/USD'],
      subscription: { name: 'book', depth: 25 }
    });
  });
});
