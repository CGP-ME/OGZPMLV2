/**
 * PnLCalculator - Direction-aware P&L Math
 *
 * Phase 13: Extracted from run-empire-v2.js
 *
 * SINGLE RESPONSIBILITY: Calculate profit/loss for trades
 * with proper direction handling and fee deduction.
 *
 * Longs: (current - entry) / entry
 * Shorts: (entry - current) / entry
 *
 * @module core/PnLCalculator
 */

'use strict';

const TradingConfig = require('./TradingConfig');

class PnLCalculator {
  constructor(options = {}) {
    // Round-trip fee from TradingConfig (maker + taker).
    // PNLC-HIGH-01: ?? preserves intentional 0 (paper mode with FEE_MAKER=0
    // FEE_TAKER=0). || coerced 0 to TradingConfig default, hiding paper-mode
    // misconfiguration. Warn when zero so paper-mode is operator-visible.
    this.feePercent = options.feePercent ?? TradingConfig.get('fees.totalRoundTrip');
    if (!Number.isFinite(this.feePercent)) {
      throw new Error(`[PNLC-HIGH-01] PnLCalculator.feePercent non-finite (got ${this.feePercent}) — refusing to compute P&L with phantom fees`);
    }
    if (this.feePercent === 0) {
      console.warn('[PNLC-HIGH-01] PnLCalculator.feePercent is zero — paper-mode/zero-fee active; backtest P&L will not reflect production trading costs');
    }
    // PNLC-MED-01: pull feeBuffer from TradingConfig (single fee source-of-truth)
    // instead of hardcoding 0.35. exits.trailing.feeBufferPercent maps to
    // TRAIL_FEE_BUFFER env (TradingConfig.js:449, default 0.65).
    this.feeBuffer = options.feeBuffer
      ?? TradingConfig.get('exits.trailing.feeBufferPercent')
      ?? TradingConfig.get('fees.totalRoundTrip');

    console.log('[PnLCalculator] Initialized (Phase 13)');
  }

  /**
   * Calculate P&L percentage for a trade
   *
   * @param {number} entryPrice - Entry price
   * @param {number} currentPrice - Current/exit price
   * @param {string} side - 'long' or 'short'
   * @returns {number} P&L as percentage (e.g., 1.5 = 1.5%)
   */
  calculatePnLPercent(entryPrice, currentPrice, side = 'long') {
    if (!entryPrice || entryPrice <= 0) {
      console.warn('[PnLCalculator] Invalid entry price:', entryPrice);
      return 0;
    }

    if (side === 'short') {
      // Shorts profit when price goes DOWN
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    // Longs profit when price goes UP (default)
    return ((currentPrice - entryPrice) / entryPrice) * 100;
  }

  /**
   * Calculate P&L in dollars
   *
   * @param {number} entryPrice - Entry price
   * @param {number} currentPrice - Current/exit price
   * @param {number} size - Position size in base currency (e.g., BTC)
   * @param {string} side - 'long' or 'short'
   * @returns {number} P&L in dollars
   */
  calculatePnLDollars(entryPrice, currentPrice, size, side = 'long') {
    if (side === 'short') {
      // Shorts: profit = size * (entry - current)
      return size * (entryPrice - currentPrice);
    }

    // Longs: profit = size * (current - entry)
    return size * (currentPrice - entryPrice);
  }

  /**
   * Calculate P&L after fees
   *
   * @param {number} entryPrice - Entry price
   * @param {number} currentPrice - Current/exit price
   * @param {number} size - Position size in base currency
   * @param {string} side - 'long' or 'short'
   * @returns {Object} { grossPnL, fees, netPnL, netPnLPercent }
   */
  calculateNetPnL(entryPrice, currentPrice, size, side = 'long') {
    const grossPnL = this.calculatePnLDollars(entryPrice, currentPrice, size, side);
    const entryValue = size * entryPrice;
    const exitValue = size * currentPrice;
    const totalValue = entryValue + exitValue;

    // Fees on both entry and exit
    const fees = totalValue * (this.feePercent / 2); // Split fee across both legs

    const netPnL = grossPnL - fees;
    const netPnLPercent = entryValue > 0 ? (netPnL / entryValue) * 100 : 0;

    return {
      grossPnL,
      fees,
      netPnL,
      netPnLPercent,
      grossPnLPercent: this.calculatePnLPercent(entryPrice, currentPrice, side)
    };
  }

  /**
   * Check if trade is profitable after fees
   *
   * @param {number} pnlPercent - Gross P&L percentage
   * @returns {boolean} True if profit covers fees
   */
  isProfitableAfterFees(pnlPercent) {
    return pnlPercent > this.feeBuffer;
  }

  /**
   * Calculate break-even price (price needed to cover fees)
   *
   * @param {number} entryPrice - Entry price
   * @param {string} side - 'long' or 'short'
   * @returns {number} Break-even price
   */
  calculateBreakEven(entryPrice, side = 'long') {
    const feeMultiplier = 1 + (this.feePercent / 100);

    if (side === 'short') {
      // Shorts need price to go DOWN to break even
      return entryPrice / feeMultiplier;
    }

    // Longs need price to go UP to break even
    return entryPrice * feeMultiplier;
  }

  /**
   * Get fee configuration
   */
  getFeeConfig() {
    return {
      feePercent: this.feePercent,
      feeBuffer: this.feeBuffer,
      roundTripFee: this.feePercent * 100 + '%'
    };
  }
}

module.exports = PnLCalculator;
