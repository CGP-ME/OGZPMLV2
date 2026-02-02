/**
 * @fileoverview MemoryManager - Prevent Unbounded Memory Growth
 *
 * Provides rolling window data structures that automatically trim old data.
 * Critical for long-running trading bots to prevent heap exhaustion.
 *
 * @description
 * ARCHITECTURE ROLE:
 * MemoryManager provides fixed-size containers that replace standard arrays
 * throughout the codebase. Without bounded containers, arrays like priceHistory,
 * tradeHistory, and patternLog would grow indefinitely during 24/7 operation.
 *
 * MEMORY BUG HISTORY:
 * Before MemoryManager, the bot would crash after ~48 hours due to:
 * - priceHistory: unbounded array grew to millions of entries
 * - tradeHistory: never cleaned up old trades
 * - patternLog: accumulated every pattern detection forever
 *
 * USAGE PATTERN:
 * Replace: `this.history = []`
 * With:    `this.history = new RollingWindow(1000)`
 *
 * @module core/MemoryManager
 *
 * @example
 * const { RollingWindow } = require('./core/MemoryManager');
 *
 * // Fixed-size price history (keeps last 1000 candles)
 * const priceHistory = new RollingWindow(1000);
 * priceHistory.push({ price: 100000, timestamp: Date.now() });
 *
 * // Get last 100 candles for indicator calculation
 * const recentPrices = priceHistory.getLast(100);
 *
 * // Memory stays bounded even after years of operation
 * console.log(`Size: ${priceHistory.size()} / ${priceHistory.maxSize}`);
 */

/**
 * RollingWindow - Fixed-size array with FIFO eviction
 * Automatically removes oldest items when capacity exceeded
 */
class RollingWindow {
  constructor(maxSize = 1000) {
    if (maxSize < 1) throw new Error('maxSize must be >= 1');
    this.data = [];
    this.maxSize = maxSize;
  }

  /**
   * Add item to window (removes oldest if full)
   */
  push(item) {
    this.data.push(item);
    if (this.data.length > this.maxSize) {
      this.data.shift(); // Remove oldest
    }
  }

  /**
   * Get all items
   */
  getAll() {
    return [...this.data];
  }

  /**
   * Get last N items
   */
  getLast(n = 1) {
    return this.data.slice(Math.max(0, this.data.length - n));
  }

  /**
   * Get size
   */
  size() {
    return this.data.length;
  }

  /**
   * Clear all data
   */
  clear() {
    this.data = [];
  }

  /**
   * Check if full
   */
  isFull() {
    return this.data.length >= this.maxSize;
  }
}

/**
 * TimeBasedWindow - Array with time-based cleanup
 * Removes items older than specified duration
 */
class TimeBasedWindow {
  constructor(maxAgeMs = 3600000) { // 1 hour default
    this.data = [];
    this.maxAgeMs = maxAgeMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  /**
   * Add item with timestamp
   */
  push(item) {
    this.data.push({
      ...item,
      _timestamp: Date.now()
    });
    // Occasional cleanup on push
    if (this.data.length % 100 === 0) {
      this.cleanup();
    }
  }

  /**
   * Remove old items
   */
  cleanup() {
    const now = Date.now();
    const before = this.data.length;
    this.data = this.data.filter(item => 
      (now - item._timestamp) < this.maxAgeMs
    );
    if (before !== this.data.length) {
      console.log(`🧹 TimeBasedWindow cleaned up ${before - this.data.length} old items`);
    }
  }

  /**
   * Get all items
   */
  getAll() {
    return [...this.data];
  }

  /**
   * Get size
   */
  size() {
    return this.data.length;
  }

  /**
   * Clear all data
   */
  clear() {
    this.data = [];
  }

  /**
   * Destroy and cleanup interval
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.data = [];
  }
}

/**
 * HybridWindow - Combines size and time-based limits
 * Uses whichever constraint becomes active first
 */
class HybridWindow {
  constructor(maxSize = 1000, maxAgeMs = 3600000) {
    this.maxSize = maxSize;
    this.maxAgeMs = maxAgeMs;
    this.data = [];
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Add item with timestamp
   */
  push(item) {
    this.data.push({
      ...item,
      _timestamp: Date.now()
    });

    // Size-based trim
    if (this.data.length > this.maxSize) {
      const removed = this.data.length - this.maxSize;
      this.data = this.data.slice(-this.maxSize);
      console.log(`🧹 HybridWindow trimmed ${removed} items (size limit)`);
    }

    // Occasional time-based cleanup
    if (this.data.length % 100 === 0) {
      this.cleanup();
    }
  }

  /**
   * Time-based cleanup
   */
  cleanup() {
    const now = Date.now();
    const before = this.data.length;
    this.data = this.data.filter(item =>
      (now - item._timestamp) < this.maxAgeMs
    );
    if (before !== this.data.length) {
      console.log(`🧹 HybridWindow cleaned up ${before - this.data.length} old items (time limit)`);
    }
  }

  /**
   * Get all items
   */
  getAll() {
    return [...this.data];
  }

  /**
   * Get size
   */
  size() {
    return this.data.length;
  }

  /**
   * Get memory estimate in bytes
   */
  getMemoryEstimate() {
    return JSON.stringify(this.data).length;
  }

  /**
   * Clear all
   */
  clear() {
    this.data = [];
  }

  /**
   * Destroy cleanup interval
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.data = [];
  }
}

module.exports = {
  RollingWindow,
  TimeBasedWindow,
  HybridWindow
};
