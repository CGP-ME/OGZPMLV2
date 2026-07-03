'use strict';

const fs = require('fs');
const path = require('path');

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
      apiKey: 'placeholder-api-key',
      apiSecret: 'placeholder-api-secret',
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
      'APCA-API-KEY-ID': 'placeholder-api-key',
      'APCA-API-SECRET-KEY': 'placeholder-api-secret',
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

  test('main writes metadata-stamped Alpaca candle files for explicit campaign ranges', async () => {
    const outputDir = fs.mkdtempSync(path.join(__dirname, '.tmp-stock-data-'));
    try {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          bars: [{
            t: '2026-06-01T13:30:00Z',
            o: 100,
            h: 101,
            l: 99,
            c: 100.5,
            v: 1000,
          }],
        }),
      });
      const { main } = require('../scripts/fetch-stock-data');

      await main({
        apiKey: 'placeholder-api-key',
        apiSecret: 'placeholder-api-secret',
        dataUrl: 'https://data.alpaca.markets/v2/stocks',
        feed: 'iex',
        adjustment: 'raw',
        symbols: ['TSLA'],
        outputDir,
        years: 2,
        timeframe: '15Min',
        filenameTimeframe: '15m',
        limit: 10000,
        chunkMonths: 1,
        rateLimitMs: 1,
        startDate: '2026-06-01T13:30:00.000Z',
        endDate: '2026-06-01T13:45:00.000Z',
        sessionProfile: 'alpaca_bars_no_session_filter',
      });

      const files = fs.readdirSync(outputDir);
      expect(files).toEqual(['alpaca-tsla-15m-2026-06-01_2026-06-01.json']);
      const payload = JSON.parse(fs.readFileSync(path.join(outputDir, files[0]), 'utf8'));
      expect(payload.metadata).toMatchObject({
        provider: 'alpaca',
        feed: 'iex',
        feedType: 'single-exchange',
        adjustment: 'raw',
        sessionProfile: 'alpaca_bars_no_session_filter',
        timestampConvention: 'bar_start_ms_aligned',
        symbol: 'TSLA',
        timeframe: '15m',
        alpacaTimeframe: '15Min',
        requestedStart: '2026-06-01T13:30:00.000Z',
        requestedEnd: '2026-06-01T13:45:00.000Z',
        candleCount: 1,
        source: 'scripts/fetch-stock-data.js',
      });
      expect(payload.candles).toEqual([{
        t: Date.parse('2026-06-01T13:30:00Z'),
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 1000,
      }]);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
