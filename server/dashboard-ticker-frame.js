'use strict';

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return symbol || null;
}

function normalizeTickerMatchSymbol(value) {
  const symbol = normalizeSymbol(value);
  if (!symbol) return null;
  const dashed = symbol.replace(/^XBT/, 'BTC').replace(/\//g, '-');
  const crypto = dashed.match(/^(BTC|ETH|SOL)-USD$/);
  if (crypto) return crypto[1];
  const compactCrypto = dashed.match(/^(BTC|XBT|ETH|SOL)USD$/);
  if (compactCrypto) return compactCrypto[1] === 'XBT' ? 'BTC' : compactCrypto[1];
  return dashed;
}

function normalizeAssetSymbol(value) {
  const symbol = normalizeSymbol(value);
  if (!symbol) return null;
  const dashed = symbol.replace(/^XBT/, 'BTC').replace(/\//g, '-');
  const crypto = dashed.match(/^(BTC|ETH|SOL)-USD$/);
  if (crypto) return `${crypto[1]}-USD`;
  const compactCrypto = dashed.match(/^(BTC|XBT|ETH|SOL)USD$/);
  if (compactCrypto) {
    const base = compactCrypto[1] === 'XBT' ? 'BTC' : compactCrypto[1];
    return `${base}-USD`;
  }
  return dashed;
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
  const asset = normalizeAssetSymbol(source.asset || source.symbol);
  const price = positiveNumber(source.price ?? source.close);
  const timestamp = positiveNumber(source.timestamp);
  const allowedSymbols = Array.isArray(options.allowedSymbols) ? options.allowedSymbols : [];

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
