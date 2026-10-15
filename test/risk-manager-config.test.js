'use strict';

const fs = require('fs');
const path = require('path');

const RiskManager = require('../core/RiskManager');





describe('RiskManager reconciliation reporting', () => {












  test('external ledger reconciliation reports deltas but cannot mutate own balance', () => {
    const riskManager = new RiskManager({ enabled: true, alertDeltaDollars: 1, alertDeltaPercent: 0.1 });
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

    expect(source).toContain('new RiskManager(resolvedConfig.config.risk.reconciliationReporter)');
    expect(source).toContain('resolvedConfig.config.risk');
    expect(source).not.toContain('RISK_MANAGER_BYPASS');
  });
});
