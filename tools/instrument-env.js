'use strict';

const path = require('path');

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

function resolveInstrumentFromDataFile(dataFile) {
  const symbolTokens = extractSymbolTokens(dataFile);
  const baseTicker = symbolTokens[0];
  const lastToken = symbolTokens[symbolTokens.length - 1];
  const hasQuoteToken = symbolTokens.length > 1 && QUOTE_TOKENS.has(lastToken);
  const normalizedPair = symbolTokens.map(t => t.toUpperCase()).join('-');
  const lowerPath = String(dataFile).toLowerCase();
  const cryptoBySource = lowerPath.includes('kraken') || lowerPath.includes('coinbase') || lowerPath.includes('binance');
  const cryptoByBase = configuredCryptoBases().has(baseTicker);
  const isCrypto = hasQuoteToken || cryptoBySource || cryptoByBase;

  if (isCrypto) {
    return {
      TRADING_PAIR: hasQuoteToken ? normalizedPair : `${baseTicker.toUpperCase()}-USD`,
      BROKER: 'kraken',
      ASSET_CLASS: 'crypto',
    };
  }

  return {
    TRADING_PAIR: baseTicker.toUpperCase(),
    BROKER: 'alpaca',
    ASSET_CLASS: 'stocks',
  };
}

module.exports = {
  extractSymbolTokens,
  resolveInstrumentFromDataFile,
};
