'use strict';

function cleanRequired(value, name, missing) {
  if (value === null || value === undefined) {
    missing.push(name);
    return null;
  }
  const cleaned = String(value).trim();
  if (!cleaned) {
    missing.push(name);
    return null;
  }
  return cleaned;
}

function normalizeSymbol(symbol) {
  return String(symbol).trim().toUpperCase().replace('XBT', 'BTC').split('/').join('-');
}

function normalizePatternScope(input = {}, caller = 'PatternScope') {
  const missing = [];
  const rawSymbol = cleanRequired(input.symbol ?? input.tradingPair, 'symbol', missing);
  const rawBrokerId = cleanRequired(input.brokerId ?? input.broker, 'brokerId', missing);
  const rawAccountId = cleanRequired(input.accountId, 'accountId', missing);
  const rawAssetClass = cleanRequired(input.assetClass, 'assetClass', missing);
  const rawExecutionMode = cleanRequired(input.executionMode ?? input.mode ?? input.tradingMode, 'executionMode', missing);
  const rawTimeframe = cleanRequired(input.timeframe ?? input.candleTimeframe, 'timeframe', missing);

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'PATTERN_SCOPE_REJECTED',
      reason: `${caller} missing immutable pattern scope field(s): ${missing.join(', ')}`,
      missingFields: missing
    };
  }

  const symbol = normalizeSymbol(rawSymbol);
  const brokerId = rawBrokerId.toLowerCase();
  const accountId = rawAccountId;
  const rawAccountIdSource = input.accountIdSource !== null && input.accountIdSource !== undefined
    ? String(input.accountIdSource).trim()
    : '';
  const accountIdSource = rawAccountIdSource || (accountId !== 'default' ? 'scope' : 'default');
  const assetClass = rawAssetClass.toLowerCase();
  const executionMode = rawExecutionMode.toLowerCase();
  const timeframe = rawTimeframe;
  const scopeKey = `${executionMode}:${brokerId}:${accountId}:${assetClass}:${symbol}:${timeframe}`;
  const suppliedScopeKey = input.scopeKey !== null && input.scopeKey !== undefined
    ? String(input.scopeKey).trim()
    : '';

  if (suppliedScopeKey && suppliedScopeKey !== scopeKey) {
    return {
      ok: false,
      code: 'PATTERN_SCOPE_REJECTED',
      reason: `${caller} scopeKey mismatch: supplied ${suppliedScopeKey} expected ${scopeKey}`,
      missingFields: [],
      suppliedScopeKey,
      expectedScopeKey: scopeKey
    };
  }

  return {
    ok: true,
    symbol,
    brokerId,
    accountId,
    accountIdSource,
    assetClass,
    executionMode,
    timeframe,
    scopeKey,
    scopeKeyVersion: 2,
    scopeComplete: Boolean(accountId && accountId !== 'default' && accountIdSource !== 'default')
  };
}

function requirePatternScope(input = {}, caller = 'PatternScope') {
  const scope = normalizePatternScope(input, caller);
  if (scope.ok) return scope;
  const error = new Error(scope.reason);
  error.code = scope.code;
  error.missingFields = scope.missingFields || [];
  error.suppliedScopeKey = scope.suppliedScopeKey;
  error.expectedScopeKey = scope.expectedScopeKey;
  throw error;
}

module.exports = {
  normalizePatternScope,
  requirePatternScope
};
