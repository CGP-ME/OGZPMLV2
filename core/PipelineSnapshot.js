/**
 * PipelineSnapshot — 30-Minute Full Bot State Capture
 * 
 * Captures a complete snapshot of every module's state every 30 minutes
 * and writes it to a JSONL file for analysis. Each snapshot includes:
 * - Timestamp + uptime
 * - Price + candle count
 * - All indicator values (RSI, MACD, EMA, BB, etc.)
 * - Market regime + confidence
 * - Pattern memory stats
 * - Active trades + P&L
 * - Module signal states (EMA crossover, liquidity sweep, MA dynamic S/R)
 * - TRAI learning stats
 * - Risk manager state
 * - Confidence breakdown (what contributed what)
 * 
 * Usage in run-empire-v2.js:
 *   const PipelineSnapshot = require('./core/PipelineSnapshot');
 *   const snapshot = new PipelineSnapshot(this);  // pass bot instance
 *   // It self-starts on a 30-min interval. No other wiring needed.
 * 
 * Output: data/pipeline-snapshots.jsonl (one JSON object per line)
 */

const fs = require('fs');
const path = require('path');
const { c } = require('./CandleHelper');

const AMBIGUOUS_TELEMETRY_VALUES = new Set([
  '',
  'unknown',
  'undefined',
  'unclassified',
  'null',
  'none',
  'n/a',
  'na'
]);

class PipelineSnapshot {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.intervalMs = options.intervalMs || 30 * 60 * 1000; // 30 minutes
    this.outputFile = options.outputFile || path.join(process.cwd(), 'data', 'pipeline-snapshots.jsonl');
    this.snapshotCount = 0;
    this.startTime = Date.now();

    // Ensure data directory exists
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Start the interval
    this.timer = setInterval(() => this.capture(), this.intervalMs);

    // Take one immediately on startup
    setTimeout(() => this.capture(), 5000); // 5s delay to let modules initialize

