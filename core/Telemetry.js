/**
 * OGZPrime Telemetry System
 * The bot's nervous system - tracks everything that matters
 */

const fs = require('fs');
const path = require('path');

class Telemetry {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.logToConsole = options.logToConsole ?? false; // Don't spam console
    this.logFile = options.logFile || path.join(process.cwd(), 'logs', 'telemetry.jsonl');
    this.metricsFile = path.join(process.cwd(), 'logs', 'metrics.json');

    // Create logs directory if needed
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // In-memory metrics for quick access
    this.metrics = {
      patterns: {
        detected: 0,
        recorded: 0,
        matched: 0,
        winRate: 0
      },
      trades: {
        total: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        avgConfidence: 0
      },
      performance: {
        candlesProcessed: 0,
        decisionsPerMinute: 0,
        memorySize: 0
      }
    };

    // Load existing metrics
    this.loadMetrics();
  }

  /**
   * Log a telemetry event
   */
  event(type, payload = {}) {
    if (!this.enabled) return;

    const entry = {
      ts: Date.now(),
      type,
      ...payload
    };

    // Update metrics based on event type
    this.updateMetrics(type, payload);

    // Log to file
    const line = JSON.stringify(entry);
    fs.appendFile(this.logFile, line + '\n', err => {
      if (err && this.logToConsole) {
        console.error('[TELEMETRY] Write error:', err.message);
      }
    });

    // Optional console output for critical events
    if (this.logToConsole && this.isCriticalEvent(type)) {
      console.log(`[TEL:${type}]`, payload);
    }
  }

  /**
   * Record a metric value
   */
  metric(name, value, tags = {}) {
    this.event('metric', { name, value, tags });
  }

  /**
   * Update in-memory metrics
   */
  updateMetrics(type, payload) {
    switch(type) {
      case 'pattern_detected':
        this.metrics.patterns.detected++;
        break;

      case 'pattern_recorded':
        this.metrics.patterns.recorded++;
        if (payload.memorySize) {
          this.metrics.performance.memorySize = payload.memorySize;
        }
        break;

      case 'pattern_match':
        this.metrics.patterns.matched++;
        if (payload.result === 'win') {
          this.metrics.patterns.winRate =
            (this.metrics.patterns.winRate * (this.metrics.patterns.matched - 1) + 1) /
            this.metrics.patterns.matched;
        }
        break;

      case 'trade_executed':
        this.metrics.trades.total++;
        if (payload.pnl) {
          this.metrics.trades.pnl += payload.pnl;
          if (payload.pnl > 0) {
            this.metrics.trades.wins++;
          } else if (payload.pnl < 0) {
            this.metrics.trades.losses++;
          }
        }
        if (payload.confidence) {
          const prevAvg = this.metrics.trades.avgConfidence;
          this.metrics.trades.avgConfidence =
            (prevAvg * (this.metrics.trades.total - 1) + payload.confidence) /
            this.metrics.trades.total;
        }
        break;

      case 'candle_processed':
        this.metrics.performance.candlesProcessed++;
        break;
    }

    // Save metrics periodically
    if (this.metrics.performance.candlesProcessed % 10 === 0) {
      this.saveMetrics();
    }
  }

  /**
   * Determine if event is critical enough for console
   */
  isCriticalEvent(type) {
    const criticalTypes = [
      'error',
      'trade_executed',
      'large_loss',
      'pattern_memory_wiped',
      'bot_crash'
    ];
    return criticalTypes.includes(type);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Save metrics to file
   */
  saveMetrics() {
    fs.writeFile(
      this.metricsFile,
      JSON.stringify(this.metrics, null, 2),
      err => {
        if (err && this.logToConsole) {
          console.error('[TELEMETRY] Failed to save metrics:', err.message);
        }
      }
    );
  }

  /**
   * Load metrics from file
   */
  loadMetrics() {
    if (fs.existsSync(this.metricsFile)) {
      try {
        const data = fs.readFileSync(this.metricsFile, 'utf8');
        this.metrics = { ...this.metrics, ...JSON.parse(data) };
      } catch (err) {
        if (this.logToConsole) {
          console.error('[TELEMETRY] Failed to load metrics:', err.message);
        }
      }
    }
  }

  /**
   * Generate a summary report
   */
  report() {
    const m = this.metrics;
    return `
📊 TELEMETRY REPORT
═══════════════════

🔍 PATTERNS
  Detected: ${m.patterns.detected}
  Recorded: ${m.patterns.recorded}
  Matched: ${m.patterns.matched}
  Win Rate: ${(m.patterns.winRate * 100).toFixed(1)}%

💰 TRADES
  Total: ${m.trades.total}
  Wins: ${m.trades.wins}
  Losses: ${m.trades.losses}
  P&L: ${m.trades.pnl.toFixed(2)}%
  Avg Confidence: ${(m.trades.avgConfidence * 100).toFixed(1)}%

⚡ PERFORMANCE
  Candles: ${m.performance.candlesProcessed}
  Memory Size: ${m.performance.memorySize}

Win Rate: ${m.trades.total > 0 ? ((m.trades.wins / m.trades.total) * 100).toFixed(1) : 0}%
═══════════════════`;
  }
}

// Singleton instance
let telemetryInstance = null;

function getTelemetry(options) {
  if (!telemetryInstance) {
    telemetryInstance = new Telemetry(options);
  }
  return telemetryInstance;
}

module.exports = { Telemetry, getTelemetry };