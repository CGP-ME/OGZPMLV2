/**
 * STATE MANAGER - Single Source of Truth
 *
 * Fixes the critical position/balance desync bug where:
 * - this.currentPosition (main bot)
 * - this.tradingBrain.position (OptimizedTradingBrain)
 * - this.executionLayer.positions (Map in AdvancedExecutionLayer)
 * All tracked different values causing phantom trades
 *
 * This centralizes ALL state management with atomic updates
 */

class StateManager {
  constructor() {
    this.state = {
      // Position tracking
      position: 0,              // Current position size in USD
      positionCount: 0,         // Number of positions (for multi-entry)
      entryPrice: 0,           // Average entry price
      entryTime: null,         // When position was opened

      // Balance tracking
      balance: 10000,          // Available balance
      totalBalance: 10000,     // Total account value
      inPosition: 0,           // Amount tied up in positions

      // Trade tracking
      activeTrades: new Map(), // Trade ID -> trade details
      lastTradeTime: null,
      tradeCount: 0,
      dailyTradeCount: 0,

      // P&L tracking
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,

      // System state
      isTrading: false,
      recoveryMode: false,
      lastError: null,
      lastUpdate: Date.now()
    };

    // State change listeners
    this.listeners = new Set();

    // Transaction log for debugging
    this.transactionLog = [];
    this.maxLogSize = 100;

    // Lock for atomic operations
    this.locked = false;
    this.lockQueue = [];
  }

  /**
   * Get current state snapshot (read-only)
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get specific state value
   */
  get(key) {
    return this.state[key];
  }

  /**
   * ATOMIC state update with transaction safety
   * All state changes MUST go through this
   */
  async updateState(updates, context = {}) {
    // Wait for lock
    await this.acquireLock();

    try {
      // Snapshot for rollback
      const snapshot = { ...this.state };
      const timestamp = Date.now();

      // Validate updates
      this.validateUpdates(updates);

      // Apply updates atomically
      for (const [key, value] of Object.entries(updates)) {
        this.state[key] = value;
      }

      this.state.lastUpdate = timestamp;

      // Log transaction
      this.logTransaction({
        timestamp,
        updates,
        context,
        snapshot
      });

      // Notify listeners
      this.notifyListeners(updates, context);

      return { success: true, state: this.getState() };

    } catch (error) {
      console.error('[StateManager] Update failed:', error);
      // Rollback would go here if needed
      return { success: false, error: error.message };

    } finally {
      this.releaseLock();
    }
  }

  /**
   * Open a new position (BUY)
   */
  async openPosition(size, price, context = {}) {
    if (this.state.position > 0) {
      console.warn('[StateManager] Already in position, adding to it');
    }

    const updates = {
      position: this.state.position + size,
      positionCount: this.state.positionCount + 1,
      entryPrice: this.state.position > 0
        ? (this.state.entryPrice * this.state.position + price * size) / (this.state.position + size)
        : price,
      entryTime: this.state.entryTime || Date.now(),
      balance: this.state.balance - size,
      inPosition: this.state.inPosition + size,
      lastTradeTime: Date.now(),
      tradeCount: this.state.tradeCount + 1,
      dailyTradeCount: this.state.dailyTradeCount + 1
    };

    return this.updateState(updates, { action: 'OPEN_POSITION', price, size, ...context });
  }

