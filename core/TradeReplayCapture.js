/**
 * ============================================================================
 * TradeReplayCapture — Snapshot Candle Context For Every Trade
 * ============================================================================
 *
 * When a trade opens or closes, this module grabs a snapshot of the surrounding
 * candle data so the trade can be visually replayed on a chart later.
 *
 * STORAGE:
 * ```
 * data/journal/replays/
 * └── {orderId}.json    ← candles + entry/exit markers + metadata
 * ```
 *
 * Each replay file is a self-contained packet:
 * {
 *   orderId, direction, entryPrice, exitPrice, pnl,
 *   candles: [ {o,h,l,c,v,t} ... ],   // surrounding price action
 *   entry: { time, price, confidence, regime, patterns },
 *   exit:  { time, price, reason, holdTime },
 *   indicators: { rsi, macd, trend }
 * }
 *
 * The Trade Replay Card (HTML) reads this file and renders it.
 *
 * @module core/TradeReplayCapture
 * @version 1.0.0
 */

const fs = require('fs');
const { c, o, h, l, v, t } = require('./CandleHelper');
const path = require('path');

class TradeReplayCapture {
  constructor(config = {}) {
    this.replayDir = config.replayDir || path.join(process.cwd(), 'data', 'journal', 'replays');
    this.candlesBefore = config.candlesBefore || 60;   // candles before entry
    this.candlesAfter = config.candlesAfter || 30;     // candles after exit

    // In-memory buffer of entry snapshots waiting for their exit
    this.pendingEntries = new Map();

    // Ensure directory
    if (!fs.existsSync(this.replayDir)) {
      fs.mkdirSync(this.replayDir, { recursive: true });
    }

    console.log('🎬 TradeReplayCapture initialized');
  }

  /**
   * Capture candle context at trade ENTRY
   * @param {string} orderId
   * @param {Object} entryData - { price, direction, confidence, regime, patterns, indicators }
   * @param {Array} priceHistory - Bot's current candle array [{o,h,l,c,v,t}, ...]
   */
  captureEntry(orderId, entryData, priceHistory) {
    if (!orderId || !priceHistory || priceHistory.length === 0) return;

    // Grab the last N candles leading up to entry
    const candleSnapshot = priceHistory.slice(-this.candlesBefore).map(candle => ({
      o: o(candle), h: h(candle), l: l(candle), c: c(candle), v: v(candle),
      t: t(candle)  // timestamp in ms
    }));

    this.pendingEntries.set(orderId, {
      orderId,
      capturedAt: Date.now(),
      direction: entryData.direction ?? 'BUY',
      entry: {
        // TRC-MED-02: prefer caller-supplied timestamp over wall clock
        time: entryData.timestamp ?? Date.now(),
        // TRC-MED-01: ?? on numerics (preserve zero); ?? null on strings.
        // Replay is non-critical — null-propagate rather than throw.
        price: entryData.price ?? null,
        confidence: entryData.confidence ?? null,
        regime: entryData.regime ?? null,
        patterns: (entryData.patterns || []).map(p => ({
          name: p.name ?? p.type ?? null,
          confidence: p.confidence ?? null
        })),
        indicators: {
          rsi: entryData.indicators?.rsi ?? null,
          macd: entryData.indicators?.macd ?? null,
          trend: entryData.indicators?.trend ?? null,
          volatility: entryData.indicators?.volatility ?? null
        }
      },
      candlesAtEntry: candleSnapshot
    });
  }

  /**
   * Capture candle context at trade EXIT and save complete replay
   * @param {string} orderId
   * @param {Object} exitData - { price, reason, pnl, pnlPercent, holdTime }
   * @param {Array} priceHistory - Bot's current candle array
   * @returns {string|null} Path to saved replay file
   */
  captureExit(orderId, exitData, priceHistory) {
    const pending = this.pendingEntries.get(orderId);

    // Build the replay even without a pending entry (exit-only trade)
    const entryCandles = pending?.candlesAtEntry || [];

    // Grab current candles (includes during + after trade)
    const currentCandles = (priceHistory || []).slice(-this.candlesBefore).map(candle => ({
      o: o(candle), h: h(candle), l: l(candle), c: c(candle), v: v(candle),
      t: t(candle)
    }));

    // Merge: entry candles + current candles, deduplicate by timestamp
    const seen = new Set();
    const mergedCandles = [];
    for (const c of [...entryCandles, ...currentCandles]) {
      const key = c.t;
      if (!seen.has(key)) {
        seen.add(key);
        mergedCandles.push(c);
      }
    }
    mergedCandles.sort((a, b) => a.t - b.t);

    // Build complete replay packet
    // TRC-MED-03: skip recording entirely when there's no pending entry capture
    // (exit-only trade had no entry checkpoint). Old behavior fabricated phantom
    // entry data which corrupted replay analytics. Set _noEntryCapture: true so
    // downstream consumers can filter exit-only records.
    const replay = {
      orderId,
      direction: pending?.direction ?? exitData.direction ?? 'BUY',
      _noEntryCapture: !pending,
      entry: pending?.entry ?? null,
      exit: {
        time: exitData.exitTimestamp ?? Date.now(),
        price: exitData.price ?? exitData.exitPrice ?? null,
        reason: exitData.reason ?? null,
        pnl: exitData.pnl ?? null,
        pnlPercent: exitData.pnlPercent ?? null,
        holdTimeMs: exitData.holdTime ?? (pending ? Date.now() - pending.capturedAt : null)
      },
      candles: mergedCandles,
      candleCount: mergedCandles.length,
      savedAt: Date.now()
    };

    // Save to disk
    const filepath = path.join(this.replayDir, `${orderId}.json`);
    try {
      const { writeJsonCompactAtomic } = require('./AtomicWrite');
      writeJsonCompactAtomic(filepath, replay);
      console.log(`🎬 Replay saved: ${orderId} (${mergedCandles.length} candles)`);
    } catch (err) {
      console.warn(`🎬 Replay save failed: ${err.message}`);
      return null;
    }

    // Cleanup pending
    this.pendingEntries.delete(orderId);

    return filepath;
  }

  /**
   * Load a replay by orderId
   * @param {string} orderId
   * @returns {Object|null} Replay data
   */
  loadReplay(orderId) {
    const filepath = path.join(this.replayDir, `${orderId}.json`);
    if (!fs.existsSync(filepath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * List all available replays
   * @param {number} [limit] - Max to return
   * @returns {Array} [{ orderId, direction, pnl, savedAt }]
   */
  listReplays(limit = 100) {
    try {
      const files = fs.readdirSync(this.replayDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-limit);

      return files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.replayDir, f), 'utf8'));
          return {
            orderId: data.orderId,
            direction: data.direction,
            pnl: data.exit?.pnl || 0,
            entryPrice: data.entry?.price || 0,
            exitPrice: data.exit?.price || 0,
            reason: data.exit?.reason || '',
            savedAt: data.savedAt || 0
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }
}

module.exports = TradeReplayCapture;
