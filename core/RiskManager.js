/**
 * RiskManager - Risk Assessment and Capital Protection
 *
 * REFACTORED: Phase 8 modular architecture
 * Original: 1952 lines → Now: ~200 lines + 2 focused modules
 *
 * Composes:
 *   - DrawdownTracker: Drawdown monitoring and protection multipliers
 *   - PnLTracker: P&L and time-based statistics (daily/weekly/monthly)
 *
 * @module core/RiskManager
 */

'use strict';

const DrawdownTracker = require('./DrawdownTracker');
const PnLTracker = require('./PnLTracker');

class RiskManager {
  constructor(config = {}) {
    this.config = {
      recoveryConfidenceMultiplier: config.recoveryConfidenceMultiplier ?? 1.5,
      baseConfidenceThreshold: config.baseConfidenceThreshold ?? 0.3,
      riskManagerBypass: config.riskManagerBypass ?? false,  // Default OFF for safety
      alertThresholds: {
        drawdown: config.drawdownAlert ?? 5,
        dailyLoss: config.dailyLossAlert ?? 3,
      },
    };

    // Compose with focused trackers
    this.drawdownTracker = new DrawdownTracker(config);
    this.pnlTracker = new PnLTracker(config);

    // Alert state
    this.alertsTriggered = [];

    console.log('[RiskManager] Initialized (Phase 8 modular)');
  }

  /**
   * Initialize with starting balance
   * @param {number} balance
   */
  initializeBalance(balance) {
    this.drawdownTracker.initialize(balance);
    this.pnlTracker.initialize(balance);
    console.log(`[RiskManager] Balance initialized: $${balance.toFixed(2)}`);
  }

  /**
   * Record a completed trade
   * @param {Object} trade - { success: boolean, pnl: number }
   */
  recordTradeResult(trade) {
    const { alerts } = this.pnlTracker.recordTrade(trade);
    this.drawdownTracker.updateBalance(trade.pnl);

    // Check recovery mode with current stats
    const pnlState = this.pnlTracker.getState();
    this.drawdownTracker.checkRecoveryMode(
      pnlState.consecutiveWins,
      this.pnlTracker.getRecentWinRate(10)
    );

    // Process alerts
    for (const alert of alerts) {
      this._triggerAlert(alert.split(':')[0], alert);
    }
    this._checkRiskAlerts();
  }

  /**
   * Update balance (for external sync)
   * @param {number} newBalance
   */
  updateBalance(newBalance) {
    this.drawdownTracker.setBalance(newBalance);
  }

