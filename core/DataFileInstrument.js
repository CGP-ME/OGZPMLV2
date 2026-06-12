'use strict';

const path = require('path');
const TradingConfig = require('./TradingConfig');

const PROVIDER_PREFIXES = new Set(['polygon', 'alpaca', 'kraken', 'coinbase', 'binance', 'real']);
const TIMEFRAME_TOKENS = new Set(['5sec', '1m', '5m', '15m', '30m', '1h', '4h', '1d']);
const SUFFIX_TOKENS = new Set([
  'recent', 'train', 'test', 'unseen', 'walkback', 'walkforward', 'tiny',
]);
const QUOTE_TOKENS = new Set(['usd', 'usdt', 'usdc', 'btc', 'eth']);

function configuredCryptoBases() {
  const raw = process.env.OGZ_CRYPTO_BASES || 'btc,eth,sol,doge,xrp,ada,ltc,bch,link,avax,matic,dot,shib';
  return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

function configuredStockTickers() {
  const parallelConfig = TradingConfig.getParallelBacktestConfig();
  const matrixConfig = TradingConfig.getMatrixSweepConfig();
  const stockKeys = [
    ...(parallelConfig.stockDataShortcutKeys || []),
    ...(matrixConfig.stockTickers || []),
  ];
  return new Set(stockKeys
    .map(key => String(key).toLowerCase().split(/[-_]/)[0])
    .filter(Boolean));
}

function isPeriodToken(token) {
  return /^\d+(mo|mth|month|months|y|yr|yrs|year|years|d|day|days)$/.test(token);
}

function trimKnownPrefixes(tokens) {
  const copy = tokens.slice();
  while (copy.length > 0 && PROVIDER_PREFIXES.has(copy[0])) {
    copy.shift();
  }
  if (copy.length > 1 && TIMEFRAME_TOKENS.has(copy[0])) {
    copy.shift();
  }
  return copy;
}

function extractSymbolTokens(dataFile) {
  const base = path.basename(dataFile, '.json').toLowerCase();
  const tokens = trimKnownPrefixes(base.split(/[-_]/).filter(Boolean));
  const symbolTokens = [];

  for (const token of tokens) {
    if (TIMEFRAME_TOKENS.has(token) || SUFFIX_TOKENS.has(token) || isPeriodToken(token)) {
      break;
    }
    if (!/^[a-z0-9]+$/.test(token)) {
      break;
    }
    symbolTokens.push(token);
  }

  if (symbolTokens.length === 0) {
    throw new Error(`[SYMBOL-MISLABEL-FIX] Cannot derive ticker from data file: ${dataFile}`);
  }

  return symbolTokens;
}

function extractTimeframeToken(dataFile) {
  const base = path.basename(dataFile, '.json').toLowerCase();
  const tokens = base.split(/[-_]/).filter(Boolean);
  return tokens.find(token => TIMEFRAME_TOKENS.has(token)) || null;
}

function resolveInstrumentFromDataFile(dataFile) {
  const symbolTokens = extractSymbolTokens(dataFile);
  const timeframe = extractTimeframeToken(dataFile);
  const baseTicker = symbolTokens[0];
  const lastToken = symbolTokens[symbolTokens.length - 1];
  const hasQuoteToken = symbolTokens.length > 1 && QUOTE_TOKENS.has(lastToken);
  const normalizedPair = symbolTokens.map(t => t.toUpperCase()).join('-');
  const lowerPath = String(dataFile).toLowerCase();
  const cryptoBySource = lowerPath.includes('kraken') || lowerPath.includes('coinbase') || lowerPath.includes('binance');
  const cryptoByBase = configuredCryptoBases().has(baseTicker);
  const isCrypto = hasQuoteToken || cryptoBySource || cryptoByBase;
  const isKnownStock = configuredStockTickers().has(baseTicker);

  if (!isCrypto && !isKnownStock) {
    throw new Error(
      `[SYMBOL-MISLABEL-FIX] Cannot derive asset class for data file '${dataFile}'. Add an explicit stock ticker config or crypto marker.`
    );
  }

  const env = isCrypto ? {
    TRADING_PAIR: hasQuoteToken ? normalizedPair : `${baseTicker.toUpperCase()}-USD`,
    BROKER: 'kraken',
    ASSET_CLASS: 'crypto',
  } : {
    TRADING_PAIR: baseTicker.toUpperCase(),
    BROKER: 'alpaca',
    ASSET_CLASS: 'stocks',
  };

  if (timeframe) {
    env.CANDLE_TIMEFRAME = timeframe;
  }

  return env;
}

function deriveReportAssetSlugFromDataFile(dataFile) {
  const instrument = resolveInstrumentFromDataFile(dataFile);
  return instrument.TRADING_PAIR.replace(/[^A-Z0-9]+/g, '-');
}

module.exports = {
  deriveReportAssetSlugFromDataFile,
  extractSymbolTokens,
  extractTimeframeToken,
  resolveInstrumentFromDataFile,
};
