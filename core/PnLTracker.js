'use strict';

class PnLTracker {
  constructor() {
    this.reset();
  }

  initialize(balance, sessionId = 'default') {
    if (!Number.isFinite(balance) || balance <= 0) {
      console.warn(`[PnLTracker] Refusing non-finite or non-positive starting balance: ${balance}`);
      return false;
    }
    this.state.startingBalance = balance;
    this.state.currentBalance = balance;
    this.state.peakBalance = balance;
    this.state.sessionId = sessionId;
    return true;
  }

  recordTrade(trade = {}) {
    const pnl = Number(trade.pnl);
    if (!Number.isFinite(pnl)) {
      console.warn(`[PnLTracker] Ignoring trade without finite confirmed P&L: ${trade.pnl}`);
      return { recorded: false, alerts: [] };
    }

    const fill = {
      pnl,
      symbol: trade.symbol || null,
      strategy: trade.strategy || trade.entryStrategy || null,
      venue: trade.venue || trade.executionVenue || null,
      sessionId: trade.sessionId || this.state.sessionId,
      timestamp: trade.timestamp || new Date().toISOString(),
    };

    this.tradeHistory.push(fill);
    this.state.realizedPnl += pnl;
    this.state.currentBalance += pnl;
    if (this.state.currentBalance > this.state.peakBalance) {
      this.state.peakBalance = this.state.currentBalance;
    }
    this.state.maxIntradayDrawdownPercent = Math.max(
      this.state.maxIntradayDrawdownPercent,
      this.getTrailingDrawdownPercent()
    );

    return { recorded: true, fill, alerts: [] };
  }

  getTrailingDrawdownPercent() {
    if (!Number.isFinite(this.state.peakBalance) || this.state.peakBalance <= 0) return 0;
    const drawdown = ((this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance) * 100;
    return Math.max(0, drawdown);
  }

  getState() {
    return {
      startingBalance: this.state.startingBalance,
      currentBalance: this.state.currentBalance,
      peakBalance: this.state.peakBalance,
      realizedPnl: this.state.realizedPnl,
      trailingDrawdownPercent: this.getTrailingDrawdownPercent(),
      maxIntradayDrawdownPercent: this.state.maxIntradayDrawdownPercent,
      totalTrades: this.tradeHistory.length,
      sessionId: this.state.sessionId,
    };
  }

  reset(newBalance = null, sessionId = 'default') {
    this.tradeHistory = [];
    this.state = {
      startingBalance: Number.isFinite(newBalance) && newBalance > 0 ? newBalance : 0,
      currentBalance: Number.isFinite(newBalance) && newBalance > 0 ? newBalance : 0,
      peakBalance: Number.isFinite(newBalance) && newBalance > 0 ? newBalance : 0,
      realizedPnl: 0,
      maxIntradayDrawdownPercent: 0,
      sessionId,
    };
  }
}

module.exports = PnLTracker;
