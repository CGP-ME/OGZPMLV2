'use strict';

const ALLOWED_OVERRIDE_PATH = /^exitContracts\.[A-Za-z0-9_]+\.(stopLossPercent|takeProfitPercent|trailingStopPercent|trailingActivation|maxHoldTimeMinutes)$/;

function parseBacktestConfigOverrides(raw, options = {}) {
  const {
    isBacktest = false,
    executionMode = null,
    candleSource = null,
    liveTrading = false,
  } = options;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  if (
    !isBacktest ||
    String(executionMode || '').toLowerCase() !== 'backtest' ||
    String(candleSource || '').toLowerCase() !== 'file' ||
    liveTrading === true
  ) {
    throw new Error('[BACKTEST-CONFIG-OVERRIDES] Refusing BACKTEST_CONFIG_OVERRIDES_JSON outside file-backed EXECUTION_MODE=backtest');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`[BACKTEST-CONFIG-OVERRIDES] Invalid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[BACKTEST-CONFIG-OVERRIDES] Payload must be a flat object');
  }

  const validated = {};
  for (const [path, value] of Object.entries(parsed)) {
    if (!ALLOWED_OVERRIDE_PATH.test(path)) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] Unsupported path '${path}'`);
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be finite (got ${value})`);
    }
    if (path.endsWith('.stopLossPercent') && numericValue >= 0) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be negative percent-form (got ${value})`);
    }
    if ((path.endsWith('.takeProfitPercent') || path.endsWith('.trailingStopPercent') || path.endsWith('.maxHoldTimeMinutes')) && numericValue <= 0) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be positive (got ${value})`);
    }
    if (path.endsWith('.trailingActivation') && numericValue < 0) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be non-negative (got ${value})`);
    }
    validated[path] = numericValue;
  }

  return validated;
}

function applyBacktestConfigOverrides(raw, options = {}) {
  const overrides = parseBacktestConfigOverrides(raw, options);
  if (!overrides) return null;
  const { tradingConfig } = options;
  if (!tradingConfig || typeof tradingConfig.setOverrides !== 'function') {
    throw new Error('[BACKTEST-CONFIG-OVERRIDES] tradingConfig.setOverrides is required');
  }
  tradingConfig.setOverrides(overrides);
  return overrides;
}

module.exports = {
  parseBacktestConfigOverrides,
  applyBacktestConfigOverrides,
};
