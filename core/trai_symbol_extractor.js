'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');
const KNOWN_TICKERS = structuredClone(ConfigLoader.getInternalsFileValue('trai.symbolExtractionPolicy.knownTickers'));

function hasTickerIntent(prompt) {
  const text = String(prompt || '');
  const upper = text.toUpperCase();
  return /\$[A-Z]{1,5}\b/.test(upper) ||
    /\b(stock|ticker|symbol|chart|shares?|quote|price\s+of|trading|market\s+(cap|data)|earnings|dividend|sma|rsi|ema|macd|atr|vwap)\b/i.test(text);
}

function hasStandaloneToken(upperPrompt, token) {
  return new RegExp(`(^|[^A-Z0-9])${token}([^A-Z0-9]|$)`).test(upperPrompt);
}

function extractSymbol(prompt, options = {}) {
  const upperPrompt = String(prompt || '').toUpperCase();
  const cashtag = upperPrompt.match(/\$([A-Z]{1,5})\b/);
  if (cashtag) return cashtag[1];

  for (const ticker of KNOWN_TICKERS) {
    if (ticker.length === 1 && options.allowAmbiguousKnownTicker !== true) continue;
    if (hasStandaloneToken(upperPrompt, ticker)) {
      return ticker;
    }
  }

  return null;
}

module.exports = {
  extractSymbol,
  hasTickerIntent
};
