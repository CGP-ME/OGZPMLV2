'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolveAlpacaStockDownloadConfig,
  resolveAlpacaStockDataAccessConfig,
  resolveDashboardStockDataConfig,
  resolveDashboardStockStreamConfig,
} = require('../server/dashboard-stock-stream-config');

describe('dashboard stock stream config', () => {
  test('does not open the relay Alpaca trade stream unless explicitly enabled', () => {
    expect(resolveDashboardStockStreamConfig({}).enabled).toBe(false);
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: '' }).enabled).toBe(false);
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: 'false' }).enabled).toBe(false);
  });

  test('accepts explicit opt-in values', () => {
    expect(resolveDashboardStockStreamConfig({
      DASHBOARD_STOCK_STREAM_ENABLED: 'true',
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_DATA_STREAM_URL: 'wss://stream.data.alpaca.markets/v2/iex',
      ALPACA_STOCK_STREAM_FEED: 'iex',
    })).toEqual(expect.objectContaining({
      enabled: true,
      ready: true,
      source: 'env:DASHBOARD_STOCK_STREAM_ENABLED',
      streamUrl: 'wss://stream.data.alpaca.markets/v2/iex',
      feed: 'iex',
      missing: [],
    }));
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: '1' }).enabled).toBe(true);
  });

  test('requires stream credentials and URL only when the relay stream is enabled', () => {
    expect(resolveDashboardStockStreamConfig({
      DASHBOARD_STOCK_STREAM_ENABLED: 'false',
    })).toEqual(expect.objectContaining({
      enabled: false,
      ready: false,
      missing: [],
    }));

    expect(resolveDashboardStockStreamConfig({
      DASHBOARD_STOCK_STREAM_ENABLED: 'true',
      ALPACA_API_KEY: 'test-key',
    })).toEqual(expect.objectContaining({
      enabled: true,
      ready: false,
      missing: ['ALPACA_API_SECRET', 'ALPACA_DATA_STREAM_URL', 'ALPACA_STOCK_STREAM_FEED'],
    }));
  });

  test('resolves Alpaca stock data access without dashboard freshness config', () => {
    expect(resolveAlpacaStockDataAccessConfig({
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
      ALPACA_STOCK_DATA_FEED: 'iex',
      ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
    })).toEqual(expect.objectContaining({
      ready: true,
      missing: [],
      dataUrl: 'https://data.alpaca.markets/v2/stocks',
      feed: 'iex',
      adjustment: 'split',
    }));
  });

  test('dashboard stock ticker config requires explicit freshness ownership', () => {
    expect(resolveDashboardStockDataConfig({
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
      ALPACA_STOCK_DATA_FEED: 'iex',
      ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
    })).toEqual(expect.objectContaining({
      ready: false,
      tickerMaxAgeMs: null,
      missing: ['DASHBOARD_STOCK_PRICE_SYMBOLS', 'STOCK_TICKER_MAX_AGE_MS'],
    }));

    expect(resolveDashboardStockDataConfig({
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
      ALPACA_STOCK_DATA_FEED: 'iex',
      ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
      DASHBOARD_STOCK_PRICE_SYMBOLS: 'tsla, nvda',
      STOCK_TICKER_MAX_AGE_MS: '60000',
    })).toEqual(expect.objectContaining({
      ready: true,
      stockSymbols: ['TSLA', 'NVDA'],
      tickerMaxAgeMs: 60000,
      missing: [],
    }));
  });

  test('stock download config requires explicit downloader tunables', () => {
    const config = resolveAlpacaStockDownloadConfig({
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
      ALPACA_STOCK_DATA_FEED: 'iex',
      ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
      ALPACA_STOCK_DOWNLOAD_SYMBOLS: 'tsla, nvda',
      ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR: 'tuning',
      ALPACA_STOCK_DOWNLOAD_YEARS: '2',
      ALPACA_STOCK_DOWNLOAD_TIMEFRAME: '15Min',
      ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME: '15m',
      ALPACA_STOCK_DOWNLOAD_LIMIT: '10000',
      ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS: '1',
      ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS: '200',
    });

    expect(config).toEqual(expect.objectContaining({
      ready: true,
      missing: [],
      symbols: ['TSLA', 'NVDA'],
      outputDir: 'tuning',
      years: 2,
      timeframe: '15Min',
      filenameTimeframe: '15m',
      limit: 10000,
      chunkMonths: 1,
      rateLimitMs: 200,
    }));
  });

  test('stock download config fails closed on missing or malformed tunables', () => {
    const config = resolveAlpacaStockDownloadConfig({
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_STOCK_DATA_URL: 'https://data.alpaca.markets/v2/stocks',
      ALPACA_STOCK_DATA_FEED: 'iex',
      ALPACA_STOCK_DATA_ADJUSTMENT: 'split',
      ALPACA_STOCK_DOWNLOAD_SYMBOLS: ' ',
      ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR: 'tuning',
      ALPACA_STOCK_DOWNLOAD_YEARS: '0',
      ALPACA_STOCK_DOWNLOAD_TIMEFRAME: '15Min',
      ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME: '15m',
      ALPACA_STOCK_DOWNLOAD_LIMIT: '10000',
      ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS: 'bad',
      ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS: '200',
    });

    expect(config.ready).toBe(false);
    expect(config.missing).toEqual([
      'ALPACA_STOCK_DOWNLOAD_SYMBOLS',
      'ALPACA_STOCK_DOWNLOAD_YEARS',
      'ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS',
    ]);
  });

  test('server clears disabled relay stream before no-client and no-symbol exits', () => {
    const serverPath = path.resolve(__dirname, '..', 'ogzprime-ssl-server.js');
    const source = fs.readFileSync(serverPath, 'utf8');
    const functionStart = source.indexOf('function startDashboardStockPriceStream()');
    const disabledBranch = source.indexOf('if (!DASHBOARD_STOCK_STREAM_CONFIG.enabled)', functionStart);
    const noClientExit = source.indexOf('if (dashboards.length === 0) return false;', functionStart);
    const noSymbolExit = source.indexOf('if (DASHBOARD_STOCK_PRICE_SYMBOLS.length === 0) return false;', functionStart);
    const branchBody = source.slice(disabledBranch, noClientExit);

    expect(functionStart).toBeGreaterThan(-1);
    expect(disabledBranch).toBeGreaterThan(functionStart);
    expect(noClientExit).toBeGreaterThan(disabledBranch);
    expect(noSymbolExit).toBeGreaterThan(noClientExit);
    expect(branchBody).toContain('clearTimeout(stockPriceStreamRetryTimer)');
    expect(branchBody).toContain("stockPriceStreamSocket.close(1000, 'dashboard_stock_stream_disabled')");
    expect(branchBody).toContain("reason: 'disabled_bot_owns_stream'");
  });
});
