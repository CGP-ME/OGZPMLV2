'use strict';

const STOCK_TIMEFRAME_CONFIG = Object.freeze({
  '1m': Object.freeze({ alpaca: '1Min', intervalMs: 60000 }),
  '5m': Object.freeze({ alpaca: '5Min', intervalMs: 300000 }),
  '15m': Object.freeze({ alpaca: '15Min', intervalMs: 900000 }),
  '30m': Object.freeze({ alpaca: '30Min', intervalMs: 1800000 }),
  '1h': Object.freeze({ alpaca: '1Hour', intervalMs: 3600000 }),
  '4h': Object.freeze({ alpaca: '4Hour', intervalMs: 14400000 }),
  '1d': Object.freeze({ alpaca: '1Day', intervalMs: 86400000 }),
});

function resolveDashboardStockConfigFromRuntime(runtimeConfig) {
  const stockData = runtimeConfig?.services?.dashboard?.stockData;
  if (!stockData || typeof stockData !== 'object') {
    throw new Error('[DashboardStockConfig] services.dashboard.stockData is required');
  }
  const accessMissing = [];
  if (!stockData.apiKey) accessMissing.push('services.dashboard.stockData.apiKey');
  if (!stockData.apiSecret) accessMissing.push('services.dashboard.stockData.apiSecret');
  if (!stockData.baseUrl) accessMissing.push('services.dashboard.stockData.baseUrl');
  if (!stockData.feed) accessMissing.push('services.dashboard.stockData.feed');
  if (!stockData.adjustment) accessMissing.push('services.dashboard.stockData.adjustment');
  const dataMissing = [...accessMissing];
  if (!Array.isArray(stockData.symbols) || stockData.symbols.length === 0) {
    dataMissing.push('services.dashboard.stockData.symbols');
  }
  if (!Number.isInteger(stockData.tickerMaxAgeMs) || stockData.tickerMaxAgeMs <= 0) {
    dataMissing.push('services.dashboard.stockData.tickerMaxAgeMs');
  }
  const streamMissing = [];
  if (stockData.streamEnabled === true) {
    if (!stockData.streamUrl) streamMissing.push('services.dashboard.stockData.streamUrl');
    if (!stockData.streamFeed) streamMissing.push('services.dashboard.stockData.streamFeed');
    if (!stockData.apiKey) streamMissing.push('services.dashboard.stockData.apiKey');
    if (!stockData.apiSecret) streamMissing.push('services.dashboard.stockData.apiSecret');
  }

  const configuredSymbols = Array.isArray(stockData.symbols) ? stockData.symbols : [];

  const data = Object.freeze({
    apiKey: stockData.apiKey ?? null,
    apiSecret: stockData.apiSecret ?? null,
    dataUrl: stockData.baseUrl ?? null,
    feed: stockData.feed ?? null,
    adjustment: stockData.adjustment ?? null,
    stockSymbols: Object.freeze(configuredSymbols.map(symbol => String(symbol).trim().toUpperCase()).filter(Boolean)),
    tickerMaxAgeMs: stockData.tickerMaxAgeMs,
    timeframes: STOCK_TIMEFRAME_CONFIG,
    missing: Object.freeze(dataMissing),
    ready: dataMissing.length === 0,
    sources: Object.freeze({ owner: 'ConfigLoader:services.dashboard.stockData' }),
  });
  const stream = Object.freeze({
    enabled: stockData.streamEnabled === true,
    streamUrl: stockData.streamUrl ?? null,
    feed: stockData.streamFeed ?? null,
    apiKey: stockData.apiKey ?? null,
    apiSecret: stockData.apiSecret ?? null,
    missing: Object.freeze(streamMissing),
    ready: stockData.streamEnabled === true && streamMissing.length === 0,
    source: 'ConfigLoader:services.dashboard.stockData.streamEnabled',
    sources: Object.freeze({ owner: 'ConfigLoader:services.dashboard.stockData' }),
  });
  return Object.freeze({ data, stream });
}

module.exports = {
  resolveDashboardStockConfigFromRuntime,
};
