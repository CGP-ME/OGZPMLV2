'use strict';

const KNOWN_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC',
  'NFLX', 'DIS', 'PYPL', 'COIN', 'SQ', 'SHOP', 'ROKU', 'PLTR', 'SNOW', 'CRM',
  'ORCL', 'IBM', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC',
  'ASML', 'TSM', 'BABA', 'JD', 'PDD', 'NIO', 'XPEV', 'LI', 'RIVN', 'LCID',
  'F', 'GM', 'TM', 'BA', 'LMT', 'RTX', 'GE', 'CAT', 'DE', 'UNH', 'JNJ', 'PFE',
  'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'BIIB', 'MRNA', 'BNTX', 'JPM',
  'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'V', 'MA', 'AXP', 'WMT', 'TGT',
  'COST', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'CMG', 'DPZ', 'YUM', 'KO', 'PEP',
  'MNST', 'BTC', 'ETH', 'SOL', 'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO'
];

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
