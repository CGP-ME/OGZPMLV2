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

const FeeModel = require('./FeeModel');

class PnLCalculator {
  constructor(options = {}) {
    this.feeModel = options.feeModel || (
      options.feePercent !== undefined
        ? FeeModel.percent({ totalRoundTrip: options.feePercent })
        : FeeModel.fromTradingConfig()
    );
    this.feeBuffer = options.feeBuffer ?? null;

    console.log('[PnLCalculator] Initialized (Phase 13)');
  }

  _staticPercentFeeBuffer() {
    if (this.feeModel.model !== 'percent') {
      throw new Error('[PnLCalculator] fee context required for per_share_minimum fee buffer calculations');
    }
    return this.feeModel.calculateRoundTripFeePercent({
      entryNotionalUsd: 1,
      exitNotionalUsd: 1,
    });
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
    // Fees on both entry and exit
    const fees = this.feeModel.calculateRoundTripFees({
      entryNotionalUsd: entryValue,
      exitNotionalUsd: exitValue,
      entryQuantity: size,
      exitQuantity: size,
    });

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
  feeBufferPercent(context = null) {
    if (context) {
      return this.feeModel.calculateRoundTripFeePercent(context);
    }
    return this.feeBuffer ?? this._staticPercentFeeBuffer();
  }

  isProfitableAfterFees(pnlPercent, context = null) {
    return pnlPercent > this.feeBufferPercent(context);
  }

  /**
   * Calculate break-even price (price needed to cover fees)
   *
   * @param {number} entryPrice - Entry price
   * @param {string} side - 'long' or 'short'
   * @returns {number} Break-even price
   */
  calculateBreakEven(entryPrice, side = 'long', context = null) {
    const feePercent = context
      ? this.feeModel.calculateRoundTripFeePercent(context)
      : this._staticPercentFeeBuffer();
    const feeMultiplier = 1 + (feePercent / 100);

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
      feeModel: this.feeModel.model,
      feeBuffer: this.feeBuffer,
      roundTripFeePercent: this.feeModel.model === 'percent' ? this._staticPercentFeeBuffer() : null,
      perShare: this.feeModel.perShare,
      minOrderFee: this.feeModel.minOrderFee,
    };
  }
}

module.exports = PnLCalculator;
