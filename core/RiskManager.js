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
    const { brokerId, accountId, accountIdSource, executionMode, brokerExecutionMode, metric } = externalLedger;
    const scope = { brokerId, accountId, accountIdSource, executionMode };
    const sameScope = (value) => value.brokerId === brokerId && value.accountId === accountId && value.executionMode === executionMode;
    const verifiedIdentity = (value) => typeof value.accountId === 'string' && value.accountId.length > 0 &&
      typeof value.accountIdSource === 'string' && value.accountIdSource.startsWith('broker:');
    const previous = [...this.reconciliationReports].reverse().find((value) =>
      sameScope(value.scope) && value.metric === metric && value.baseline !== null);
    const report = {
      source: externalLedger.source,
      scope,
      brokerExecutionMode,
      metric,
      comparison: 'flat_account_change_since_observation',
      status: 'non_comparable',
      reason: null,
      ownBalance: null,
      externalBalance: Number.isFinite(externalLedger.balance) ? externalLedger.balance : null,
      deltaDollars: null,
      baseline: previous ? previous.baseline : null,
      matchedFills: [],
      excludedFillCount: 0,
      alertTriggered: false,
      timestamp: new Date().toISOString(),
      authority: 'report_only',
    };

    if (executionMode !== 'live' || brokerExecutionMode !== 'live') {
      report.reason = 'execution_is_not_live_broker_trading';
    } else if (!verifiedIdentity(scope)) {
      report.reason = 'broker_account_identity_unverified';
    } else if (metric !== 'USD_cash' || report.externalBalance === null) {
      report.reason = 'broker_usd_cash_not_supplied';
    } else if (externalLedger.localFlat !== true || externalLedger.brokerFlat !== true) {
      report.reason = 'positions_or_orders_not_flat';
    } else if (report.baseline === null) {
      report.status = 'baseline_only';
      report.reason = 'no_prior_flat_account_observation';
      report.baseline = {
        balance: report.externalBalance,
        tradeHistoryStartIndex: this.pnlTracker.tradeHistory.length,
        timestamp: report.timestamp,
      };
    } else {
      const fills = this.pnlTracker.tradeHistory.slice(report.baseline.tradeHistoryStartIndex);
      const unknownFill = fills.some((fill) => fill.simulated !== true && (
        fill.simulated !== false || !verifiedIdentity(fill) || !fill.brokerId || fill.executionMode !== 'live' ||
        (sameScope(fill) && !Number.isFinite(fill.reconciliationPnl))
      ));
      if (unknownFill) {
        report.reason = 'post_baseline_fill_account_or_net_pnl_unproven';
      } else {
        report.matchedFills = fills.filter((fill) => fill.simulated === false && sameScope(fill))
          .map((fill) => ({ fillId: fill.fillId, tradeId: fill.tradeId, symbol: fill.symbol, netPnl: fill.reconciliationPnl }));
        report.excludedFillCount = fills.length - report.matchedFills.length;
        report.ownBalance = report.baseline.balance + report.matchedFills.reduce((sum, fill) => sum + fill.netPnl, 0);
        report.deltaDollars = report.externalBalance - report.ownBalance;
        report.status = 'compared';
      }
    }

    if (this.reconciliationReporter.enabled && report.status === 'compared') {
      const dollars = Math.abs(report.deltaDollars);
      const percent = report.ownBalance > 0 ? dollars / report.ownBalance * 100 : null;
      const dollarLimit = this.reconciliationReporter.alertDeltaDollars;
      const percentLimit = this.reconciliationReporter.alertDeltaPercent;
      report.alertTriggered = (dollarLimit !== null && dollars >= dollarLimit) ||
        (percentLimit !== null && percent !== null && percent >= percentLimit);
      if (report.alertTriggered) {
        this._triggerAlert('reconciliation_delta',
          `[RiskManager] Reconciliation delta from ${report.source}: expected=${report.ownBalance}, external=${report.externalBalance}, delta=${report.deltaDollars}`);
      }
    }

    this.reconciliationReports.push(report);
    if (this.reconciliationReports.length > 100) this.reconciliationReports.shift();
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
