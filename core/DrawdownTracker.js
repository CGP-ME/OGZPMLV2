'use strict';

class DrawdownTracker {
  constructor() {
    this.reset();
  }

  initialize(balance) {
    if (!Number.isFinite(balance) || balance <= 0) {
      console.warn(`[DrawdownTracker] Refusing non-finite or non-positive starting balance: ${balance}`);
      return false;
    }
    this.state.startingBalance = balance;
    this.state.currentBalance = balance;
    this.state.peakBalance = balance;
    return true;
  }

  recordConfirmedPnl(pnl) {
    if (!Number.isFinite(pnl)) {
      console.warn(`[DrawdownTracker] Ignoring non-finite confirmed P&L: ${pnl}`);
      return false;
    }
    this.state.currentBalance += pnl;
    if (this.state.currentBalance > this.state.peakBalance) {
      this.state.peakBalance = this.state.currentBalance;
    }
    this.state.currentDrawdownPercent = this.getCurrentDrawdownPercent();
    this.state.maxDrawdownReached = Math.max(
      this.state.maxDrawdownReached,
      this.state.currentDrawdownPercent
    );
    return true;
  }

  getCurrentDrawdownPercent() {
    if (!Number.isFinite(this.state.peakBalance) || this.state.peakBalance <= 0) return 0;
    return Math.max(0, ((this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance) * 100);
  }

  getState() {
    return {
      startingBalance: this.state.startingBalance,
      currentBalance: this.state.currentBalance,
      peakBalance: this.state.peakBalance,
      currentDrawdown: this.getCurrentDrawdownPercent(),
      maxDrawdownReached: this.state.maxDrawdownReached,
    };
  }

  reset(newBalance = null) {
    const balance = Number.isFinite(newBalance) && newBalance > 0 ? newBalance : 0;
    this.state = {
      startingBalance: balance,
      currentBalance: balance,
      peakBalance: balance,
      currentDrawdownPercent: 0,
      maxDrawdownReached: 0,
    };
  }
}

module.exports = DrawdownTracker;
