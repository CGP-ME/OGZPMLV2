/**
 * Break-even state observer.
 *
 * The managed exit owner creates the stop at entry-policy trigger time and
 * records trade.breakevenActive. This class only exposes that committed state
 * to legacy stop and trailing checker consumers.
 */

'use strict';

const FeeModel = require('../FeeModel');

class BreakEvenManager {
  /**
   * Evaluate break-even state for a trade
   * Call this BEFORE StopLossChecker and TrailingStopChecker each tick.
   *
   * @param {Object} trade - Trade object with exitContract, maxProfitPercent, entryPrice
   * @returns {Object} {
   *   isBreakEven: boolean,        - Whether BE is currently active
   *   effectiveStopPercent: number, - The stop to use (-0.05 if BE, else contract SL)
   *   reason: string               - Why this state
   * }
   */
  evaluate(trade) {
    const contract = trade.exitContract || {};
    const stopLossPercent = contract.stopLossPercent;

    if (trade.breakevenActive === true) {
      const feeBufferPercent = trade.frozenExitPolicy.profitManagement.trail.feeBufferPercent;
      return {
        isBreakEven: true,
        effectiveStopPercent: feeBufferPercent,
        reason: 'managed_break_even_active'
      };
    }

    if (stopLossPercent === undefined || stopLossPercent === null || stopLossPercent === 0) {
      return {
        isBreakEven: false,
        effectiveStopPercent: null,
        reason: 'no_stop_contract'
      };
    }

    return {
      isBreakEven: false,
      effectiveStopPercent: stopLossPercent,
      reason: 'managed_break_even_inactive'
    };
  }

  /**
   * Check if break-even threshold has been reached
   * @param {Object} trade
   * @returns {boolean}
   */
  isTriggered(trade) {
    return this.evaluate(trade).isBreakEven;
  }

  /**
   * Get effective stop loss percent (accounts for break-even)
   * @param {Object} trade
   * @returns {number} Stop loss percent to use
   */
  getEffectiveStop(trade) {
    const result = this.evaluate(trade);
    return result.effectiveStopPercent;
  }

  /**
   * Get break-even price in dollars (for dashboard display)
   * @param {Object} trade - Trade with entryPrice
   * @param {number} [feeBufferPercent=0.05] - Buffer above entry for fees
   * @returns {number|null} Break-even price or null if not applicable
   */
  getFeeBufferPercent(trade) {
    return FeeModel.roundTripFeePercentForTrade(trade);
  }

  getBreakEvenPrice(trade, feeBufferPercent = null) {
    if (!trade || !trade.entryPrice) return null;
    const bufferPercent = feeBufferPercent ?? this.getFeeBufferPercent(trade);
    // BE price = entry price minus tiny buffer (long position)
    return trade.entryPrice * (1 - bufferPercent / 100);
  }
}

module.exports = BreakEvenManager;
