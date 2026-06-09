'use strict';

const { normalizeAssetSymbol: normalizeRegistryAssetSymbol } = require('../core/AssetRegistry');

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return symbol || null;
}

function normalizeTickerMatchSymbol(value) {
  return normalizeRegistryAssetSymbol(value) || normalizeSymbol(value);
}

function normalizeAssetSymbol(value, allowedSymbols = []) {
  const registrySymbol = normalizeRegistryAssetSymbol(value);
  if (registrySymbol) return registrySymbol;

  const symbol = normalizeSymbol(value);
  if (!symbol) return null;

  const allowed = new Set(allowedSymbols.map(normalizeSymbol).filter(Boolean));
  return allowed.has(symbol) ? symbol : null;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveNumber(value) {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function textField(value) {
  const text = String(value || '').trim();
  return text || null;
}

function copyText(frame, source, fields) {
  for (const field of fields) {
    const value = textField(source[field]);
    if (value) frame[field] = value;
  }
}

function copyFinite(frame, source, fields) {
  for (const field of fields) {
    const value = finiteNumber(source[field]);
    if (value !== null) frame[field] = value;
  }
}

function parseTickerSymbolList(rawValue, fallbackValue) {
  const parsed = String(rawValue || '')
    .split(',')
    .map(item => normalizeSymbol(item))
    .filter(Boolean);
  if (parsed.length > 0) return parsed;

  return String(fallbackValue || '')
    .split(',')
    .map(item => normalizeSymbol(item))
    .filter(Boolean);
}

function buildTickerPriceFrame(ticker = {}, overrides = {}, options = {}) {
  const source = { ...overrides, ...ticker };
  const symbol = normalizeSymbol(source.symbol);
  const allowedSymbols = Array.isArray(options.allowedSymbols) ? options.allowedSymbols : [];
  const asset = normalizeAssetSymbol(source.asset || source.symbol, allowedSymbols);
  const price = positiveNumber(source.price ?? source.close);
  const timestamp = positiveNumber(source.timestamp);

  if (!symbol || !asset || price === null || timestamp === null) return null;
  if (
    allowedSymbols.length > 0 &&
    !allowedSymbols.some(allowed => normalizeTickerMatchSymbol(allowed) === normalizeTickerMatchSymbol(symbol))
  ) {
    return null;
  }

  const frame = {
    type: 'ticker_price',
    symbol,
    asset,
    price,
    timestamp,
  };

  const close = positiveNumber(source.close);
  if (close !== null) frame.close = close;

  copyFinite(frame, source, ['volume', 'change', 'changePct', 'change24h']);
  copyText(frame, source, ['source', 'feed', 'broker', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'timeframe']);

  return frame;
}

module.exports = {
  buildTickerPriceFrame,
  normalizeAssetSymbol,
  normalizeTickerMatchSymbol,
  parseTickerSymbolList,
};
