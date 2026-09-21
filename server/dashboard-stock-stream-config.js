'use strict';

const REQUIRED_STOCK_DATA_ACCESS_KEYS = Object.freeze([
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'ALPACA_STOCK_DATA_URL',
  'ALPACA_STOCK_DATA_FEED',
  'ALPACA_STOCK_DATA_ADJUSTMENT',
]);

const REQUIRED_STOCK_DATA_CONFIG_KEYS = Object.freeze([
  ...REQUIRED_STOCK_DATA_ACCESS_KEYS,
  'DASHBOARD_STOCK_PRICE_SYMBOLS',
  'STOCK_TICKER_MAX_AGE_MS',
]);

const REQUIRED_STOCK_STREAM_CONFIG_KEYS = Object.freeze([
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
  'ALPACA_DATA_STREAM_URL',
  'ALPACA_STOCK_STREAM_FEED',
]);

const REQUIRED_STOCK_DOWNLOAD_CONFIG_KEYS = Object.freeze([
  ...REQUIRED_STOCK_DATA_ACCESS_KEYS,
  'ALPACA_STOCK_DOWNLOAD_SYMBOLS',
  'ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR',
  'ALPACA_STOCK_DOWNLOAD_YEARS',
  'ALPACA_STOCK_DOWNLOAD_TIMEFRAME',
  'ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME',
  'ALPACA_STOCK_DOWNLOAD_LIMIT',
  'ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS',
  'ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS',
]);

const STOCK_TIMEFRAME_CONFIG = Object.freeze({
  '1m': Object.freeze({ alpaca: '1Min', intervalMs: 60000 }),
  '5m': Object.freeze({ alpaca: '5Min', intervalMs: 300000 }),
  '15m': Object.freeze({ alpaca: '15Min', intervalMs: 900000 }),
  '30m': Object.freeze({ alpaca: '30Min', intervalMs: 1800000 }),
  '1h': Object.freeze({ alpaca: '1Hour', intervalMs: 3600000 }),
  '4h': Object.freeze({ alpaca: '4Hour', intervalMs: 14400000 }),
  '1d': Object.freeze({ alpaca: '1Day', intervalMs: 86400000 }),
});

function envEnabled(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1';
}

function envText(env, key) {
  const value = String(env?.[key] || '').trim();
  return value || null;
}

