'use strict';

const { normalizePatternScope } = require('../core/PatternScope');

const MARKET_SCOPE_FIELDS = Object.freeze([
  'symbol',
  'broker',
  'brokerId',
  'accountId',
  'accountIdSource',
  'assetClass',
  'executionMode',
  'timeframe',
  'scopeKey',
  'scopeKeyVersion',
  'scopeComplete',
  'runtimeScopeStatus',
  'runtimeScopeMissing'
]);

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeMarketSymbol(value) {
  const text = cleanText(value);
  if (!text) return null;
  return text.toUpperCase().replace('XBT', 'BTC').split('/').join('-');
}

function normalizeMarketText(value) {
  const text = cleanText(value);
  return text ? text.toLowerCase() : null;
}

function extractRuntimeScope(stateUpdateFrame) {
  if (!stateUpdateFrame || typeof stateUpdateFrame !== 'object') return null;
  const direct = stateUpdateFrame.runtimeScope;
  if (direct && typeof direct === 'object') return direct;
  const nested = stateUpdateFrame.state && stateUpdateFrame.state.runtimeScope;
  return nested && typeof nested === 'object' ? nested : null;
}

function symbolAllowed(symbol, allowedSymbols = []) {
  if (!Array.isArray(allowedSymbols) || allowedSymbols.length === 0) return false;
  const normalized = normalizeMarketSymbol(symbol);
  return allowedSymbols.some(allowed => normalizeMarketSymbol(allowed) === normalized);
}

function positiveTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function reject(reason, details = {}) {
  return {
    ok: false,
    reason,
    scope: null,
    ...details
  };
}

function buildDashboardMarketScope(options = {}) {
  const symbol = normalizeMarketSymbol(options.symbol);
  if (!symbol) return reject('missing_symbol');
  if (!Array.isArray(options.allowedSymbols) || options.allowedSymbols.length === 0) {
    return reject('allowed_symbols_missing', { symbol });
  }
  if (!symbolAllowed(symbol, options.allowedSymbols)) {
    return reject('symbol_not_allowed', { symbol });
  }

  const runtimeScope = extractRuntimeScope(options.stateUpdateFrame);
  if (!runtimeScope) return reject('runtime_scope_unset', { symbol });
  const stateUpdateTimestamp = positiveTimestamp(options.stateUpdateFrame?.timestamp);
  if (stateUpdateTimestamp === null) {
    return reject('runtime_scope_timestamp_missing', { symbol });
  }
  if (runtimeScope.scopeComplete !== true) {
    return reject('runtime_scope_incomplete', {
      symbol,
      runtimeScopeMissing: Array.isArray(runtimeScope.missingFields)
        ? [...runtimeScope.missingFields]
        : []
    });
  }
  if (runtimeScope.scopeKeyVersion !== 2 || !cleanText(runtimeScope.scopeKey)) {
    return reject('runtime_scope_invalid', {
      symbol,
      error: 'runtimeScope missing v2 scopeKey'
    });
  }

  const runtimeValidation = normalizePatternScope(runtimeScope, 'DashboardMarketScope.runtimeScope');
  if (!runtimeValidation.ok || runtimeValidation.scopeComplete !== true) {
    return reject('runtime_scope_invalid', {
      symbol,
      missingFields: runtimeValidation.missingFields || [],
      error: runtimeValidation.reason || 'runtimeScope incomplete after validation'
    });
  }

  const brokerId = normalizeMarketText(options.brokerId);
  const assetClass = normalizeMarketText(options.assetClass);
  const executionMode = normalizeMarketText(options.executionMode);
  const runtimeBrokerId = runtimeValidation.brokerId;
  const runtimeAssetClass = runtimeValidation.assetClass;
  const runtimeExecutionMode = runtimeValidation.executionMode;
  const missing = [];

  if (!brokerId) missing.push('brokerId');
  if (!assetClass) missing.push('assetClass');
  if (!executionMode) missing.push('executionMode');
  if (!runtimeBrokerId) missing.push('runtimeScope.brokerId');
  if (!runtimeAssetClass) missing.push('runtimeScope.assetClass');
  if (!runtimeExecutionMode) missing.push('runtimeScope.executionMode');
  if (missing.length > 0) return reject('market_scope_missing_field', { symbol, missingFields: missing });

  const mismatches = [];
  if (brokerId !== runtimeBrokerId) mismatches.push('brokerId');
  if (assetClass !== runtimeAssetClass) mismatches.push('assetClass');
  if (executionMode !== runtimeExecutionMode) mismatches.push('executionMode');
  if (mismatches.length > 0) {
    return reject('runtime_scope_producer_mismatch', {
      symbol,
      mismatches,
      producer: { brokerId, assetClass, executionMode },
      runtime: {
        brokerId: runtimeBrokerId,
        assetClass: runtimeAssetClass,
        executionMode: runtimeExecutionMode
      }
    });
  }

  const timeframe = cleanText(options.timeframe) || cleanText(runtimeScope.timeframe);
  const normalized = normalizePatternScope({
    symbol,
    brokerId: runtimeBrokerId,
    accountId: runtimeScope.accountId,
    accountIdSource: runtimeScope.accountIdSource,
    assetClass: runtimeAssetClass,
    executionMode: runtimeExecutionMode,
    timeframe
  }, 'DashboardMarketScope');

  if (!normalized.ok) {
    return reject('market_scope_invalid', {
      symbol,
      missingFields: normalized.missingFields || [],
      error: normalized.reason
    });
  }
  if (normalized.scopeComplete !== true) {
    return reject('market_scope_incomplete', {
      symbol,
      missingFields: ['accountId']
    });
  }

  return {
    ok: true,
    reason: null,
    scope: {
      symbol: normalized.symbol,
      broker: normalized.brokerId,
      brokerId: normalized.brokerId,
      accountId: normalized.accountId,
      accountIdSource: normalized.accountIdSource,
      assetClass: normalized.assetClass,
      executionMode: normalized.executionMode,
      timeframe: normalized.timeframe,
      scopeKey: normalized.scopeKey,
      scopeKeyVersion: normalized.scopeKeyVersion,
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      runtimeScopeMissing: []
    }
  };
}

function attachDashboardMarketScope(frame, scopeResult) {
  if (!frame || typeof frame !== 'object') return frame;
  if (!scopeResult || scopeResult.ok !== true || !scopeResult.scope) return frame;

  for (const field of MARKET_SCOPE_FIELDS) {
    if (scopeResult.scope[field] !== undefined) frame[field] = scopeResult.scope[field];
  }

  if (frame.data && typeof frame.data === 'object' && !Array.isArray(frame.data)) {
    for (const field of MARKET_SCOPE_FIELDS) {
      if (scopeResult.scope[field] !== undefined) frame.data[field] = scopeResult.scope[field];
    }
  }

  return frame;
}

module.exports = {
  attachDashboardMarketScope,
  buildDashboardMarketScope,
  extractRuntimeScope,
  normalizeMarketSymbol
};
