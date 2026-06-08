'use strict';

const RISK_MANAGER_CONFIG_BRAND = Symbol('OGZPrime.RiskManagerConfig');

function requireRiskConfigObject(riskConfig) {
  if (!riskConfig || typeof riskConfig !== 'object' || Array.isArray(riskConfig)) {
    throw new Error('[RISK-CONFIG] RiskManager config requires ConfigLoader risk object');
  }
}

function requireExplicitRiskSource(riskSources, key) {
  const source = riskSources?.[key];
  if (!source || source === 'default') {
    throw new Error(`[RISK-CONFIG] risk.${key} requires explicit env/profile source; got ${source || '(missing source)'}`);
  }
}

function requireWholePercentUnit(riskConfig, riskSources, key) {
  requireExplicitRiskSource(riskSources, key);
  const value = riskConfig[key];
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error(`[RISK-CONFIG] risk.${key} must be a whole-percent unit value from 1 to 100; got ${value}`);
  }
  return value;
}

function requireBoolean(riskConfig, riskSources, key) {
  requireExplicitRiskSource(riskSources, key);
  const value = riskConfig[key];
  if (typeof value !== 'boolean') {
    throw new Error(`[RISK-CONFIG] risk.${key} must be boolean; got ${value}`);
  }
  return value;
}

function buildRiskManagerConfig(riskConfig, sources = {}) {
  requireRiskConfigObject(riskConfig);
  const riskSources = {
    riskManagerBypass: sources['risk.riskManagerBypass'],
    maxDrawdown: sources['risk.maxDrawdown'],
    maxDailyLoss: sources['risk.maxDailyLoss'],
    maxWeeklyLoss: sources['risk.maxWeeklyLoss'],
    maxMonthlyLoss: sources['risk.maxMonthlyLoss'],
  };

  const config = {
    maxDrawdownPercent: requireWholePercentUnit(riskConfig, riskSources, 'maxDrawdown'),
    dailyLossLimitPercent: requireWholePercentUnit(riskConfig, riskSources, 'maxDailyLoss'),
    weeklyLossLimitPercent: requireWholePercentUnit(riskConfig, riskSources, 'maxWeeklyLoss'),
    monthlyLossLimitPercent: requireWholePercentUnit(riskConfig, riskSources, 'maxMonthlyLoss'),
    riskManagerBypass: requireBoolean(riskConfig, riskSources, 'riskManagerBypass'),
  };

  Object.defineProperty(config, RISK_MANAGER_CONFIG_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return Object.freeze(config);
}

function isRiskManagerConfig(config) {
  return Boolean(config && config[RISK_MANAGER_CONFIG_BRAND] === true);
}

module.exports = {
  buildRiskManagerConfig,
  isRiskManagerConfig,
};
