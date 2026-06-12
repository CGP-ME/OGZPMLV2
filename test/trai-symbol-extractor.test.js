'use strict';

const fs = require('fs');
const path = require('path');
const { extractSymbol, hasTickerIntent } = require('../core/trai_symbol_extractor');

function extractForAnalyze(prompt) {
  return extractSymbol(prompt, { allowAmbiguousKnownTicker: hasTickerIntent(prompt) });
}

describe('TRAI symbol extraction intent gate', () => {
  test('does not extract casual family or slang words as tickers', () => {
    expect(hasTickerIntent('what good my son')).toBe(false);
    expect(extractForAnalyze('what good my son')).toBeNull();
    expect(extractForAnalyze('hey bro what is good')).toBeNull();
    expect(extractForAnalyze('dad said this was wild')).toBeNull();
  });

  test('does not match known tickers inside normal words', () => {
    expect(extractForAnalyze('I like this setup')).toBeNull();
    expect(extractForAnalyze('can you verify this')).toBeNull();
    expect(extractForAnalyze('a calm vote')).toBeNull();
    expect(extractForAnalyze('what the F')).toBeNull();
  });

  test('extracts standalone known tickers without requiring extra trading words', () => {
    expect(extractForAnalyze('what do you think of TSLA')).toBe('TSLA');
    expect(extractForAnalyze('Ford F chart')).toBe('F');
  });

  test('keeps explicit cashtags authoritative', () => {
    expect(hasTickerIntent('what about $SON')).toBe(true);
    expect(extractForAnalyze('what about $SON')).toBe('SON');
    expect(extractForAnalyze('$F')).toBe('F');
  });

  test('does not extract unknown uppercase tokens even when the prompt has market intent', () => {
    expect(extractForAnalyze('look at XYZQ chart')).toBeNull();
    expect(extractForAnalyze('chart ABC')).toBeNull();
    expect(extractForAnalyze('look at XYZQ')).toBeNull();
    expect(extractForAnalyze('$XYZQ')).toBe('XYZQ');
  });

  test('does not extract trading-intent words as fallback tickers', () => {
    expect(extractForAnalyze('good chart')).toBeNull();
    expect(extractForAnalyze('show me a stock chart')).toBeNull();
    expect(extractForAnalyze("what's the stock today")).toBeNull();
    expect(extractForAnalyze('what is the market data')).toBeNull();
    expect(extractForAnalyze('ticker data')).toBeNull();
    expect(extractForAnalyze('symbol please')).toBeNull();
    expect(extractForAnalyze('price of shares')).toBeNull();
  });

  test('server analyze endpoint uses intent-gated extraction', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'ogzprime-ssl-server.js'), 'utf8');
    expect(serverSource).toContain("const { extractSymbol, hasTickerIntent } = require('./core/trai_symbol_extractor');");
    expect(serverSource).toContain('extractSymbol(prompt, { allowAmbiguousKnownTicker: hasTickerIntent(prompt) })');
    expect(serverSource).not.toMatch(/function\s+extractSymbol\s*\(/);
    expect(serverSource).not.toContain('upperPrompt.includes(ticker)');
  });

  test('browser widget uses server-resolved symbol instead of parsing the query again', () => {
    const widgetSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'trai-widget.js'), 'utf8');
    expect(widgetSource).toContain('if (data.symbol)');
    expect(widgetSource).not.toMatch(/function\s+extractSymbols\s*\(/);
    expect(widgetSource).not.toContain('extractSymbols(query)');
  });
});
