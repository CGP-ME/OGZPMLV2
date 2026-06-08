'use strict';

describe('fetch-stock-data script config consumption', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('fetchBars builds the Alpaca request from explicit download config', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bars: [{ t: '2026-01-01T14:30:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] }),
    });
    const { fetchBars } = require('../scripts/fetch-stock-data');

    await expect(fetchBars('TSLA', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      dataUrl: 'https://data.alpaca.markets/v2/stocks',
      feed: 'iex',
      adjustment: 'split',
      symbols: ['TSLA'],
      outputDir: 'tuning',
      years: 2,
      timeframe: '15Min',
      filenameTimeframe: '15m',
      limit: 10000,
      chunkMonths: 1,
      rateLimitMs: 200,
    })).resolves.toHaveLength(1);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = global.fetch.mock.calls[0];
    expect(url).toContain('https://data.alpaca.markets/v2/stocks/TSLA/bars?');
    expect(url).toContain('timeframe=15Min');
    expect(url).toContain('limit=10000');
    expect(url).toContain('adjustment=split');
    expect(url).toContain('feed=iex');
    expect(request.headers).toEqual({
      'APCA-API-KEY-ID': 'test-key',
      'APCA-API-SECRET-KEY': 'test-secret',
    });
  });

  test('convertFormat preserves candle fields in local tuning format', () => {
    const { convertFormat } = require('../scripts/fetch-stock-data');

    expect(convertFormat([{
      t: '2026-01-01T14:30:00Z',
      o: 1,
      h: 2,
      l: 0.5,
      c: 1.5,
      v: 100,
    }])).toEqual([{
      t: new Date('2026-01-01T14:30:00Z').getTime(),
      o: 1,
      h: 2,
      l: 0.5,
      c: 1.5,
      v: 100,
    }]);
  });

  test('imported main rejects invalid config without calling process.exit', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called by imported main');
    });
    const { main } = require('../scripts/fetch-stock-data');

    await expect(main({ ready: false })).rejects.toThrow(/Missing required Alpaca stock download config/);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
