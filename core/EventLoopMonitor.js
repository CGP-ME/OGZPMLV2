/**
 * EventLoopMonitor.js - Event Loop Health Monitoring
 *
 * Detects when the Node.js event loop is lagging, which indicates
 * the bot might be freezing or under heavy load.
 *
 * CRITICAL: High lag = delayed trades = losses
 */

const { getInstance: getStateManager } = require('./StateManager');

class EventLoopMonitor {
  constructor(config = {}) {
    // Configuration
    this.warningThreshold = config.warningThreshold || 100;  // 100ms warning
    this.criticalThreshold = config.criticalThreshold || 500; // 500ms critical
    this.checkInterval = config.checkInterval || 1000;        // Check every second
    this.maxHistory = config.maxHistory || 100;

    // State
    this.isMonitoring = false;
    this.lastCheck = Date.now();
    this.monitorTimer = null;
    this.lagHistory = [];
    this.stats = {
      totalChecks: 0,
      warningCount: 0,
      criticalCount: 0,
      maxLag: 0,
      avgLag: 0,
      lastLag: 0
    };

    // Callbacks
    this.onWarning = config.onWarning || null;
    this.onCritical = config.onCritical || null;

    console.log('⚡ EventLoopMonitor initialized');
    console.log(`   Warning threshold: ${this.warningThreshold}ms`);
    console.log(`   Critical threshold: ${this.criticalThreshold}ms`);
  }

  /**
   * Start monitoring the event loop
   */
  start() {
    if (this.isMonitoring) {
      console.log('⚠️ Event loop monitoring already active');
      return;
    }

    console.log('🔍 Starting event loop monitoring...');
    this.isMonitoring = true;
    this.lastCheck = Date.now();

    // Main monitoring loop
    this.monitorTimer = setInterval(() => {
      this.checkEventLoopLag();
    }, this.checkInterval);

    // Also use setImmediate for more accurate lag detection
    this.immediateCheck();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isMonitoring) return;

    console.log('🛑 Stopping event loop monitoring');
    this.isMonitoring = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Check event loop lag
   */
  checkEventLoopLag() {
    const now = Date.now();
    const expectedTime = this.lastCheck + this.checkInterval;
    const lag = now - expectedTime;

    // Update stats
    this.stats.totalChecks++;
    this.stats.lastLag = lag;

    // Record in history
    this.lagHistory.push({
      timestamp: now,
      lag: lag
    });

    // Keep history bounded
    if (this.lagHistory.length > this.maxHistory) {
      this.lagHistory.shift();
    }

    // Update max and average
    if (lag > this.stats.maxLag) {
      this.stats.maxLag = lag;
    }

    this.updateAverageLag();

    // Check thresholds
    if (lag > this.criticalThreshold) {
      this.handleCriticalLag(lag);
    } else if (lag > this.warningThreshold) {
      this.handleWarningLag(lag);
    }

    this.lastCheck = now;
  }

  /**
   * More precise lag detection using setImmediate
   */
  immediateCheck() {
    if (!this.isMonitoring) return;

    const start = Date.now();

    setImmediate(() => {
      const lag = Date.now() - start;

      // Only record if significant lag (setImmediate should be nearly instant)
      if (lag > 10) {
        this.recordPreciseLag(lag);
      }

      // Schedule next check
      if (this.isMonitoring) {
        setTimeout(() => this.immediateCheck(), 500);
      }
    });
  }

  /**
   * Record precise lag measurements
   */
  recordPreciseLag(lag) {
    // This catches micro-freezes that interval checks might miss
    if (lag > this.warningThreshold) {
      console.warn(`⚠️ Event loop micro-freeze detected: ${lag}ms`);

      if (lag > this.criticalThreshold) {
        this.handleCriticalLag(lag);
      }
    }
  }

