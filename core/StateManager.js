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

    // FIX: Bind methods to preserve 'this' context
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.updateActiveTrade = this.updateActiveTrade.bind(this);
    this.removeActiveTrade = this.removeActiveTrade.bind(this);
    this.openPosition = this.openPosition.bind(this);
    this.closePosition = this.closePosition.bind(this);

    // CHANGE 2025-12-13: Load saved state on initialization
    this.load();
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
   * Set specific state value (for internal use)
   */
  set(key, value) {
    this.state[key] = value;
    return value;
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
        // DEBUG: Log balance changes
        if (key === 'balance') {
          console.log(`💰 [StateManager] Balance update: ${this.state[key]} → ${value}`);
        }

        // CRITICAL FIX: Protect activeTrades Map from being overwritten
        if (key === 'activeTrades') {
          // If it's an array, convert to Map
          if (Array.isArray(value)) {
            this.state.activeTrades = new Map(value);
            console.log(`🔧 [StateManager] Converted activeTrades array to Map with ${value.length} entries`);
          } else if (value instanceof Map) {
            this.state.activeTrades = value;
          } else {
            console.warn(`⚠️ [StateManager] Ignoring invalid activeTrades update (not Array or Map):`, value);
            continue; // Skip this update
          }
        } else {
          this.state[key] = value;
        }
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

      // CHANGE 2025-12-13: Save state to disk after updates
      this.save();

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

    // DEBUG: Log what we're doing
    const usdCost = size * price;  // Calculate USD cost
    console.log(`📊 [StateManager] Opening position:`);
    console.log(`   Size: ${size} BTC`);
    console.log(`   Price: $${price}`);
    console.log(`   USD Cost: $${usdCost.toFixed(2)}`);
    console.log(`   Current Balance: $${this.state.balance}`);
    console.log(`   New Balance: $${(this.state.balance - usdCost).toFixed(2)}`);

    // CRITICAL FIX: Add trade to activeTrades Map
    const tradeId = context.orderId || `TRADE_${Date.now()}`;
    const trade = {
      id: tradeId,
      action: 'BUY',  // FIX: Changed from 'type' to 'action' to match run-empire filter
      type: 'BUY',    // Keep both for compatibility
      size: size,
      price: price,
      entryPrice: price,  // Add entryPrice field that run-empire expects
      entryTime: Date.now(),  // Add entryTime field
      timestamp: Date.now(),
      status: 'open',
      ...context
    };

    // Add to activeTrades Map
    if (!this.state.activeTrades) {
      this.state.activeTrades = new Map();
    }
    this.state.activeTrades.set(tradeId, trade);
    console.log(`✅ [StateManager] Added trade ${tradeId} to activeTrades (now ${this.state.activeTrades.size} trades)`);

    const updates = {
      position: this.state.position + size,
      positionCount: this.state.positionCount + 1,
      entryPrice: this.state.position > 0
        ? (this.state.entryPrice * this.state.position + price * size) / (this.state.position + size)
        : price,
      entryTime: this.state.entryTime || Date.now(),
      balance: this.state.balance - (size * price),  // FIX: Subtract USD cost, not BTC amount!
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
    // FIX: Calculate PnL correctly for dollar positions
    // Position is in dollars, so we need to calculate based on price change percentage
    const priceChangePercent = ((price - this.state.entryPrice) / this.state.entryPrice);
    const pnl = closeSize * priceChangePercent;  // Dollar position × price change %
    const pnlPercent = priceChangePercent * 100;

    // CRITICAL FIX: Remove closed trades from activeTrades Map
    if (!partial && this.state.activeTrades && this.state.activeTrades.size > 0) {
      // Close all BUY trades
      for (const [id, trade] of this.state.activeTrades.entries()) {
        if (trade.type === 'BUY') {
          this.state.activeTrades.delete(id);
          console.log(`🔒 [StateManager] Removed closed trade ${id} from activeTrades`);
        }
      }
      console.log(`📊 [StateManager] Active trades after closing: ${this.state.activeTrades.size}`);
    }

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

  /**
   * Pause trading for safety
   * @param {string} reason - Why trading is being paused
   */
  async pauseTrading(reason) {
    console.log('🛑 [StateManager] PAUSING TRADING:', reason);

    const updates = {
      isTrading: false,
      lastError: reason,
      pausedAt: Date.now(),
      pauseReason: reason
    };

    await this.updateState(updates, { action: 'PAUSE_TRADING', reason });

    // Log to console with visible warning
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚨 TRADING PAUSED - SAFETY STOP');
    console.log(`   Reason: ${reason}`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('   Action Required: Review logs and resume manually');
    console.log('═══════════════════════════════════════════════════════');

    return { success: true, message: `Trading paused: ${reason}` };
  }

  /**
   * Resume trading after pause
   */
  async resumeTrading() {
    console.log('✅ [StateManager] RESUMING TRADING');

    const updates = {
      isTrading: true,
      lastError: null,
      pausedAt: null,
      pauseReason: null,
      resumedAt: Date.now()
    };

    await this.updateState(updates, { action: 'RESUME_TRADING' });

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ TRADING RESUMED');
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    return { success: true, message: 'Trading resumed' };
  }

  // === CHANGE 2025-12-13: STEP 1 - ACTIVE TRADES MANAGEMENT ===

  /**
   * Add or update an active trade
   */
  updateActiveTrade(orderId, tradeData) {
    console.log(`🔍 [StateManager] updateActiveTrade called with orderId: ${orderId}`);
    console.log(`🔍 [StateManager] this.get exists: ${typeof this.get}`);
    console.log(`🔍 [StateManager] this.set exists: ${typeof this.set}`);

    const trades = this.get('activeTrades') || new Map();
    console.log(`🔍 [StateManager] Got trades: ${trades instanceof Map ? 'Map' : typeof trades}`);

    trades.set(orderId, tradeData);
    console.log(`🔍 [StateManager] About to call this.set with activeTrades`);

    this.set('activeTrades', trades);
    this.save(); // Save to disk with Map serialization
    console.log(`📝 [StateManager] Updated trade ${orderId}`);
  }

  /**
   * Remove an active trade
   */
  removeActiveTrade(orderId) {
    const trades = this.get('activeTrades');
    if (trades && trades.has(orderId)) {
      trades.delete(orderId);
      this.set('activeTrades', trades);
      this.save(); // Save to disk with Map serialization
      console.log(`🗑️ [StateManager] Removed trade ${orderId}`);
    }
  }

  /**
   * Get all active trades as array
   */
  getAllTrades() {
    const trades = this.get('activeTrades');
    return trades ? Array.from(trades.values()) : [];
  }

  /**
   * Check if state is in sync
   */
  isInSync() {
    const validation = this.validateState();
    if (!validation.valid) {
      console.error('❌ [StateManager] STATE DESYNC DETECTED:', validation.issues);
    }
    return validation.valid;
  }

  // === CHANGE 2025-12-13: CRITICAL - MAP SERIALIZATION FOR PERSISTENCE ===

  /**
   * Save state to disk with Map serialization
   */
  save() {
    try {
      // Skip state saving in backtest mode - don't corrupt real state
      if (process.env.BACKTEST_MODE === 'true') {
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const stateFile = path.join(__dirname, '..', 'data', 'state.json');

      // Create data directory if it doesn't exist
      const dataDir = path.dirname(stateFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Prepare state for serialization
      const stateToSave = { ...this.state };

      // CRITICAL: Convert Map to Array for JSON serialization
      if (this.state.activeTrades instanceof Map) {
        stateToSave.activeTrades = Array.from(this.state.activeTrades.entries());
      }

      // Save to disk
      fs.writeFileSync(stateFile, JSON.stringify(stateToSave, null, 2));
      console.log('[StateManager] State saved to disk');
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
    }
  }

  /**
   * Load state from disk with Map deserialization
   */
  load() {
    try {
      // Skip state loading in backtest mode - start fresh
      if (process.env.BACKTEST_MODE === 'true') {
        console.log('[StateManager] BACKTEST_MODE: Starting with clean state');
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const stateFile = path.join(__dirname, '..', 'data', 'state.json');

      if (fs.existsSync(stateFile)) {
        const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        // CRITICAL: Convert Array back to Map
        if (Array.isArray(savedState.activeTrades)) {
          savedState.activeTrades = new Map(savedState.activeTrades);
        } else if (!savedState.activeTrades) {
          savedState.activeTrades = new Map();
        }

        // Restore state
        this.state = { ...this.state, ...savedState };
        console.log('[StateManager] State loaded from disk');

        // Verify Map restoration
        console.log(`[StateManager] Active trades restored: ${this.state.activeTrades.size} trades`);
      }
    } catch (error) {
      console.error('[StateManager] Failed to load state:', error);
      // Initialize empty Map if load fails
      this.state.activeTrades = new Map();
    }
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
    await new Promise(resolve => {
      this.lockQueue.push(resolve);
    });
    this.locked = true;  // CRITICAL: Must set after wait completes
  }

  releaseLock() {
    if (this.lockQueue.length > 0) {
      const next = this.lockQueue.shift();
      this.locked = false;  // Release lock
      next();  // Wake next waiter
    } else {
      this.locked = false;  // Only release if no queue
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

    // CHANGE 2025-12-11: Broadcast to dashboard AFTER state changes
    // This ensures dashboard always shows accurate, post-update state
    this.broadcastToDashboard(updates, context);
  }

  // === DASHBOARD INTEGRATION ===
  // CHANGE 2025-12-11: Dashboard gets state AFTER updates, never stale data

  setDashboardWs(ws) {
    this.dashboardWs = ws;
    console.log('[StateManager] Dashboard WebSocket connected');
  }

  broadcastToDashboard(updates, context) {
    if (!this.dashboardWs || this.dashboardWs.readyState !== 1) return;

    try {
      const state = this.getState();
      this.dashboardWs.send(JSON.stringify({
        type: 'state_update',
        source: 'StateManager',
        updates: updates,
        context: context,
        state: {
          position: state.position,
          balance: state.balance,
          totalBalance: state.totalBalance,
          realizedPnL: state.realizedPnL,
          unrealizedPnL: state.unrealizedPnL,
          totalPnL: state.totalPnL,
          tradeCount: state.tradeCount,
          dailyTradeCount: state.dailyTradeCount,
          recoveryMode: state.recoveryMode
        },
        timestamp: Date.now()
      }));
    } catch (error) {
      // Silent fail - don't let dashboard issues affect trading
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