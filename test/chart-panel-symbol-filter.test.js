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
