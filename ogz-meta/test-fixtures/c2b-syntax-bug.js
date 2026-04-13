// C2B VERIFICATION FIXTURE — DO NOT USE IN PRODUCTION
// This file contains a deliberately planted syntax/logic bug for
// Claudito chain Level 2 (mechanical catch) verification.
// Pipeline should identify the bug and fix it.

'use strict';

/**
 * Calculate risk-adjusted position size.
 * @param {number} balance - Account balance
 * @param {number} riskPercent - Risk percentage (0-1)
 * @param {number} stopDistance - Distance to stop loss in price units
 * @returns {number} Position size in units
 */
function calculatePositionSize(balance, riskPercent, stopDistance) {
  // Bug: division by zero not handled
  const riskAmount = balance * riskPercent;
  return riskAmount / stopDistance;
}

/**
 * Process trade result and update stats.
 * @param {object} trade - Trade object
 * @returns {object} Updated stats
 */
function processTradeResult(trade) {
  // Bug: try/catch silently swallows error — returns null on ANY failure
  // including data corruption, missing fields, type mismatches
  try {
    const pnl = (trade.exitPrice - trade.entryPrice) * trade.size;
    const pnlPercent = pnl / (trade.entryPrice * trade.size) * 100;
    return {
      pnl,
      pnlPercent,
      isWin: pnl > 0,
      holdTime: trade.exitTime - trade.entryTime
    };
  } catch (e) {
    return null;  // Silent swallow — caller gets null, no idea why
  }
}

module.exports = { calculatePositionSize, processTradeResult };
