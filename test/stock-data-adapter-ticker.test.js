'use strict';

describe('stock-data-adapter ticker snapshots', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.ALPACA_API_KEY = 'test-key';
    process.env.ALPACA_API_SECRET = 'test-secret';
    process.env.DASHBOARD_STOCK_PRICE_MAX_AGE_MS = '60000';
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-27T14:30:30Z').getTime());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns a real positive Alpaca snapshot price with symbol provenance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 123.45, t: '2026-05-27T14:30:00Z' },
        dailyBar: { c: 123.40, v: 1000 },
        prevDailyBar: { c: 120 },
      }),
    });
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    const ticker = await fetchStockTicker('tsla');

    expect(ticker).toMatchObject({
      symbol: 'TSLA',
      price: 123.45,
      close: 123.45,
      source: 'alpaca',
      feed: 'iex',
    });
    expect(ticker.change).toBeCloseTo(3.45, 8);
    expect(ticker.timestamp).toBe(new Date('2026-05-27T14:30:00Z').getTime());
  });

  test('returns null instead of emitting fake zero when snapshot has no valid price', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 0 },
        dailyBar: { c: null },
        minuteBar: { c: null },
      }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('TSLA')).resolves.toBeNull();
  });

  test('returns null instead of inventing freshness when snapshot has no source timestamp', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 123.45 },
        dailyBar: { c: 123.40, v: 1000 },
      }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('TSLA')).resolves.toBeNull();
  });

  test('returns null instead of broadcasting stale snapshot prices', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 123.45, t: '2026-05-27T14:28:00Z' },
        dailyBar: { c: 123.40, v: 1000 },
      }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('TSLA')).resolves.toBeNull();
  });

  test('refuses crypto symbols in the stock snapshot adapter', async () => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('BTC-USD')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