  /**
   * Assess risk for a proposed trade
   * @param {Object} tradeParams - { direction, confidence, ... }
   * @returns {Object} - { approved, reason, riskLevel, ... }
   */
  assessTradeRisk(tradeParams) {
    // L5 observability: accumulate pass/fail for every gate evaluated.
    // Pure instrumentation — never changes gate behavior or trade decisions.
    // Matches decision-ledger-schema riskGates enum + shape.
    const riskGates = [];
    const _gate = (gate, threshold, value, passed, rejectReason) => {
      riskGates.push({ gate, threshold, value, passed, ...(rejectReason ? { rejectReason } : {}) });
    };

    // Bypass for backtest (controlled by config injection)
    if (this.config.riskManagerBypass) return { approved: true, riskLevel: 'LOW', riskGates };
    // RISK-HIGH-01: refuse risk scoring on non-finite confidence. Old destructure
    // default = 0 silently approved phantom-zero trades at REDUCE_SIZE instead of
    // blocking them. Halt-class reject per spec Rule #1.
    const { confidence } = tradeParams;
    if (!Number.isFinite(confidence)) {
      _gate('confidence_validity', 'finite', confidence, false, `Invalid confidence: ${confidence}`);
      return {
        approved: false,
        reason: `[RISK-HIGH-01] Invalid confidence (${confidence}) — refusing risk assessment`,
        riskLevel: 'CRITICAL',
        blockType: 'INVALID_INPUT',
        riskGates,
      };
    }
    const ddState = this.drawdownTracker.getState();
    const breaches = this.pnlTracker.getLimitBreaches();
    const pnlState = this.pnlTracker.getState();

    // Max drawdown check
    const maxDDExceeded = this.drawdownTracker.isMaxDrawdownExceeded();
    _gate('drawdown_circuit', this.config.maxDrawdownPercent, ddState.currentDrawdown, !maxDDExceeded,
          maxDDExceeded ? `Max drawdown exceeded (${ddState.currentDrawdown.toFixed(2)}%)` : null);
    if (maxDDExceeded) {
      return {
        approved: false,
        reason: `Max drawdown exceeded (${ddState.currentDrawdown.toFixed(2)}%)`,
        riskLevel: 'CRITICAL',
        blockType: 'DRAWDOWN_LIMIT',
        riskGates,
      };
    }

    // Loss limit checks
    _gate('daily_loss_limit', 0, breaches.daily ? 1 : 0, !breaches.daily,
          breaches.daily ? 'Daily loss limit exceeded' : null);
    if (breaches.daily) {
      return { approved: false, reason: 'Daily loss limit exceeded', riskLevel: 'HIGH', blockType: 'DAILY_LIMIT', riskGates };
    }
    _gate('daily_loss_limit', 0, breaches.weekly ? 1 : 0, !breaches.weekly,
          breaches.weekly ? 'Weekly loss limit exceeded' : null);
    if (breaches.weekly) {
      return { approved: false, reason: 'Weekly loss limit exceeded', riskLevel: 'HIGH', blockType: 'WEEKLY_LIMIT', riskGates };
    }
    _gate('daily_loss_limit', 0, breaches.monthly ? 1 : 0, !breaches.monthly,
          breaches.monthly ? 'Monthly loss limit exceeded' : null);
    if (breaches.monthly) {
      return { approved: false, reason: 'Monthly loss limit exceeded', riskLevel: 'HIGH', blockType: 'MONTHLY_LIMIT', riskGates };
    }

    // Recovery mode confidence check
    if (ddState.recoveryMode) {
      const required = this.config.baseConfidenceThreshold * this.config.recoveryConfidenceMultiplier;
      const passedRecovery = confidence >= required;
      _gate('min_confidence', required, confidence, passedRecovery,
            passedRecovery ? null : `Recovery mode: Confidence ${(confidence * 100).toFixed(1)}% below required ${(required * 100).toFixed(1)}%`);
      if (!passedRecovery) {
        return {
          approved: false,
          reason: `Recovery mode: Confidence ${(confidence * 100).toFixed(1)}% below required ${(required * 100).toFixed(1)}%`,
          riskLevel: 'MEDIUM',
          blockType: 'RECOVERY_CONFIDENCE',
          riskGates,
        };
      }
    }

    // Calculate risk score
    let riskScore = 0;
    if (confidence < 0.5) riskScore += 2;
    else if (confidence < 0.7) riskScore += 1;
    if (pnlState.consecutiveLosses >= 3) riskScore += 2;
    else if (pnlState.consecutiveLosses >= 2) riskScore += 1;
    if (ddState.currentDrawdown >= 10) riskScore += 2;
    else if (ddState.currentDrawdown >= 5) riskScore += 1;

    let riskLevel = 'LOW';
    if (riskScore >= 4) riskLevel = 'HIGH';
    else if (riskScore >= 2) riskLevel = 'MEDIUM';

    return {
      approved: true,
      riskLevel,
      riskScore,
      confidence,
      recoveryMode: ddState.recoveryMode,
      consecutiveLosses: pnlState.consecutiveLosses,
      currentDrawdown: ddState.currentDrawdown,
      recommendation: riskLevel === 'HIGH' ? 'REDUCE_SIZE' : riskLevel === 'MEDIUM' ? 'STANDARD_SIZE' : 'FULL_SIZE',
      riskGates,
    };
  }

