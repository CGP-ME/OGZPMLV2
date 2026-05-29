const KrakenAdapterSimple = require('../kraken_adapter_simple');

describe('KrakenAdapterSimple WebSocket symbol attribution', () => {
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
    expect(frame.data.asset).not.toBe('BTC--USD');
  });

  test('refuses malformed price callback symbols', () => {
    const adapter = new KrakenAdapterSimple();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(adapter.buildPriceCallbackFrame('BTC--USD', 75000, 12.5, 1770000000000)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[Kraken] BUILD_PRICE_INVALID_SYMBOL: BTC--USD');
    errorSpy.mockRestore();
  });
});