    console.log(`[PipelineSnapshot] Active - capturing every ${this.intervalMs / 60000} minutes`);
    console.log(`[PipelineSnapshot] Output: ${this.outputFile}`);
  }

  capture() {
    try {
      const snap = this._buildSnapshot();
      
      // Write to JSONL (one line per snapshot)
      const line = JSON.stringify(snap) + '\n';
      fs.appendFileSync(this.outputFile, line);
      
      this.snapshotCount++;
      
      // Console summary (compact)
      const numericPrice = Number(snap.price);
      const price = Number.isFinite(numericPrice) && numericPrice > 0
        ? `$${numericPrice.toFixed(2)}`
        : 'PRICE_NOT_READY';
      const regime = snap.regime?.status === 'ready'
        ? (this._cleanTelemetryText(snap.regime?.current) || 'REGIME_NOT_RECORDED')
        : (this._cleanTelemetryText(snap.regime?.unavailableReason) || 'REGIME_NOT_RECORDED');
      const conf = snap.lastConfidence?.toFixed(1) || '0';
      const position = snap.position || 0;
      const candles = snap.candleCount || 0;
      const trades = snap.tradeStats?.total || 0;
      
      console.log(`[Snapshot #${this.snapshotCount}] ${price} | ${regime} | Conf: ${conf}% | Pos: ${position} | Candles: ${candles} | Trades: ${trades}`);
      
    } catch (e) {
      const message = this._cleanTelemetryText(e?.message) || 'SNAPSHOT_ERROR_WITHOUT_MESSAGE';
      console.error(`[PipelineSnapshot] Error: ${message}`);
    }
  }

  _buildSnapshot() {
    const bot = this.bot;
    const now = Date.now();

    // Get references safely
    const stateManager = this._resolveStateManager(bot);
    const indicatorEngine = bot.indicatorEngine || bot.engine;
    
    const snap = {
      // Meta
      timestamp: now,
      iso: new Date(now).toISOString(),
      uptimeMinutes: Math.round((now - this.startTime) / 60000),
      snapshotNumber: this.snapshotCount + 1,

      // Price
      price: this._getPrice(bot),
      candleCount: bot.priceHistory?.length || 0,

      // Indicators
      indicators: this._getIndicators(bot, indicatorEngine),

      // Regime
      regime: this._getRegime(bot),

      // Modular Signals
      signals: this._getSignals(bot),

      // Pattern Memory
      patternStats: this._getPatternStats(bot),

      // Position & Trades
      position: this._safeGet(() => this._getStateValue(stateManager, 'position', bot.position ?? 0)),
      balance: this._safeGet(() => this._getStateValue(stateManager, 'balance', bot.balance ?? 0)),
      activeTrades: this._getActiveTrades(bot, stateManager),
      tradeStats: this._getTradeStats(bot, stateManager),

      // Confidence (last cycle)
      lastConfidence: this._safeGet(() => bot.lastConfidence || bot.confidenceData?.totalConfidence || 0),
      lastDirection: this._safeGet(() => bot.lastDirection || bot.confidenceData?.direction || 'neutral'),

      // TRAI
      trai: this._getTraiStats(bot),

      // Risk Manager
      risk: this._getRiskStats(bot),

      // Module Health
      moduleHealth: this._getModuleHealth(bot)
    };

    return snap;
  }

  _getPrice(bot) {
    try {
      if (bot.priceHistory?.length > 0) {
        return c(bot.priceHistory[bot.priceHistory.length - 1]);
      }
      return bot.lastPrice || bot.marketData?.price || 0;
    } catch(e) { return 0; }
  }

  _getIndicators(bot, engine) {
    try {
      if (engine?.getSnapshot) {
        const snap = engine.getSnapshot();
        return {
          rsi: snap.rsi ?? null,
          macd: snap.macd ?? null,
          ema: snap.ema ?? null,
          bb: snap.bb ?? null,
          atr: snap.atr ?? null,
          trend: snap.trend ?? null,
          vwap: snap.vwap ?? null,
          volume: snap.volume ?? null
        };
      }
      return null;
    } catch(e) { return null; }
  }

  _getRegime(bot) {
    try {
      const marketRegime = this._cleanTelemetryText(bot.marketRegime?.currentRegime);
      if (marketRegime) {
        return {
          current: marketRegime,
          confidence: this._toFiniteNumber(bot.marketRegime?.confidence, 0),
          parameters: bot.marketRegime?.parameters || {},
          source: 'marketRegime.currentRegime',
          status: 'ready'
        };
      }

      const detectorRegime = this._cleanTelemetryText(bot.regimeDetector?.currentRegime);
      if (detectorRegime) {
        return {
          current: detectorRegime,
          confidence: 0,
          parameters: {},
          source: 'regimeDetector.currentRegime',
          status: 'ready'
        };
      }

      const source = bot.marketRegime
        ? 'marketRegime.currentRegime'
        : bot.regimeDetector
          ? 'regimeDetector.currentRegime'
          : null;
      const unavailableReason = source ? 'REGIME_NOT_READY' : 'REGIME_SOURCE_NOT_ATTACHED';

      return {
        current: unavailableReason,
        confidence: 0,
        parameters: bot.marketRegime?.parameters || {},
        source,
        status: 'not_ready',
        unavailableReason
      };
    } catch(e) {
      return {
        current: null,
        confidence: 0,
        parameters: {},
        source: null,
        status: 'error',
        unavailableReason: 'REGIME_READ_FAILED',
        errorMessage: this._cleanTelemetryText(e?.message) || 'REGIME_ERROR_WITHOUT_MESSAGE'
      };
    }
  }

  _getSignals(bot) {
    const signals = {};

    // EMA Crossover
    try {
      if (bot.emaCrossover) {
        const sig = bot.emaCrossoverSignal || bot.emaCrossover.getSignal?.() || {};
        signals.emaCrossover = {
          direction: sig.direction || 'neutral',
          confidence: sig.confidence || 0,
          confluence: sig.confluence || 0,
          blowoff: sig.blowoff || false
        };
      }
    } catch(e) { signals.emaCrossover = null; }

    // Liquidity Sweep
    try {
      if (bot.liquiditySweep) {
        const sig = bot.liquiditySweepSignal || bot.liquiditySweep.getSignal?.() || {};
        signals.liquiditySweep = {
          direction: sig.direction || 'neutral',
          confidence: sig.confidence || 0,
          phase: sig.phase || 'waiting',
          hasSignal: sig.hasSignal || false
        };
      }
    } catch(e) { signals.liquiditySweep = null; }

    // MA Dynamic S/R
    try {
      if (bot.maDynamicSR) {
        const sig = bot.maDynamicSRSignal || bot.maDynamicSR.getSignal?.() || {};
        signals.maDynamicSR = {
          direction: sig.direction || 'neutral',
          confidence: sig.confidence || 0,
          activeSignals: sig.activeSignals || 0
        };
      }
    } catch(e) { signals.maDynamicSR = null; }

    return signals;
  }

  _getPatternStats(bot) {
    try {
      if (bot.patternChecker?.getMemoryStats) {
        return bot.patternChecker.getMemoryStats();
      }
      return null;
    } catch(e) { return null; }
  }

  _getActiveTrades(bot, stateManager) {
    try {
      const trades = this._getTrades(stateManager);
      if (Array.isArray(trades)) {
        return trades.map(t => ({
          orderId: t.orderId,
          direction: t.direction || 'long',
          entryPrice: t.entryPrice || t.price,
          entryTime: t.entryTime,
          holdMinutes: t.entryTime ? Math.round((Date.now() - t.entryTime) / 60000) : 0
        }));
      }
      if (trades instanceof Map) {
        return Array.from(trades.values()).map(t => ({
          orderId: t.orderId,
          direction: t.direction || 'long',
          entryPrice: t.entryPrice || t.price,
          entryTime: t.entryTime,
          holdMinutes: t.entryTime ? Math.round((Date.now() - t.entryTime) / 60000) : 0
        }));
      }
      return [];
    } catch(e) { return []; }
  }

  _getTradeStats(bot, stateManager) {
    try {
      const allTrades = this._getTrades(stateManager);
      const closed = Array.isArray(allTrades) 
        ? allTrades.filter(t => t.pnl !== undefined)
        : [];
      
      if (closed.length === 0) return { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 };

      const wins = closed.filter(t => t.pnl > 0).length;
      const losses = closed.filter(t => t.pnl <= 0).length;
      const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);

      return {
        total: closed.length,
        wins,
        losses,
        pnl: totalPnl,
        winRate: closed.length > 0 ? (wins / closed.length) : 0,
        avgPnl: closed.length > 0 ? (totalPnl / closed.length) : 0
      };
    } catch(e) { return { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 }; }
  }

  _getTraiStats(bot) {
    try {
      if (bot.trai) {
        return {
          active: true,
          pendingDecisions: bot.pendingTraiDecisions?.size || 0,
          patternMemorySize: bot.trai.patternMemory?.size || 0
        };
      }
      return { active: false };
    } catch(e) { return { active: false }; }
  }

  _getRiskStats(bot) {
    try {
      if (bot.riskManager) {
        const stats = bot.riskManager.getStats?.() || {};
        return {
          dailyPnL: stats.dailyPnL || 0,
          dailyTrades: stats.dailyTrades || 0,
          maxDrawdown: stats.maxDrawdown || 0,
          riskLevel: stats.riskLevel || 'normal'
        };
      }
      return null;
    } catch(e) { return null; }
  }

  _getModuleHealth(bot) {
    const health = {};
    const modules = [
      'indicatorEngine', 'tradingBrain', 'regimeDetector', 'patternChecker',
      'emaCrossover', 'liquiditySweep', 'maDynamicSR', 'mtfAdapter',
      'trai', 'riskManager', 'maxProfitManager', 'executionLayer',
      'fibDetector', 'srDetector', 'ogzTpo'
    ];

    for (const name of modules) {
      health[name] = bot[name] != null ? 'loaded' : 'missing';
    }

    return health;
  }

  _safeGet(fn) {
    try { return fn(); } catch(e) { return null; }
  }

  _cleanTelemetryText(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (AMBIGUOUS_TELEMETRY_VALUES.has(trimmed.toLowerCase())) return null;
    return trimmed;
  }

  _toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  _resolveStateManager(bot) {
    if (bot?.stateManager && typeof bot.stateManager.get === 'function') {
      return bot.stateManager;
    }

    try {
      const stateManagerModule = require('./StateManager');
      if (typeof stateManagerModule?.getInstance === 'function') {
        return stateManagerModule.getInstance();
      }
      if (typeof stateManagerModule?.get === 'function') {
        return stateManagerModule;
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  _getStateValue(stateManager, key, fallback) {
    if (!stateManager || typeof stateManager.get !== 'function') return fallback;
    const value = stateManager.get(key);
    return value === undefined ? null : value;
  }

  _getTrades(stateManager) {
    if (typeof stateManager?.getAllTrades === 'function') {
      return stateManager.getAllTrades();
    }

    const trades = stateManager?.get?.('activeTrades');
    if (trades instanceof Map) {
      return Array.from(trades.values());
    }
    if (Array.isArray(trades)) {
      return trades
        .map((entry) => Array.isArray(entry) ? entry[1] : entry)
        .filter(Boolean);
    }
    if (trades && typeof trades === 'object') {
      return Object.values(trades).filter(Boolean);
    }

    return [];
  }

  // Manual trigger
  now() {
    this.capture();
  }

  // Stop the interval
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[PipelineSnapshot] Stopped after ${this.snapshotCount} snapshots`);
    }
  }
}

module.exports = PipelineSnapshot;