  /**
   * Check if trading is allowed
   * @returns {{ allowed: boolean, reason?: string, riskGates: Array }}
   */
  isTradingAllowed() {
    // L5 observability: same pattern as assessTradeRisk — record pass/fail per gate.
    const riskGates = [];
    const _gate = (gate, threshold, value, passed, rejectReason) => {
      riskGates.push({ gate, threshold, value, passed, ...(rejectReason ? { rejectReason } : {}) });
    };

    // Bypass for backtest (controlled by config injection)
    if (this.config.riskManagerBypass) return { allowed: true, riskGates };

    const ddState = this.drawdownTracker.getState();
    const maxDDExceeded = this.drawdownTracker.isMaxDrawdownExceeded();
    _gate('drawdown_circuit', this.config.maxDrawdownPercent, ddState.currentDrawdown, !maxDDExceeded,
          maxDDExceeded ? 'Max drawdown exceeded' : null);
    if (maxDDExceeded) {
      return { allowed: false, reason: 'Max drawdown exceeded', riskGates };
    }

    const breaches = this.pnlTracker.getLimitBreaches();
    _gate('daily_loss_limit', 0, breaches.daily ? 1 : 0, !breaches.daily,
          breaches.daily ? 'Daily loss limit' : null);
    if (breaches.daily) return { allowed: false, reason: 'Daily loss limit', riskGates };

    _gate('daily_loss_limit', 0, breaches.weekly ? 1 : 0, !breaches.weekly,
          breaches.weekly ? 'Weekly loss limit' : null);
    if (breaches.weekly) return { allowed: false, reason: 'Weekly loss limit', riskGates };

    _gate('daily_loss_limit', 0, breaches.monthly ? 1 : 0, !breaches.monthly,
          breaches.monthly ? 'Monthly loss limit' : null);
    if (breaches.monthly) return { allowed: false, reason: 'Monthly loss limit', riskGates };

    return { allowed: true, riskGates };
  }

  /**
   * Get position size multiplier from drawdown protection
   * @returns {number}
   */
  getPositionSizeMultiplier() {
    return this.drawdownTracker.calculateProtectionMultiplier();
  }

  /**
   * Get comprehensive risk summary
   */
  getRiskSummary() {
    return {
      ...this.drawdownTracker.getState(),
      ...this.pnlTracker.getState(),
      tradingAllowed: this.isTradingAllowed(),
    };
  }

  /**
   * Reset all state
   * @param {number} [newBalance]
   */
  reset(newBalance = null) {
    this.drawdownTracker.reset(newBalance);
    this.pnlTracker.reset(newBalance);
    this.alertsTriggered = [];
  }

  /**
   * Shutdown (no-op, kept for backward compatibility)
   */
  shutdown() {
    console.log('[RiskManager] Shutdown complete');
  }

  // ─── Internal alert methods ───

  _checkRiskAlerts() {
    const ddState = this.drawdownTracker.getState();
    const pnlState = this.pnlTracker.getState();

    if (ddState.currentDrawdown >= this.config.alertThresholds.drawdown) {
      this._triggerAlert('drawdown', `Drawdown at ${ddState.currentDrawdown.toFixed(2)}%`);
    }
    if (pnlState.dailyPnL < 0 && Math.abs(pnlState.dailyPnL) >= this.config.alertThresholds.dailyLoss) {
      this._triggerAlert('daily_loss', `Daily loss at ${Math.abs(pnlState.dailyPnL).toFixed(2)}%`);
    }
  }

  _triggerAlert(type, message) {
    const now = Date.now();
    const recentSame = this.alertsTriggered.find(a => a.type === type && (now - a.timestamp) < 300000);
    if (!recentSame) {
      this.alertsTriggered.push({ type, message, timestamp: now });
      console.warn(`[RiskManager] ALERT: ${type} - ${message}`);
      if (this.alertsTriggered.length > 50) this.alertsTriggered.shift();
    }
  }
}

module.exports = RiskManager;