  /**
   * Handle warning-level lag
   */
  handleWarningLag(lag) {
    this.stats.warningCount++;

    console.warn(`⚠️ EVENT LOOP LAG WARNING: ${lag}ms`);
    console.warn(`   Total warnings: ${this.stats.warningCount}`);
    console.warn(`   Average lag: ${this.stats.avgLag.toFixed(1)}ms`);

    if (this.onWarning) {
      this.onWarning(lag, this.stats);
    }

    // Log to dashboard if available
    this.sendToDashboard({
      type: 'event_loop_warning',
      lag: lag,
      stats: this.stats
    });
  }

  /**
   * Handle critical-level lag - PAUSE TRADING
   */
  async handleCriticalLag(lag) {
    this.stats.criticalCount++;

    console.error('🚨 CRITICAL EVENT LOOP LAG: ' + lag + 'ms');
    console.error('   PAUSING TRADING FOR SAFETY');
    console.error(`   Critical events: ${this.stats.criticalCount}`);

    // PAUSE TRADING IMMEDIATELY
    try {
      const stateManager = getStateManager();
      await stateManager.pauseTrading(`Critical event loop lag: ${lag}ms`);
    } catch (error) {
      console.error('❌ Failed to pause trading:', error.message);
    }

    if (this.onCritical) {
      this.onCritical(lag, this.stats);
    }

    // Send critical alert
    this.sendToDashboard({
      type: 'event_loop_critical',
      lag: lag,
      stats: this.stats,
      action: 'TRADING_PAUSED'
    });
  }

  /**
   * Update average lag calculation
   */
  updateAverageLag() {
    if (this.lagHistory.length === 0) {
      this.stats.avgLag = 0;
      return;
    }

    const sum = this.lagHistory.reduce((acc, item) => acc + item.lag, 0);
    this.stats.avgLag = sum / this.lagHistory.length;
  }

  /**
   * Get current monitoring stats
   */
  getStats() {
    return {
      ...this.stats,
      isMonitoring: this.isMonitoring,
      historyLength: this.lagHistory.length,
      recentLags: this.lagHistory.slice(-10).map(h => h.lag)
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    if (!this.isMonitoring) {
      return { status: 'DISABLED', message: 'Monitoring not active' };
    }

    if (this.stats.lastLag > this.criticalThreshold) {
      return { status: 'CRITICAL', message: `Lag: ${this.stats.lastLag}ms`, lag: this.stats.lastLag };
    }

    if (this.stats.lastLag > this.warningThreshold) {
      return { status: 'WARNING', message: `Lag: ${this.stats.lastLag}ms`, lag: this.stats.lastLag };
    }

    if (this.stats.avgLag > this.warningThreshold / 2) {
      return { status: 'DEGRADED', message: `Avg lag: ${this.stats.avgLag.toFixed(1)}ms`, lag: this.stats.avgLag };
    }

    return { status: 'HEALTHY', message: `Lag: ${this.stats.lastLag}ms`, lag: this.stats.lastLag };
  }

  /**
   * Send data to dashboard
   */
  sendToDashboard(data) {
    // Send to dashboard WebSocket if available
    if (global.dashboardWs && global.dashboardWs.send) {
      try {
        global.dashboardWs.send(JSON.stringify({
          type: 'event_loop_monitor',
          data: data,
          timestamp: Date.now()
        }));
      } catch (error) {
        // Dashboard might not be connected
      }
    }
  }

  /**
   * Diagnostic function to deliberately create lag (for testing)
   */
  testLag(duration = 1000) {
    console.log(`🧪 Creating test lag for ${duration}ms...`);
    const start = Date.now();
    while (Date.now() - start < duration) {
      // Busy loop to block event loop
    }
    console.log('🧪 Test lag complete');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      warningCount: 0,
      criticalCount: 0,
      maxLag: 0,
      avgLag: 0,
      lastLag: 0
    };
    this.lagHistory = [];
    console.log('📊 Event loop stats reset');
  }
}

// Singleton instance
let instance = null;

module.exports = {
  EventLoopMonitor,
  getInstance: (config) => {
    if (!instance) {
      instance = new EventLoopMonitor(config);
    }
    return instance;
  }
};