'use strict';

const EXIT_CONTRACT_OVERRIDE_PATH = /^exitContracts\.[A-Za-z0-9_]+\.(stopLossPercent|takeProfitPercent|trailingStopPercent|trailingActivation|maxHoldTimeMinutes)$/;
const CONFIDENCE_OVERRIDE_PATH = 'confidence.minTradeConfidence';
const BROKER_TIMEFRAME_OVERRIDE_PATH = 'broker.candleTimeframe';
const STRATEGY_PARAM_OVERRIDE_PATH = /^strategies\.[A-Za-z0-9_]+\.[A-Za-z0-9_.]+$/;
const MTF_SERVICE_MIN_READY_PATH = 'orchestrator.mtfConfluenceService.minReadyTimeframes';

function validateStrategyParamOverride(path, value) {
  if (path.endsWith('.confluenceBoost.enabled')) {
    if (typeof value !== 'boolean') {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be boolean`);
    }
    return value;
  }
  if (path.endsWith('.confluenceBoost.weight')) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be a finite non-negative number`);
    }
    return numericValue;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be finite (got ${value})`);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be a non-empty string`);
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be a scalar strategy parameter`);
}

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
    if (
      !EXIT_CONTRACT_OVERRIDE_PATH.test(path) &&
      path !== CONFIDENCE_OVERRIDE_PATH &&
      path !== BROKER_TIMEFRAME_OVERRIDE_PATH &&
      path !== MTF_SERVICE_MIN_READY_PATH &&
      !STRATEGY_PARAM_OVERRIDE_PATH.test(path)
    ) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] Unsupported path '${path}'`);
    }
    if (path === BROKER_TIMEFRAME_OVERRIDE_PATH) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be a non-empty string`);
      }
      validated[path] = value;
      continue;
    }
    if (path === MTF_SERVICE_MIN_READY_PATH) {
      const numericValue = Number(value);
      if (!Number.isInteger(numericValue) || numericValue < 1) {
        throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be a positive integer`);
      }
      validated[path] = numericValue;
      continue;
    }
    if (STRATEGY_PARAM_OVERRIDE_PATH.test(path)) {
      validated[path] = validateStrategyParamOverride(path, value);
      continue;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} must be finite (got ${value})`);
    }
    if (path === CONFIDENCE_OVERRIDE_PATH && (numericValue < 0 || numericValue > 1)) {
      throw new Error(`[BACKTEST-CONFIG-OVERRIDES] ${path} out of range: ${value}`);
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
  const {
    tradingConfig,
    isBacktest = false,
    executionMode = null,
    candleSource = null,
    liveTrading = false,
  } = options;
  if (!tradingConfig || typeof tradingConfig.applyBacktestConfigOverrides !== 'function') {
    throw new Error('[BACKTEST-CONFIG-OVERRIDES] tradingConfig.applyBacktestConfigOverrides is required');
  }
  tradingConfig.applyBacktestConfigOverrides(overrides, {
    source: 'BacktestConfigOverrides',
    isBacktest,
    executionMode,
    candleSource,
    liveTrading,
  });
  return overrides;
}

module.exports = {
  parseBacktestConfigOverrides,
  applyBacktestConfigOverrides,
};
