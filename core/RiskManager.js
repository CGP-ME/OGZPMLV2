'use strict';

const PnLTracker = require('./PnLTracker');
const DrawdownTracker = require('./DrawdownTracker');

class RiskManager {
  constructor(reconciliationReporter) {
    this.reconciliationReporter = reconciliationReporter;
    this.pnlTracker = new PnLTracker();
    this.drawdownTracker = new DrawdownTracker();
    this.alertsTriggered = [];
    this.reconciliationReports = [];

    console.log('[RiskManager] Initialized reconciliation reporter');
  }

  initializeBalance(balance, context = {}) {
    this.pnlTracker.initialize(balance, context.sessionId || context.session || 'default');
    this.drawdownTracker.initialize(balance);
    console.log(`[RiskManager] Own-fill balance initialized: $${Number(balance).toFixed(2)}`);
  }

  recordTradeResult(trade = {}) {
    const recorded = this.pnlTracker.recordTrade(trade);
    if (recorded.recorded) {
      this.drawdownTracker.recordConfirmedPnl(recorded.fill.pnl);
    }
    return recorded;
  }

  reportExternalLedgerDelta(externalLedger = {}) {
    const own = this.pnlTracker.getState();
    const externalBalance = Number(externalLedger.balance ?? externalLedger.equity);
    const source = externalLedger.source || externalLedger.venue || 'external_ledger';
    const report = {
      source,
      ownBalance: own.currentBalance,
      externalBalance: Number.isFinite(externalBalance) ? externalBalance : null,
      deltaDollars: Number.isFinite(externalBalance) ? externalBalance - own.currentBalance : null,
      timestamp: new Date().toISOString(),
      authority: 'report_only',
    };

    this.reconciliationReports.push(report);
    if (this.reconciliationReports.length > 100) this.reconciliationReports.shift();

    if (this.reconciliationReporter.enabled) {
      const dollars = Math.abs(report.deltaDollars ?? 0);
      const percent = own.currentBalance > 0 && report.deltaDollars !== null
        ? Math.abs(report.deltaDollars / own.currentBalance) * 100
        : null;
      const dollarLimit = this.reconciliationReporter.alertDeltaDollars;
      const percentLimit = this.reconciliationReporter.alertDeltaPercent;
      const dollarBreach = dollarLimit !== null && dollars >= dollarLimit;
      const percentBreach = percentLimit !== null && percent !== null && percent >= percentLimit;
      if (dollarBreach || percentBreach) {
        this._triggerAlert(
          'reconciliation_delta',
          `[RiskManager] Reconciliation delta from ${source}: own=${own.currentBalance}, external=${report.externalBalance}, delta=${report.deltaDollars}`
        );
      }
    }

    return report;
  }

  getPositionSizeMultiplier() {
    return null;
  }

  getRiskSummary() {
    return {
      ...this.pnlTracker.getState(),
      ...this.drawdownTracker.getState(),
      reconciliationReports: [...this.reconciliationReports],
    };
  }

  reset(newBalance = null, context = {}) {
    this.pnlTracker.reset(newBalance, context.sessionId || context.session || 'default');
    this.drawdownTracker.reset(newBalance);
    this.alertsTriggered = [];
    this.reconciliationReports = [];
  }

  shutdown() {
    console.log('[RiskManager] Shutdown complete');
  }

  _triggerAlert(type, message) {
    const now = Date.now();
    const recentSame = this.alertsTriggered.find(a => a.type === type && (now - a.timestamp) < 300000);
    if (!recentSame) {
      const alert = { type, message, timestamp: now };
      this.alertsTriggered.push(alert);
      console.warn(`[RiskManager] ALERT: ${type} - ${message}`);
      if (this.alertsTriggered.length > 50) this.alertsTriggered.shift();
    }
  }
}

module.exports = RiskManager;
