/**
 * StopLossChecker.js - Stop Loss Exit Condition
 * ==============================================
 * Checks strategy-specific stop loss.
 * Phase 11: Uses BreakEvenManager for break-even state (single source of truth).
 *
 * @module core/exit/StopLossChecker
 */

'use strict';

const BreakEvenManager = require('./BreakEvenManager');

class StopLossChecker {
  constructor() {
    this.breakEvenManager = new BreakEvenManager();
  }

  /**
   * Check stop loss conditions
   * @param {Object} trade - Trade object with entryPrice, exitContract, maxProfitPercent
   * @param {number} currentPrice - Current market price
   * @param {number} pnlPercent - Current P&L as percentage
   * @param {Object} context - { accountBalance, initialBalance }
   * @returns {Object} { shouldExit, exitReason, details, confidence } or { shouldExit: false }
   */
  check(trade, currentPrice, pnlPercent, context = {}) {
    const contract = trade.exitContract || {};

    // === STRATEGY STOP LOSS (with break-even via BreakEvenManager) ===
    // Skip entire block for "no stop" contracts (null/undefined/0) — BreakEvenManager
    // returns effectiveStopPercent: null in those cases and downstream .toFixed crashes.
    if (contract.stopLossPercent != null && contract.stopLossPercent !== 0) {
      // Phase 11: Query BreakEvenManager instead of inline computation
      const beState = this.breakEvenManager.evaluate(trade);
      const effectiveStop = beState.effectiveStopPercent;
      const breakEvenTriggered = beState.isBreakEven;

      if (pnlPercent <= effectiveStop) {
        const exitReason = breakEvenTriggered ? 'break_even' : 'stop_loss';
        const stopType = breakEvenTriggered ? 'BE' : 'SL';
        return {
          shouldExit: true,
          exitReason,
          details: `${trade.entryStrategy || 'Strategy'} ${stopType}: ${pnlPercent.toFixed(2)}% <= ${effectiveStop.toFixed(2)}%`,
          confidence: 100
        };
      }
    }

    return { shouldExit: false };
  }

  /**
   * Get the effective stop loss level (accounts for break-even)
   * Useful for dashboard display
   * @param {Object} trade
   * @returns {number} Effective stop loss percent
   */
  getEffectiveStop(trade) {
    return this.breakEvenManager.getEffectiveStop(trade);
  }
}

module.exports = StopLossChecker;
