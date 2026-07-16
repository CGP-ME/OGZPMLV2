'use strict';

const RISK_MANAGER_CONFIG_BRAND = Symbol('OGZPrime.RiskManagerConfig');
const VALID_GUARD_MODES = Object.freeze(new Set(['off', 'venueRailBuffer']));
const VALID_SESSION_RISK_ACTIONS = Object.freeze(new Set(['halt', 'pause', 'reduce', 'tighten', 'alert']));

function requireRiskConfigObject(riskConfig) {
  if (!riskConfig || typeof riskConfig !== 'object' || Array.isArray(riskConfig)) {
    throw new Error('[RISK-CONFIG] RiskManager config requires ConfigLoader risk object');
  }
}

function requireExplicitRiskSource(riskSources, configPath) {
  const source = riskSources?.[`risk.${configPath}`];
  if (!source || source === 'default') {
    throw new Error(`[RISK-CONFIG] risk.${configPath} requires explicit profile source; got ${source || '(missing source)'}`);
  }
}

function readPath(root, configPath) {
  return configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), root);
}

function requireString(riskConfig, riskSources, configPath, allowedValues) {
  requireExplicitRiskSource(riskSources, configPath);
  const value = readPath(riskConfig, configPath);
  if (typeof value !== 'string' || (allowedValues && !allowedValues.has(value))) {
    const allowedText = allowedValues ? ` one of ${Array.from(allowedValues).join(', ')}` : '';
    throw new Error(`[RISK-CONFIG] risk.${configPath} must be${allowedText}; got ${value}`);
  }
  return value;
}

function requireBoolean(riskConfig, riskSources, configPath) {
  requireExplicitRiskSource(riskSources, configPath);
  const value = readPath(riskConfig, configPath);
  if (typeof value !== 'boolean') {
    throw new Error(`[RISK-CONFIG] risk.${configPath} must be boolean; got ${value}`);
  }
  return value;
}

function requireNullablePercent(riskConfig, riskSources, configPath, { requiredWhenEnabled = false, enabled = false } = {}) {
  requireExplicitRiskSource(riskSources, configPath);
  const value = readPath(riskConfig, configPath);
  if (value === null && !(requiredWhenEnabled && enabled)) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`[RISK-CONFIG] risk.${configPath} must be a percent from 0 to 100${requiredWhenEnabled && enabled ? '' : ' or null'}; got ${value}`);
  }
  return value;
}

function requireNullableNonNegativeNumber(riskConfig, riskSources, configPath) {
  requireExplicitRiskSource(riskSources, configPath);
  const value = readPath(riskConfig, configPath);
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`[RISK-CONFIG] risk.${configPath} must be a non-negative number or null; got ${value}`);
  }
  return value;
}

function requirePlainObject(riskConfig, riskSources, configPath) {
  requireExplicitRiskSource(riskSources, configPath);
  const value = readPath(riskConfig, configPath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[RISK-CONFIG] risk.${configPath} must be an object; got ${value}`);
  }
  return JSON.parse(JSON.stringify(value));
}

function buildRiskManagerConfig(riskConfig, sources = {}) {
  requireRiskConfigObject(riskConfig);
  const riskSources = {
    'risk.guardMode': sources['risk.guardMode'],
    'risk.venueRailBuffer.enabled': sources['risk.venueRailBuffer.enabled'],
    'risk.venueRailBuffer.railDrawdownPercent': sources['risk.venueRailBuffer.railDrawdownPercent'],
    'risk.venueRailBuffer.triggerPercent': sources['risk.venueRailBuffer.triggerPercent'],
    'risk.venueRailBuffer.releaseOnSessionReset': sources['risk.venueRailBuffer.releaseOnSessionReset'],
    'risk.reconciliationReporter.enabled': sources['risk.reconciliationReporter.enabled'],
    'risk.reconciliationReporter.alertDeltaDollars': sources['risk.reconciliationReporter.alertDeltaDollars'],
    'risk.reconciliationReporter.alertDeltaPercent': sources['risk.reconciliationReporter.alertDeltaPercent'],
    'risk.sessionRiskResponse.enabled': sources['risk.sessionRiskResponse.enabled'],
    'risk.sessionRiskResponse.triggerPercent': sources['risk.sessionRiskResponse.triggerPercent'],
    'risk.sessionRiskResponse.action': sources['risk.sessionRiskResponse.action'],
    'risk.sessionRiskResponse.actionParams': sources['risk.sessionRiskResponse.actionParams'],
  };

  const guardMode = requireString(riskConfig, riskSources, 'guardMode', VALID_GUARD_MODES);
  const venueRailEnabled = requireBoolean(riskConfig, riskSources, 'venueRailBuffer.enabled');
  const sessionRiskResponseEnabled = requireBoolean(riskConfig, riskSources, 'sessionRiskResponse.enabled');

  const config = {
    guardMode,
    venueRailBuffer: Object.freeze({
      enabled: venueRailEnabled,
      railDrawdownPercent: requireNullablePercent(riskConfig, riskSources, 'venueRailBuffer.railDrawdownPercent', {
        requiredWhenEnabled: true,
        enabled: venueRailEnabled,
      }),
      triggerPercent: requireNullablePercent(riskConfig, riskSources, 'venueRailBuffer.triggerPercent', {
        requiredWhenEnabled: true,
        enabled: venueRailEnabled,
      }),
      releaseOnSessionReset: requireBoolean(riskConfig, riskSources, 'venueRailBuffer.releaseOnSessionReset'),
    }),
    reconciliationReporter: Object.freeze({
      enabled: requireBoolean(riskConfig, riskSources, 'reconciliationReporter.enabled'),
      alertDeltaDollars: requireNullableNonNegativeNumber(riskConfig, riskSources, 'reconciliationReporter.alertDeltaDollars'),
      alertDeltaPercent: requireNullablePercent(riskConfig, riskSources, 'reconciliationReporter.alertDeltaPercent'),
    }),
    sessionRiskResponse: Object.freeze({
      enabled: sessionRiskResponseEnabled,
      triggerPercent: requireNullablePercent(riskConfig, riskSources, 'sessionRiskResponse.triggerPercent', {
        requiredWhenEnabled: true,
        enabled: sessionRiskResponseEnabled,
      }),
      action: requireString(riskConfig, riskSources, 'sessionRiskResponse.action', VALID_SESSION_RISK_ACTIONS),
      actionParams: Object.freeze(requirePlainObject(riskConfig, riskSources, 'sessionRiskResponse.actionParams')),
    }),
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
