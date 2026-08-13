'use strict';

const fs = require('fs');
const path = require('path');

const { buildRiskManagerConfig } = require('../core/RiskManagerConfig');
const RiskManager = require('../core/RiskManager');

const explicitRiskSources = Object.freeze({
  'risk.guardMode': 'config:launchProfiles.production.risk.guardMode',
  'risk.venueRailBuffer.enabled': 'config:launchProfiles.production.risk.venueRailBuffer.enabled',
  'risk.venueRailBuffer.railDrawdownPercent': 'config:launchProfiles.production.risk.venueRailBuffer.railDrawdownPercent',
  'risk.venueRailBuffer.triggerPercent': 'config:launchProfiles.production.risk.venueRailBuffer.triggerPercent',
  'risk.venueRailBuffer.releaseOnSessionReset': 'config:launchProfiles.production.risk.venueRailBuffer.releaseOnSessionReset',
  'risk.reconciliationReporter.enabled': 'config:launchProfiles.production.risk.reconciliationReporter.enabled',
  'risk.reconciliationReporter.alertDeltaDollars': 'config:launchProfiles.production.risk.reconciliationReporter.alertDeltaDollars',
  'risk.reconciliationReporter.alertDeltaPercent': 'config:launchProfiles.production.risk.reconciliationReporter.alertDeltaPercent',
  'risk.sessionRiskResponse.enabled': 'config:launchProfiles.production.risk.sessionRiskResponse.enabled',
  'risk.sessionRiskResponse.triggerPercent': 'config:launchProfiles.production.risk.sessionRiskResponse.triggerPercent',
  'risk.sessionRiskResponse.action': 'config:launchProfiles.production.risk.sessionRiskResponse.action',
  'risk.sessionRiskResponse.actionParams': 'config:launchProfiles.production.risk.sessionRiskResponse.actionParams',
});

function activeRiskConfig(overrides = {}) {
  return {
    guardMode: 'venueRailBuffer',
    venueRailBuffer: {
      enabled: true,
      railDrawdownPercent: 3,
      triggerPercent: 0.25,
      releaseOnSessionReset: true,
      ...(overrides.venueRailBuffer || {}),
    },
    reconciliationReporter: {
      enabled: true,
      alertDeltaDollars: 1,
      alertDeltaPercent: 0.1,
      ...(overrides.reconciliationReporter || {}),
    },
    sessionRiskResponse: {
      enabled: false,
      triggerPercent: null,
      action: 'alert',
      actionParams: {},
      ...(overrides.sessionRiskResponse || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => ![
      'venueRailBuffer',
      'reconciliationReporter',
      'sessionRiskResponse',
    ].includes(key))),
  };
}

