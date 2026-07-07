'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadChartPanel(selectedSymbol) {
  let registered = null;
  const selector = { value: selectedSymbol };
  const root = {
    querySelector: jest.fn((query) => (query === '#cp-assetSelector' ? selector : null)),
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      OGZ: {
        register: jest.fn((name, module) => {
          if (name === 'ChartPanel') registered = module;
        }),
      },
    },
    document: {
      getElementById: jest.fn((id) => (id === 'chartPanel' ? root : null)),
      createElement: jest.fn(() => ({ id: '', textContent: '' })),
      head: { appendChild: jest.fn() },
      addEventListener: jest.fn(),
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');
  vm.runInContext(source, context);
  return registered;
}

function scopedPosition(overrides = {}) {
  return {
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-live-1',
    assetClass: 'stocks',
    executionMode: 'live',
    timeframe: '15m',
    scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
    scopeComplete: true,
    sizeUsd: 1200,
    entryPrice: 391.35,
    ...overrides,
  };
}

function runtimeScope(overrides = {}) {
  return {
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-live-1',
    assetClass: 'stocks',
    executionMode: 'live',
    timeframe: '15m',
    scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
    scopeComplete: true,
    ...overrides,
  };
}

describe('chart panel symbol filter', () => {
  test('startup bootstrap waits for an open socket before sending historical requests', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');

    expect(source).toContain("if (typeof socket.isConnected === 'function' && !socket.isConnected())");
    expect(source).toContain("const switched = socket.send({ type: 'asset_change', asset: sym });");
    expect(source).toContain("const requested = socket.send({ type: 'request_historical', timeframe: tf, asset: sym, limit: 500 });");
    expect(source).toContain("if (switched || requested) _loadedAsset = sym;");
  });

  test('startup selected asset refuses literal none and non-selectable values', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');

    expect(source).toContain("if (!selected || selected === 'NONE') return normalizeDashboardSymbol(DEFAULT_SYMBOL);");
    expect(source).toContain("const optionExists = Array.prototype.some.call(selector.options, opt => opt.value === selected);");
    expect(source).toContain("return optionExists ? selected : normalizeDashboardSymbol(DEFAULT_SYMBOL);");
  });

  test('watchlist card selection binding waits for the shared bus to exist', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');

    expect(source).toContain('function bindWatchlistSelect()');
    expect(source).toContain('function armWatchlistSelectBinding()');
    expect(source).toContain("OGZ.bus.on('watchlist:select', _watchlistSelectHandler);");
    expect(source).toContain('const tid = setInterval(() => {');
    expect(source).toContain('if (!bindWatchlistSelect()) return;');
    expect(source).toContain("OGZ.bus.off('watchlist:select', _watchlistSelectHandler);");
  });

  test('normalizes indicator selections without dropping existing oscillator panes on string calls', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');
    const chart = loadChartPanel('TSLA');

    expect(chart._normalizeIndicatorSelection(['RSI', 'ema', 'rsi'])).toEqual(['rsi', 'ema']);
    expect(source).toContain("activeOverlays.concat([active])");
    expect(source).toContain("const selected = normalizeIndicatorSelection(active);");
    expect(source).toContain("activeOverlays = selected.slice();");
    expect(source).toContain("syncIndicatorCheckboxes(selected);");
    expect(source).toContain("if (storedCandles.length > 0) this.calculateIndicators(storedCandles);");
    expect(source).not.toContain("if (storedCandles.length > 0) this.calculateIndicators(storedCandles);\n                    });");
  });

  test('generated price-line overlays are cleared before recalculation and chart clears', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');

    expect(source).toContain("this._clearGeneratedOverlayLines();");
    expect(source).toContain("if (!Array.isArray(candles) || candles.length < MIN_INDICATOR_CANDLES) return false;");
    expect(source).toContain("candleSeries.removePriceLine(l)");
  });

  test('chart panel CSS does not clip oscillator panes inside the module shell', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/panels/chart-panel.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/unified-dashboard-v2.html'), 'utf8');

    expect(css).not.toMatch(/\.cp-root\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).not.toMatch(/\.cp-container\s*\{[^}]*overflow:\s*hidden/s);
    expect(html).not.toMatch(/#chartPanel\s*\{[^}]*overflow:\s*hidden/s);
  });

  test('accepts only the selected dashboard symbol when a frame is symbol-stamped', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart.isSelectedAssetPayload({ symbol: 'TSLA' })).toBe(true);
    expect(chart.isSelectedAssetPayload({ symbol: 'BTC-USD' })).toBe(false);
    expect(chart.isSelectedAssetPayload({ data: { symbol: 'TSLA' } })).toBe(true);
    expect(chart.isSelectedAssetPayload({ candle: { symbol: 'NVDA' } })).toBe(false);
  });

  test('normalizes bare and Kraken crypto symbols to the selected dash form', () => {
    const chart = loadChartPanel('BTC-USD');

    expect(chart.isSelectedAssetPayload({ symbol: 'BTC' })).toBe(true);
    expect(chart.isSelectedAssetPayload({ symbol: 'BTC/USD' })).toBe(true);
    expect(chart.isSelectedAssetPayload({ symbol: 'XBT/USD' })).toBe(true);
    expect(chart.isSelectedAssetPayload({ symbol: 'ETH-USD' })).toBe(false);
  });

  test('BTC chart history uses real Kraken OHLC fallback and refuses price-mismatched candles', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');

    expect(source).toContain("'BTC-USD': 'XBTUSD'");
    expect(source).toContain("async function fetchKrakenHistoricalCandles(symbol, timeframe, limit)");
    expect(source).toContain("const krakenCandles = await fetchKrakenHistoricalCandles(requestedSymbol, requestedTimeframe, requestedLimit);");
    expect(source).toContain("if (requestedSymbol !== currentSymbol || requestedTimeframe !== currentTimeframe) return;");
    expect(source).toContain("if (isPriceMismatched(requestedSymbol, formatted))");
    expect(source).toContain("pill.textContent = `${requestedSymbol} historical feed mismatch`;");
  });

  test('timeframe changes clear stale candles and reject mislabeled historical spacing', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/chart-panel.js'), 'utf8');
    const chart = loadChartPanel('TSLA');
    const fifteenMinuteCandles = Array.from({ length: 20 }, (_, i) => ({
      time: 1782700000 + i * 900,
      open: 380,
      high: 381,
      low: 379,
      close: 380.5,
      volume: 1000,
    }));
    const fiveMinuteCandles = Array.from({ length: 20 }, (_, i) => ({
      time: 1782700000 + i * 300,
      open: 380,
      high: 381,
      low: 379,
      close: 380.5,
      volume: 1000,
    }));

    expect(source).toContain('this.clearAll();');
    expect(source).toContain('Loading ${asset} ${displayTimeframe(nextTimeframe)} history...');
    expect(source).toContain('historicalSpacingMatchesTimeframe(formatted, requestedTimeframe)');
    expect(source).toContain('history spacing mismatch');
    expect(chart._historicalSpacingMatchesTimeframe(fifteenMinuteCandles, '1m').ok).toBe(false);
    expect(chart._historicalSpacingMatchesTimeframe(fifteenMinuteCandles, '5m').ok).toBe(false);
    expect(chart._historicalSpacingMatchesTimeframe(fifteenMinuteCandles, '15m').ok).toBe(true);
    expect(chart._historicalSpacingMatchesTimeframe(fiveMinuteCandles, '5m').ok).toBe(true);
  });

  test('rejects unsymbolized frames instead of assigning them to the selected chart', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart.isSelectedAssetPayload({ price: 100 })).toBe(false);
  });

  test('prefers scoped state_update positions for the selected chart symbol', () => {
    const chart = loadChartPanel('TSLA');

    const selectedPosition = scopedPosition({
      side: 'long',
      stopLoss: 387.5,
      takeProfit: 399,
    });

    expect(chart._selectedScopedPositionFromStateUpdate({
      runtimeScope: runtimeScope(),
      state: {
        position: 0,
        positions: [
          scopedPosition({
            symbol: 'NVDA',
            scopeKey: 'live:alpaca:acct-live-1:stocks:NVDA:15m',
            side: 'short',
            entryPrice: 154.2,
          }),
          selectedPosition,
        ],
      },
    })).toBe(selectedPosition);
  });

  test('treats missing selected scoped position as flat even when legacy scalar is nonzero', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        position: 1200,
        positions: [
          scopedPosition({
            symbol: 'NVDA',
            scopeKey: 'live:alpaca:acct-live-1:stocks:NVDA:15m',
            side: 'long',
            entryPrice: 154.2,
          }),
        ],
      },
    })).toBe(null);
  });

  test('treats duplicate selected scoped positions as ambiguous instead of picking a broker', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        positions: [
          scopedPosition({
            accountId: 'one',
            scopeKey: 'live:alpaca:one:stocks:TSLA:15m',
            entryPrice: 391.35,
          }),
          scopedPosition({
            accountId: 'two',
            scopeKey: 'live:alpaca:two:stocks:TSLA:15m',
            entryPrice: 392.1,
          }),
        ],
      },
    })).toBe(null);
  });

  test('ignores duplicate positions for non-selected symbols', () => {
    const chart = loadChartPanel('TSLA');
    const selectedPosition = scopedPosition();

    expect(chart._selectedScopedPositionFromStateUpdate({
      runtimeScope: runtimeScope(),
      state: {
        positions: [
          scopedPosition({
            symbol: 'NVDA',
            accountId: 'one',
            scopeKey: 'live:alpaca:one:stocks:NVDA:15m',
            entryPrice: 154.2,
          }),
          scopedPosition({
            symbol: 'NVDA',
            accountId: 'two',
            scopeKey: 'live:alpaca:two:stocks:NVDA:15m',
            entryPrice: 155.1,
          }),
          selectedPosition,
        ],
      },
    })).toBe(selectedPosition);
  });

  test('rejects selected scoped positions that do not match the selected runtime scope', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      runtimeScope: runtimeScope(),
      state: {
        positions: [
          scopedPosition({
            accountId: 'other-account',
            scopeKey: 'live:alpaca:other-account:stocks:TSLA:15m',
          }),
        ],
      },
    })).toBe(null);
  });

  test('rejects incomplete scoped positions instead of treating symbol as enough', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        positions: [
          scopedPosition({
            scopeComplete: false,
          }),
        ],
      },
    })).toBe(null);
  });

  test('rejects legacy scalar state positions because they are not symbol-scoped line data', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        symbol: 'TSLA',
        position: 1200,
      },
    })).toBe(null);
  });

  test('rejects legacy object state positions for a different symbol', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        symbol: 'NVDA',
        position: {
          entryPrice: 154.2,
          stopLoss: 151,
          takeProfit: 160,
        },
      },
    })).toBe(null);
  });

  test('accepts symbol-stamped legacy object state positions for compatibility', () => {
    const chart = loadChartPanel('TSLA');
    const legacyPosition = {
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-live-1',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
      scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
      scopeComplete: true,
      size: 1200,
      entryPrice: 391.35,
      stopLoss: 387.5,
      takeProfit: 399,
    };

    expect(chart._selectedScopedPositionFromStateUpdate({
      runtimeScope: runtimeScope(),
      state: {
        position: legacyPosition,
      },
    })).toBe(legacyPosition);
  });

  test('rejects scoped positions when the selected runtime scope is missing', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._selectedScopedPositionFromStateUpdate({
      state: {
        positions: [
          scopedPosition(),
        ],
      },
    })).toBe(null);
  });

  test('derives chart line levels from legacy entry and target aliases', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._positionLineLevels({
      entry: 391.35,
      stop: 387.5,
      target: 399,
    })).toEqual({
      entry: 391.35,
      stop: 387.5,
      target: 399,
    });
  });

  test('derives chart entry line level from avgPrice alias', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._positionLineLevels({
      avgPrice: 391.35,
    })).toEqual({
      entry: 391.35,
      stop: null,
      target: null,
    });
  });

  test('requires finite nonzero size before drawing position lines', () => {
    const chart = loadChartPanel('TSLA');

    expect(chart._hasDrawablePositionLines({
      symbol: 'TSLA',
      entryPrice: 391.35,
    })).toBe(false);

    expect(chart._hasDrawablePositionLines({
      symbol: 'TSLA',
      size: 0,
      entryPrice: 391.35,
    })).toBe(false);

    expect(chart._hasDrawablePositionLines({
      symbol: 'TSLA',
      sizeUsd: 1200,
      entry: 391.35,
    })).toBe(true);
  });
});
