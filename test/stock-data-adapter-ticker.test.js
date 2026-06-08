'use strict';

describe('stock-data-adapter ticker snapshots', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.ALPACA_API_KEY = 'test-key';
    process.env.ALPACA_API_SECRET = 'test-secret';
    process.env.ALPACA_STOCK_DATA_URL = 'https://data.alpaca.markets/v2/stocks';
    process.env.ALPACA_STOCK_DATA_FEED = 'iex';
    process.env.ALPACA_STOCK_DATA_ADJUSTMENT = 'split';
    process.env.DASHBOARD_STOCK_PRICE_SYMBOLS = 'TSLA,NVDA';
    process.env.STOCK_TICKER_MAX_AGE_MS = '60000';
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
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('TSLA')).resolves.toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('returns structured stale snapshot rejection for dashboard status without warning spam', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 123.45, t: '2026-05-27T14:28:00Z' },
        dailyBar: { c: 123.40, v: 1000 },
      }),
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTickerResult } = require('../server/stock-data-adapter');

    const result = await fetchStockTickerResult('TSLA');

    expect(result).toMatchObject({
      ok: false,
      symbol: 'TSLA',
      reason: 'stale_snapshot',
      ageMs: 150000,
      maxAgeMs: 60000,
      sourceTimestamp: new Date('2026-05-27T14:28:00Z').getTime(),
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('passes structured rejection to fetchStockTicker caller without broadcasting stale data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestTrade: { p: 123.45, t: '2026-05-27T14:28:00Z' },
        dailyBar: { c: 123.40, v: 1000 },
      }),
    });
    const rejects = [];
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('TSLA', { onReject: (result) => rejects.push(result) })).resolves.toBeNull();
    expect(rejects).toHaveLength(1);
    expect(rejects[0]).toMatchObject({
      ok: false,
      symbol: 'TSLA',
      reason: 'stale_snapshot',
    });
  });

  test('refuses crypto symbols in the stock snapshot adapter', async () => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchStockTicker } = require('../server/stock-data-adapter');

    await expect(fetchStockTicker('BTC-USD')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('refuses stock symbols outside configured dashboard stock symbols', async () => {
    global.fetch = jest.fn();
    const { fetchStockTickerResult } = require('../server/stock-data-adapter');

    await expect(fetchStockTickerResult('AAPL')).resolves.toEqual(expect.objectContaining({
      ok: false,
      symbol: 'AAPL',
      reason: 'not_stock_symbol',
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fails closed when required stock data config is missing', async () => {
    jest.resetModules();
    delete process.env.ALPACA_STOCK_DATA_URL;
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchStockTickerResult } = require('../server/stock-data-adapter');

    await expect(fetchStockTickerResult('TSLA')).resolves.toEqual(expect.objectContaining({
      ok: false,
      symbol: 'TSLA',
      reason: 'missing_stock_data_config',
      missing: ['ALPACA_STOCK_DATA_URL'],
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not trust injected ready flag when required config fields are absent', async () => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchStockTickerResult } = require('../server/stock-data-adapter');

    await expect(fetchStockTickerResult('TSLA', {
      config: {
        ready: true,
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        dataUrl: 'https://data.alpaca.markets/v2/stocks',
        feed: 'iex',
        adjustment: 'split',
        stockSymbols: ['TSLA'],
        tickerMaxAgeMs: null,
        timeframes: {
          '15m': { alpaca: '15Min', intervalMs: 900000 },
        },
      },
    })).resolves.toEqual(expect.objectContaining({
      ok: false,
      symbol: 'TSLA',
      reason: 'missing_stock_data_config',
      missing: ['STOCK_TICKER_MAX_AGE_MS'],
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fetchStockCandles rejects unsupported timeframe instead of falling back to 15m', async () => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchStockCandles } = require('../server/stock-data-adapter');

    await expect(fetchStockCandles('TSLA', '2m', 10)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
