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
});
