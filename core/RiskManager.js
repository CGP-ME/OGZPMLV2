'use strict';

const PnLTracker = require('./PnLTracker');
const DrawdownTracker = require('./DrawdownTracker');
const { isRiskManagerConfig } = require('./RiskManagerConfig');

function describeProducer(tradeParams = {}) {
  return tradeParams.strategyName ||
    tradeParams.strategy ||
    tradeParams.entryStrategy ||
    tradeParams.module ||
    tradeParams.source ||
    'unknown_strategy';
}

function scrubInputs(input = {}) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'function') continue;
    if (value && typeof value === 'object') continue;
    result[key] = value;
  }
  return result;
}

class RiskManager {
  constructor(config = {}) {
    if (!isRiskManagerConfig(config)) {
      throw new Error('[RISK-CONFIG] RiskManager requires config from buildRiskManagerConfig');
    }

    this.config = config;
    this.pnlTracker = new PnLTracker();
    this.drawdownTracker = new DrawdownTracker();
    this.alertsTriggered = [];
    this.reconciliationReports = [];
    this.railLocks = new Map();

    console.log(`[RiskManager] Initialized Trey drawdown-law seat (guardMode=${config.guardMode})`);
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

    if (this.config.reconciliationReporter.enabled) {
      const dollars = Math.abs(report.deltaDollars ?? 0);
      const percent = own.currentBalance > 0 && report.deltaDollars !== null
        ? Math.abs(report.deltaDollars / own.currentBalance) * 100
        : null;
      const dollarLimit = this.config.reconciliationReporter.alertDeltaDollars;
      const percentLimit = this.config.reconciliationReporter.alertDeltaPercent;
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

  assessTradeRisk(tradeParams = {}, context = {}) {
    const riskGates = [];
    const gate = (entry) => riskGates.push(entry);
    const { confidence } = tradeParams;

    if (!Number.isFinite(confidence)) {
      const producer = describeProducer(tradeParams);
      const inputs = scrubInputs({ ...tradeParams, ...context });
      const reason = `[RISK-HIGH-01] Non-finite confidence from ${producer}: confidence=${confidence}; inputs=${JSON.stringify(inputs)}`;
      gate({
        gate: 'confidence_validity',
        threshold: 'finite',
        value: confidence,
        passed: false,
        rejectReason: reason,
        producer,
      });
      return {
        approved: false,
        reason,
        riskLevel: 'CRITICAL',
        blockType: 'INVALID_CONFIDENCE_PRODUCER',
        producer,
        riskGates,
      };
    }

    const allowed = this.isTradingAllowed(context);
    riskGates.push(...(allowed.riskGates || []));
    if (!allowed.allowed) {
      return {
        approved: false,
        reason: allowed.reason,
        riskLevel: 'CRITICAL',
        blockType: allowed.blockType || 'VENUE_RAIL_BUFFER',
        riskGates,
      };
    }

    return {
      approved: true,
      riskLevel: 'LOW',
      riskScore: 0,
      confidence,
      recommendation: 'FULL_SIZE',
      riskGates,
    };
  }

  isTradingAllowed(context = {}) {
    const riskGates = [];

    if (this.config.guardMode === 'off' || !this.config.venueRailBuffer.enabled) {
      riskGates.push({
        gate: 'trey_drawdown_law',
        threshold: 'profile_guard_off',
        value: this.config.guardMode,
        passed: true,
      });
      return { allowed: true, riskGates };
    }

    const sessionId = context.sessionId || context.session || context.activeSession || 'default';
    const venue = context.venue || context.executionVenue || context.sessionVenue || 'default';
    const lockKey = `${venue}:${sessionId}`;
    for (const key of Array.from(this.railLocks.keys())) {
      if (key.startsWith(`${venue}:`) && key !== lockKey && this.config.venueRailBuffer.releaseOnSessionReset) {
        this.railLocks.delete(key);
      }
    }

    const existing = this.railLocks.get(lockKey);
    if (existing) {
      riskGates.push({
        gate: 'venue_rail_buffer',
        threshold: existing.threshold,
        value: existing.value,
        passed: false,
        rejectReason: existing.reason,
      });
      return {
        allowed: false,
        reason: existing.reason,
        blockType: 'VENUE_RAIL_BUFFER',
        riskGates,
      };
    }

    const state = this.pnlTracker.getState();
    const drawdownPercent = state.trailingDrawdownPercent;
    const railPercent = this.config.venueRailBuffer.railDrawdownPercent;
    const triggerPercent = this.config.venueRailBuffer.triggerPercent;
    const remainingToRail = railPercent - drawdownPercent;
    const passed = remainingToRail > triggerPercent;
    const reason = passed
      ? null
      : `Trey drawdown law: ${venue} drawdown ${drawdownPercent.toFixed(2)}% is within ${triggerPercent}% of ${railPercent}% rail`;

    riskGates.push({
      gate: 'venue_rail_buffer',
      threshold: triggerPercent,
      value: remainingToRail,
      passed,
      ...(reason ? { rejectReason: reason } : {}),
    });

    if (!passed) {
      this.railLocks.set(lockKey, {
        threshold: triggerPercent,
        value: remainingToRail,
        reason,
        createdAt: new Date().toISOString(),
      });
      this._triggerAlert('venue_rail_buffer', reason);
      return {
        allowed: false,
        reason,
        blockType: 'VENUE_RAIL_BUFFER',
        riskGates,
      };
    }

    return { allowed: true, riskGates };
  }

  getPositionSizeMultiplier() {
    return null;
  }

  getRiskSummary() {
    return {
      ...this.pnlTracker.getState(),
      ...this.drawdownTracker.getState(),
      guardMode: this.config.guardMode,
      railLocks: Array.from(this.railLocks.entries()).map(([key, value]) => ({ key, ...value })),
      reconciliationReports: [...this.reconciliationReports],
      tradingAllowed: this.isTradingAllowed(),
    };
  }

  reset(newBalance = null, context = {}) {
    this.pnlTracker.reset(newBalance, context.sessionId || context.session || 'default');
    this.drawdownTracker.reset(newBalance);
    this.alertsTriggered = [];
    this.reconciliationReports = [];
    this.railLocks.clear();
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