  /**
   * Close position (SELL)
   */
  async closePosition(price, partial = false, size = null, context = {}) {
    if (this.state.position <= 0) {
      console.error('[StateManager] No position to close!');
      return { success: false, error: 'No position to close' };
    }

    const closeSize = size || this.state.position;
    const pnl = (price - this.state.entryPrice) * closeSize;
    const pnlPercent = (pnl / closeSize) * 100;

    const updates = {
      position: Math.max(0, this.state.position - closeSize),
      positionCount: partial ? this.state.positionCount : 0,
      entryPrice: partial ? this.state.entryPrice : 0,
      entryTime: partial ? this.state.entryTime : null,
      balance: this.state.balance + closeSize + pnl,
      inPosition: Math.max(0, this.state.inPosition - closeSize),
      realizedPnL: this.state.realizedPnL + pnl,
      totalPnL: this.state.totalPnL + pnl,
      lastTradeTime: Date.now()
    };

    console.log(`📊 Position closed: PnL ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

    return this.updateState(updates, {
      action: 'CLOSE_POSITION',
      price,
      size: closeSize,
      pnl,
      partial,
      ...context
    });
  }

  /**
   * Update balance (deposits, withdrawals, fees)
   */
  async updateBalance(amount, reason = 'adjustment') {
    const updates = {
      balance: this.state.balance + amount,
      totalBalance: this.state.totalBalance + amount
    };

    return this.updateState(updates, { action: 'BALANCE_UPDATE', amount, reason });
  }

  /**
   * Reset daily counters
   */
  async resetDaily() {
    const updates = {
      dailyTradeCount: 0
    };

    return this.updateState(updates, { action: 'DAILY_RESET' });
  }

  /**
   * Set recovery mode
   */
  async setRecoveryMode(enabled) {
    const updates = {
      recoveryMode: enabled
    };

    return this.updateState(updates, { action: 'RECOVERY_MODE', enabled });
  }

  /**
   * Validate state consistency
   */
  validateState() {
    const issues = [];

    // Check balance consistency
    const expectedTotal = this.state.balance + this.state.inPosition;
    const diff = Math.abs(expectedTotal - this.state.totalBalance);
    if (diff > 0.01) {
      issues.push(`Balance mismatch: total=${this.state.totalBalance}, expected=${expectedTotal}`);
    }

    // Check position consistency
    if (this.state.position > 0 && !this.state.entryPrice) {
      issues.push('Position exists but no entry price');
    }

    if (this.state.position === 0 && this.state.inPosition > 0) {
      issues.push('No position but funds locked');
    }

    if (this.state.position < 0) {
      issues.push('Negative position detected!');
    }

    if (this.state.balance < 0) {
      issues.push('Negative balance detected!');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Emergency state reset (use with caution!)
   */
  async emergencyReset(safeBalance = null) {
    console.warn('🚨 [StateManager] EMERGENCY RESET INITIATED');

    const updates = {
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      balance: safeBalance || this.state.totalBalance,
      totalBalance: safeBalance || this.state.totalBalance,
      inPosition: 0,
      activeTrades: new Map(),
      recoveryMode: true
    };

    return this.updateState(updates, { action: 'EMERGENCY_RESET' });
  }

  // === INTERNAL METHODS ===

  validateUpdates(updates) {
    // Add validation logic here
    if (updates.position !== undefined && updates.position < 0) {
      throw new Error('Cannot set negative position');
    }
    if (updates.balance !== undefined && updates.balance < 0) {
      throw new Error('Cannot set negative balance');
    }
  }

  logTransaction(transaction) {
    this.transactionLog.push(transaction);
    if (this.transactionLog.length > this.maxLogSize) {
      this.transactionLog.shift();
    }
  }

  async acquireLock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait for lock to be available
    return new Promise(resolve => {
      this.lockQueue.push(resolve);
    });
  }

  releaseLock() {
    this.locked = false;
    if (this.lockQueue.length > 0) {
      const next = this.lockQueue.shift();
      this.locked = true;
      next();
    }
  }

  // === LISTENERS ===

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(updates, context) {
    for (const listener of this.listeners) {
      try {
        listener(updates, context, this.getState());
      } catch (error) {
        console.error('[StateManager] Listener error:', error);
      }
    }
  }

  // === DEBUGGING ===

  getTransactionLog() {
    return [...this.transactionLog];
  }

  printState() {
    console.log('\n📊 === STATE SNAPSHOT ===');
    console.log(`Position: ${this.state.position} @ ${this.state.entryPrice || 'N/A'}`);
    console.log(`Balance: $${this.state.balance.toFixed(2)} (Total: $${this.state.totalBalance.toFixed(2)})`);
    console.log(`P&L: $${this.state.totalPnL.toFixed(2)} (Realized: $${this.state.realizedPnL.toFixed(2)})`);
    console.log(`Trades: ${this.state.tradeCount} total, ${this.state.dailyTradeCount} today`);
    console.log(`Recovery Mode: ${this.state.recoveryMode}`);
    console.log('======================\n');
  }
}

// Singleton pattern
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new StateManager();
    }
    return instance;
  },
  StateManager
};