describe('RiskManager guard rebuild wiring', () => {
  test('maps explicit profile-owned guard config into RiskManager', () => {
    const config = buildRiskManagerConfig(activeRiskConfig(), explicitRiskSources);

    expect(config.guardMode).toBe('venueRailBuffer');
    expect(config.venueRailBuffer).toEqual({
      enabled: true,
      railDrawdownPercent: 3,
      triggerPercent: 0.25,
      releaseOnSessionReset: true,
    });
    expect(config.reconciliationReporter.enabled).toBe(true);
    expect(config.sessionRiskResponse).toEqual({
      enabled: false,
      triggerPercent: null,
      action: 'alert',
      actionParams: {},
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('fails loud when a profile omits required guard surfaces', () => {
    expect(() => buildRiskManagerConfig({
      ...activeRiskConfig(),
      guardMode: undefined,
    }, explicitRiskSources)).toThrow(/risk\.guardMode must be/);

    expect(() => buildRiskManagerConfig(activeRiskConfig(), {
      ...explicitRiskSources,
      'risk.venueRailBuffer.triggerPercent': 'default',
    })).toThrow(/risk\.venueRailBuffer\.triggerPercent requires explicit profile source/);

    expect(() => buildRiskManagerConfig(activeRiskConfig({
      venueRailBuffer: { triggerPercent: null },
    }), explicitRiskSources)).toThrow(/risk\.venueRailBuffer\.triggerPercent must be a percent/);
  });

  test('venue rail buffer fires from own confirmed fills without an external anchor', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig(activeRiskConfig(), explicitRiskSources));
    riskManager.initializeBalance(5000, { sessionId: 'stocks-2026-07-16' });
    riskManager.recordTradeResult({
      success: false,
      pnl: -138,
      symbol: 'TSLA',
      strategy: 'fixture_strategy',
      venue: 'stocks',
      sessionId: 'stocks-2026-07-16',
    });

    const result = riskManager.isTradingAllowed({
      venue: 'stocks',
      sessionId: 'stocks-2026-07-16',
    });

    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      blockType: 'VENUE_RAIL_BUFFER',
    }));
    expect(result.riskGates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gate: 'venue_rail_buffer',
        passed: false,
      }),
    ]));
    expect(result.reason).toMatch(/Trey drawdown law/);
  });

  test('venue rail buffer releases on session reset', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig(activeRiskConfig(), explicitRiskSources));
    riskManager.initializeBalance(5000, { sessionId: 'stocks-day-1' });
    riskManager.recordTradeResult({ success: false, pnl: -138, venue: 'stocks', sessionId: 'stocks-day-1' });
    expect(riskManager.isTradingAllowed({ venue: 'stocks', sessionId: 'stocks-day-1' }).allowed).toBe(false);

    expect(riskManager.isTradingAllowed({ venue: 'stocks', sessionId: 'stocks-day-2' })).toEqual(expect.objectContaining({
      allowed: false,
    }));
    expect(Array.from(riskManager.railLocks.keys())).toEqual(['stocks:stocks-day-2']);
  });

  test('guardMode off is a named law, not a bypass, and leaves backtest-style profiles open', () => {
    const config = buildRiskManagerConfig(activeRiskConfig({
      guardMode: 'off',
      venueRailBuffer: {
        enabled: false,
        railDrawdownPercent: null,
        triggerPercent: null,
      },
      reconciliationReporter: {
        enabled: false,
        alertDeltaDollars: null,
        alertDeltaPercent: null,
      },
    }), explicitRiskSources);
    const riskManager = new RiskManager(config);

    riskManager.initializeBalance(5000);
    riskManager.recordTradeResult({ success: false, pnl: -4999, venue: 'stocks' });

    expect(riskManager.isTradingAllowed()).toEqual(expect.objectContaining({
      allowed: true,
      riskGates: [expect.objectContaining({ gate: 'trey_drawdown_law', threshold: 'profile_guard_off' })],
    }));
  });

  test('non-finite confidence refusal names the producer and inputs', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig(activeRiskConfig(), explicitRiskSources));
    const result = riskManager.assessTradeRisk({
      confidence: Number.NaN,
      strategyName: 'BadStrategy',
      symbol: 'TSLA',
    }, {
      candleCount: 200,
      venue: 'stocks',
    });

    expect(result.approved).toBe(false);
    expect(result.blockType).toBe('INVALID_CONFIDENCE_PRODUCER');
    expect(result.producer).toBe('BadStrategy');
    expect(result.reason).toContain('BadStrategy');
    expect(result.reason).toContain('candleCount');
    expect(result.riskGates[0]).toEqual(expect.objectContaining({
      gate: 'confidence_validity',
      producer: 'BadStrategy',
      passed: false,
    }));
  });

  test('external ledger reconciliation reports deltas but cannot mutate own balance', () => {
    const riskManager = new RiskManager(buildRiskManagerConfig(activeRiskConfig(), explicitRiskSources));
    riskManager.initializeBalance(5000);
    riskManager.recordTradeResult({ success: true, pnl: 25, venue: 'stocks' });

    const before = riskManager.getRiskSummary().currentBalance;
    const report = riskManager.reportExternalLedgerDelta({ source: 'ttp', balance: 4900 });
    const after = riskManager.getRiskSummary().currentBalance;

    expect(report).toEqual(expect.objectContaining({
      source: 'ttp',
      ownBalance: 5025,
      externalBalance: 4900,
      deltaDollars: -125,
      authority: 'report_only',
    }));
    expect(after).toBe(before);
    expect(typeof riskManager.updateBalance).toBe('undefined');
  });

  test('killed risk mechanisms are absent from runtime authority files', () => {
    const files = [
      'core/RiskManager.js',
      'core/RiskManagerConfig.js',
      'core/PnLTracker.js',
      'core/DrawdownTracker.js',
      'core/StateManager.js',
      'core/PerformanceDashboardIntegration.js',
      'foundation/ConfigLoader.js',
      'config/trading.config.json',
      'ogz-meta/gates/multi-runtime-gate-runner.js',
    ];
    const forbidden = [
      /\briskManagerBypass\b/,
      /\baccountDrawdownBypass\b/,
      /\bmaxDailyLoss\b/,
      /\bmaxWeeklyLoss\b/,
      /\bmaxMonthlyLoss\b/,
      /\brecoveryModeReduction\b/,
      /\bupdateBalance\s*\(/,
      /\bsetBalance\s*\(/,
      /\bsetRecoveryMode\s*\(/,
      /\bRECOVERY_MODE\b/,
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });

  test('run-empire constructs RiskManager from canonical ConfigLoader risk block', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');

    expect(source).toContain('new RiskManager(buildRiskManagerConfig(');
    expect(source).toContain('resolvedConfig.config.risk');
    expect(source).toContain('resolvedConfig.sources');
    expect(source).toContain('RISK_GUARD_MODE');
    expect(source).not.toContain('RISK_MANAGER_BYPASS');
  });
});
