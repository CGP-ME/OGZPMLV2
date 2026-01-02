/**
 * ChartManager.js - Centralized chart data management
 * Handles OHLCV data storage, indicator caching, and multi-timeframe support
 */

class ChartManager {
  constructor() {
    this.candleStorage = new Map();    // Store candles by asset-timeframe key
    this.indicatorCache = new Map();   // Cache calculated indicators
    this.chartInstances = {};          // Multiple Chart.js instances
    this.maxCandles = 500;             // Memory management
    this.subscribers = new Set();      // Components listening for updates
  }

  /**
   * Add or update a candle
   * @param {string} asset - Asset symbol (BTC, ETH, etc)
   * @param {string} timeframe - Timeframe (1m, 5m, 1h, etc)
   * @param {object} candle - OHLCV candle data
   */
  addCandle(asset, timeframe, candle) {
    const key = `${asset}-${timeframe}`;

    if (!this.candleStorage.has(key)) {
      this.candleStorage.set(key, []);
    }

    const candles = this.candleStorage.get(key);

    // Check if we're updating the current candle or adding a new one
    if (candles.length > 0 && candles[candles.length - 1].t === candle.t) {
      // Update existing candle (real-time update)
      candles[candles.length - 1] = {
        ...candles[candles.length - 1],
        h: Math.max(candles[candles.length - 1].h, candle.h),
        l: Math.min(candles[candles.length - 1].l, candle.l),
        c: candle.c,
        v: candles[candles.length - 1].v + candle.v
      };
    } else {
      // Add new candle
      candles.push(candle);

      // Maintain memory limit
      if (candles.length > this.maxCandles) {
        candles.shift();
      }
    }

    // Notify subscribers of update
    this.notifySubscribers('candle_update', { asset, timeframe, candle });
  }

  /**
   * Add multiple candles (for historical data loading)
   */
  addCandles(asset, timeframe, candleArray) {
    const key = `${asset}-${timeframe}`;
    this.candleStorage.set(key, candleArray.slice(-this.maxCandles));
    this.notifySubscribers('candles_loaded', { asset, timeframe, count: candleArray.length });
  }

  /**
   * Get candles for specific asset and timeframe
   */
  getCandles(asset, timeframe) {
    return this.candleStorage.get(`${asset}-${timeframe}`) || [];
  }

  /**
   * Get latest candle
   */
  getLatestCandle(asset, timeframe) {
    const candles = this.getCandles(asset, timeframe);
    return candles[candles.length - 1] || null;
  }

  /**
   * Cache indicator values
   */
  cacheIndicator(asset, timeframe, indicatorType, values) {
    const key = `${asset}-${timeframe}-${indicatorType}`;
    this.indicatorCache.set(key, values);
  }

  /**
   * Get cached indicator values
   */
  getCachedIndicator(asset, timeframe, indicatorType) {
    const key = `${asset}-${timeframe}-${indicatorType}`;
    return this.indicatorCache.get(key) || [];
  }

  /**
   * Subscribe to updates
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers
   */
  notifySubscribers(type, data) {
    this.subscribers.forEach(callback => callback({ type, data }));
  }

  /**
   * Clear old data (memory management)
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    this.candleStorage.forEach((candles, key) => {
      const filtered = candles.filter(c => (now - c.t) < maxAge);
      if (filtered.length !== candles.length) {
        this.candleStorage.set(key, filtered);
      }
    });
  }

  /**
   * Get memory usage stats
   */
  getStats() {
    let totalCandles = 0;
    let totalIndicators = 0;

    this.candleStorage.forEach(candles => {
      totalCandles += candles.length;
    });

    this.indicatorCache.forEach(values => {
      totalIndicators += values.length;
    });

    return {
      assets: new Set([...this.candleStorage.keys()].map(k => k.split('-')[0])).size,
      timeframes: new Set([...this.candleStorage.keys()].map(k => k.split('-')[1])).size,
      totalCandles,
      totalIndicators,
      memoryUsage: `${((totalCandles * 48 + totalIndicators * 16) / 1024).toFixed(2)} KB`
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChartManager;
} else {
  window.ChartManager = ChartManager;
}