'use strict';

const {
  attachDashboardMarketScope,
  buildDashboardMarketScope
} = require('../server/dashboard-market-scope');
const { buildTickerPriceFrame } = require('../server/dashboard-ticker-frame');

function stateUpdateWithRuntimeScope(overrides = {}) {
  return {
    type: 'state_update',
    timestamp: 1780000000123,
    runtimeScope: {
      symbol: 'TSLA',
      broker: 'alpaca',
      brokerId: 'alpaca',
      accountId: 'acct-live-1',
      accountIdSource: 'broker:id',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
      scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
      scopeKeyVersion: 2,
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      missingFields: [],
      ...overrides
    }
  };
}

describe('dashboard market-data scope helper', () => {
  test('derives a scoped market-data envelope from verified runtime venue identity', () => {
    const result = buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'NVDA',
      timeframe: '1m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA', 'NVDA']
    });

    expect(result).toEqual({
      ok: true,
      reason: null,
      scope: expect.objectContaining({
        symbol: 'NVDA',
        broker: 'alpaca',
        brokerId: 'alpaca',
        accountId: 'acct-live-1',
        accountIdSource: 'broker:id',
        assetClass: 'stocks',
        executionMode: 'live',
        timeframe: '1m',
        scopeKey: 'live:alpaca:acct-live-1:stocks:NVDA:1m',
        scopeKeyVersion: 2,
        scopeComplete: true,
        runtimeScopeStatus: 'complete',
        runtimeScopeMissing: []
      })
    });
  });

  test('rejects unset, incomplete, mismatched, and unallowed scope without inventing defaults', () => {
    expect(buildDashboardMarketScope({
      stateUpdateFrame: null,
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'runtime_scope_unset'
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope({
        accountId: 'default',
        accountIdSource: 'default',
        scopeComplete: false,
        missingFields: ['accountId']
      }),
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'runtime_scope_incomplete',
      runtimeScopeMissing: ['accountId']
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      assetClass: 'crypto',
      executionMode: 'live',
      allowedSymbols: ['BTC-USD']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'runtime_scope_producer_mismatch',
      mismatches: ['brokerId', 'assetClass']
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live'
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'allowed_symbols_missing'
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: {
        ...stateUpdateWithRuntimeScope(),
        timestamp: null
      },
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'runtime_scope_timestamp_missing'
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope({
        scopeKey: 'live:alpaca:acct-live-1:stocks:NVDA:15m'
      }),
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'runtime_scope_invalid'
    }));

    expect(buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'SHOP',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'symbol_not_allowed'
    }));
  });

  test('attaches verified scope to top-level and nested data payloads only when valid', () => {
    const scopeResult = buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    });
    const frame = attachDashboardMarketScope({
      type: 'price',
      symbol: 'TSLA',
      data: { symbol: 'TSLA' }
    }, scopeResult);

    expect(frame).toEqual(expect.objectContaining({
      scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
      scopeComplete: true,
      timeframe: '15m'
    }));
    expect(frame.data).toEqual(expect.objectContaining({
      scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
      scopeComplete: true,
      timeframe: '15m'
    }));

    const unscoped = { type: 'price', symbol: 'TSLA', data: { symbol: 'TSLA' } };
    attachDashboardMarketScope(unscoped, { ok: false, reason: 'runtime_scope_unset' });
    expect(unscoped).toEqual({ type: 'price', symbol: 'TSLA', data: { symbol: 'TSLA' } });
  });

  test('ticker_price frame builder preserves scoped market-data fields', () => {
    const scopeResult = buildDashboardMarketScope({
      stateUpdateFrame: stateUpdateWithRuntimeScope(),
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      allowedSymbols: ['TSLA']
    });
    const frame = buildTickerPriceFrame({
      symbol: 'TSLA',
      price: 188.12,
      close: 188.12,
      timestamp: 1780000000000,
      source: 'alpaca',
      feed: 'iex'
    }, {
      asset: 'TSLA',
      ...scopeResult.scope
    }, {
      allowedSymbols: ['TSLA']
    });

    expect(frame).toEqual(expect.objectContaining({
      type: 'ticker_price',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-live-1',
      accountIdSource: 'broker:id',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
      scopeKey: 'live:alpaca:acct-live-1:stocks:TSLA:15m',
      scopeKeyVersion: 2,
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      runtimeScopeMissing: []
    }));
  });

  test('ticker_price frame builder strips scope-looking fields from raw ticker payloads', () => {
    const forged = buildTickerPriceFrame({
      symbol: 'TSLA',
      price: 188.12,
      close: 188.12,
      timestamp: 1780000000000,
      source: 'alpaca',
      feed: 'iex',
      scopeKey: 'forged',
      scopeKeyVersion: 2,
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      runtimeScopeMissing: []
    }, {
      asset: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks'
    }, {
      allowedSymbols: ['TSLA']
    });

    expect(forged).toEqual(expect.objectContaining({
      type: 'ticker_price',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks'
    }));
    expect(forged).not.toHaveProperty('scopeKey');
    expect(forged).not.toHaveProperty('scopeKeyVersion');
    expect(forged).not.toHaveProperty('scopeComplete');
    expect(forged).not.toHaveProperty('runtimeScopeStatus');
    expect(forged).not.toHaveProperty('runtimeScopeMissing');
  });
});
