'use strict';

const fs = require('fs');
const path = require('path');
const { resolveDashboardStockStreamConfig } = require('../server/dashboard-stock-stream-config');

describe('dashboard stock stream config', () => {
  test('does not open the relay Alpaca trade stream unless explicitly enabled', () => {
    expect(resolveDashboardStockStreamConfig({}).enabled).toBe(false);
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: '' }).enabled).toBe(false);
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: 'false' }).enabled).toBe(false);
  });

  test('accepts explicit opt-in values', () => {
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: 'true' })).toEqual({
      enabled: true,
      source: 'env:DASHBOARD_STOCK_STREAM_ENABLED'
    });
    expect(resolveDashboardStockStreamConfig({ DASHBOARD_STOCK_STREAM_ENABLED: '1' }).enabled).toBe(true);
  });

  test('server clears disabled relay stream before no-client and no-symbol exits', () => {
    const serverPath = path.resolve(__dirname, '..', 'ogzprime-ssl-server.js');
    const source = fs.readFileSync(serverPath, 'utf8');
    const functionStart = source.indexOf('function startDashboardStockPriceStream()');
    const disabledBranch = source.indexOf('if (!DASHBOARD_STOCK_STREAM_CONFIG.enabled)', functionStart);
    const noClientExit = source.indexOf('if (dashboards.length === 0) return false;', functionStart);
    const noSymbolExit = source.indexOf('if (DASHBOARD_STOCK_PRICE_SYMBOLS.length === 0) return false;', functionStart);
    const branchBody = source.slice(disabledBranch, noClientExit);

    expect(functionStart).toBeGreaterThan(-1);
    expect(disabledBranch).toBeGreaterThan(functionStart);
    expect(noClientExit).toBeGreaterThan(disabledBranch);
    expect(noSymbolExit).toBeGreaterThan(noClientExit);
    expect(branchBody).toContain('clearTimeout(stockPriceStreamRetryTimer)');
    expect(branchBody).toContain("stockPriceStreamSocket.close(1000, 'dashboard_stock_stream_disabled')");
    expect(branchBody).toContain("reason: 'disabled_bot_owns_stream'");
  });
});