function resolvePositiveInteger(env, key) {
  const raw = envText(env, key);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function resolveSymbolList(env, key) {
  const raw = envText(env, key);
  if (!raw) return [];
  return raw
    .split(',')
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function sourceFor(env, key) {
  return envText(env, key) ? `env:${key}` : 'unset';
}

function missingKeys(env, keys) {
  return keys.filter(key => {
    if (key === 'STOCK_TICKER_MAX_AGE_MS') return !resolvePositiveInteger(env, key);
    if (
      key === 'ALPACA_STOCK_DOWNLOAD_YEARS' ||
      key === 'ALPACA_STOCK_DOWNLOAD_LIMIT' ||
      key === 'ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS' ||
      key === 'ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS'
    ) {
      return !resolvePositiveInteger(env, key);
    }
    if (key === 'ALPACA_STOCK_DOWNLOAD_SYMBOLS') return resolveSymbolList(env, key).length === 0;
    if (key === 'DASHBOARD_STOCK_PRICE_SYMBOLS') return resolveSymbolList(env, key).length === 0;
    return !envText(env, key);
  });
}

function resolveAlpacaStockDataAccessConfig(env = process.env) {
  const missing = missingKeys(env, REQUIRED_STOCK_DATA_ACCESS_KEYS);
  const config = {
    apiKey: envText(env, 'ALPACA_API_KEY'),
    apiSecret: envText(env, 'ALPACA_API_SECRET'),
    dataUrl: envText(env, 'ALPACA_STOCK_DATA_URL'),
    feed: envText(env, 'ALPACA_STOCK_DATA_FEED'),
    adjustment: envText(env, 'ALPACA_STOCK_DATA_ADJUSTMENT'),
    missing,
    ready: missing.length === 0,
    sources: Object.freeze({
      apiKey: sourceFor(env, 'ALPACA_API_KEY'),
      apiSecret: sourceFor(env, 'ALPACA_API_SECRET'),
      dataUrl: sourceFor(env, 'ALPACA_STOCK_DATA_URL'),
      feed: sourceFor(env, 'ALPACA_STOCK_DATA_FEED'),
      adjustment: sourceFor(env, 'ALPACA_STOCK_DATA_ADJUSTMENT'),
    }),
  };

  return Object.freeze(config);
}

function resolveDashboardStockDataConfig(env = process.env) {
  const access = resolveAlpacaStockDataAccessConfig(env);
  const missing = missingKeys(env, REQUIRED_STOCK_DATA_CONFIG_KEYS);
  return Object.freeze({
    ...access,
    stockSymbols: Object.freeze(resolveSymbolList(env, 'DASHBOARD_STOCK_PRICE_SYMBOLS')),
    tickerMaxAgeMs: resolvePositiveInteger(env, 'STOCK_TICKER_MAX_AGE_MS'),
    timeframes: STOCK_TIMEFRAME_CONFIG,
    missing,
    ready: missing.length === 0,
    sources: Object.freeze({
      ...access.sources,
      stockSymbols: sourceFor(env, 'DASHBOARD_STOCK_PRICE_SYMBOLS'),
      tickerMaxAgeMs: sourceFor(env, 'STOCK_TICKER_MAX_AGE_MS'),
      timeframes: 'static:server/dashboard-stock-stream-config.js',
    }),
  });
}

function resolveDashboardStockStreamConfig(env = process.env) {
  const raw = env.DASHBOARD_STOCK_STREAM_ENABLED;
  const enabled = envEnabled(raw);
  const missing = enabled ? missingKeys(env, REQUIRED_STOCK_STREAM_CONFIG_KEYS) : [];
  return Object.freeze({
    enabled: envEnabled(raw),
    streamUrl: envText(env, 'ALPACA_DATA_STREAM_URL'),
    feed: envText(env, 'ALPACA_STOCK_STREAM_FEED'),
    apiKey: envText(env, 'ALPACA_API_KEY'),
    apiSecret: envText(env, 'ALPACA_API_SECRET'),
    missing,
    ready: enabled && missing.length === 0,
    source: raw == null || raw === '' ? 'unset' : 'env:DASHBOARD_STOCK_STREAM_ENABLED',
    sources: Object.freeze({
      enabled: raw == null || raw === '' ? 'unset' : 'env:DASHBOARD_STOCK_STREAM_ENABLED',
      streamUrl: sourceFor(env, 'ALPACA_DATA_STREAM_URL'),
      feed: sourceFor(env, 'ALPACA_STOCK_STREAM_FEED'),
      apiKey: sourceFor(env, 'ALPACA_API_KEY'),
      apiSecret: sourceFor(env, 'ALPACA_API_SECRET'),
    }),
  });
}

function resolveAlpacaStockDownloadConfig(env = process.env) {
  const access = resolveAlpacaStockDataAccessConfig(env);
  const missing = missingKeys(env, REQUIRED_STOCK_DOWNLOAD_CONFIG_KEYS);
  return Object.freeze({
    ...access,
    symbols: Object.freeze(resolveSymbolList(env, 'ALPACA_STOCK_DOWNLOAD_SYMBOLS')),
    outputDir: envText(env, 'ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR'),
    years: resolvePositiveInteger(env, 'ALPACA_STOCK_DOWNLOAD_YEARS'),
    timeframe: envText(env, 'ALPACA_STOCK_DOWNLOAD_TIMEFRAME'),
    filenameTimeframe: envText(env, 'ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME'),
    limit: resolvePositiveInteger(env, 'ALPACA_STOCK_DOWNLOAD_LIMIT'),
    chunkMonths: resolvePositiveInteger(env, 'ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS'),
    rateLimitMs: resolvePositiveInteger(env, 'ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS'),
    missing,
    ready: missing.length === 0,
    sources: Object.freeze({
      ...access.sources,
      symbols: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_SYMBOLS'),
      outputDir: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR'),
      years: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_YEARS'),
      timeframe: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_TIMEFRAME'),
      filenameTimeframe: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME'),
      limit: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_LIMIT'),
      chunkMonths: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS'),
      rateLimitMs: sourceFor(env, 'ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS'),
    }),
  });
}

function resolveDashboardStockConfig(env = process.env) {
  return Object.freeze({
    data: resolveDashboardStockDataConfig(env),
    stream: resolveDashboardStockStreamConfig(env),
  });
}

module.exports = {
  resolveAlpacaStockDownloadConfig,
  resolveAlpacaStockDataAccessConfig,
  resolveDashboardStockConfig,
  resolveDashboardStockDataConfig,
  resolveDashboardStockStreamConfig,
};
