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

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumberOrNull(value) {
  const n = finiteNumberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function nonNegativeNumberOrNull(value) {
  const n = finiteNumberOrNull(value);
  return n !== null && n >= 0 ? n : null;
}

function nonEmptyStringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

class TradeReplayCapture {
  constructor(config = {}) {
    if (!config.replayDir) {
      throw new Error('[TradeReplayCapture] replayDir is required; refusing unscoped data/journal/replays default');
    }
    this.replayDir = config.replayDir;
    this.candlesBefore = config.candlesBefore || 60;   // candles before entry
    this.candlesAfter = config.candlesAfter || 30;     // candles after exit

    // In-memory buffer of entry snapshots waiting for their exit
    this.pendingEntries = new Map();

    // Ensure directory
    if (!fs.existsSync(this.replayDir)) {
      fs.mkdirSync(this.replayDir, { recursive: true });
    }

    console.log('[TradeReplayCapture] initialized');
  }

  /**
   * Capture candle context at trade ENTRY
   * @param {string} orderId
   * @param {Object} entryData - { price, direction, confidence, regime, patterns, indicators }
   * @param {Array} priceHistory - Bot's current candle array [{o,h,l,c,v,t}, ...]
   */
  captureEntry(orderId, entryData, priceHistory) {
    const id = nonEmptyStringOrNull(orderId);
    const direction = nonEmptyStringOrNull(entryData?.direction);
    const price = positiveNumberOrNull(entryData?.price);
    if (!id || !direction || price === null || !priceHistory || priceHistory.length === 0) return null;

    // Grab the last N candles leading up to entry
    const candleSnapshot = priceHistory.slice(-this.candlesBefore).map(candle => ({
      o: o(candle), h: h(candle), l: l(candle), c: c(candle), v: v(candle),
      t: t(candle)  // timestamp in ms
    }));

    this.pendingEntries.set(id, {
      orderId: id,
      capturedAt: Date.now(),
      direction,
      entry: {
        // TRC-MED-02: prefer caller-supplied timestamp over wall clock
        time: entryData.timestamp ?? Date.now(),
        // TRC-MED-01: ?? on numerics (preserve zero); ?? null on strings.
        // Replay is non-critical — null-propagate rather than throw.
        price,
        confidence: finiteNumberOrNull(entryData.confidence),
        regime: nonEmptyStringOrNull(entryData.regime),
        patterns: Array.isArray(entryData.patterns) ? entryData.patterns.map(p => ({
          name: nonEmptyStringOrNull(p?.name) ?? nonEmptyStringOrNull(p?.type),
          confidence: finiteNumberOrNull(p?.confidence)
        })).filter(p => p.name !== null) : [],
        indicators: {
          rsi: finiteNumberOrNull(entryData.indicators?.rsi),
          macd: finiteNumberOrNull(entryData.indicators?.macd),
          trend: nonEmptyStringOrNull(entryData.indicators?.trend),
          volatility: finiteNumberOrNull(entryData.indicators?.volatility)
        }
      },
      candlesAtEntry: candleSnapshot
    });
    return this.pendingEntries.get(id);
  }

  /**
   * Capture candle context at trade EXIT and save complete replay
   * @param {string} orderId
   * @param {Object} exitData - { price, reason, pnl, pnlPercent, holdTime }
   * @param {Array} priceHistory - Bot's current candle array
   * @returns {string|null} Path to saved replay file
   */
  captureExit(orderId, exitData, priceHistory) {
    const id = nonEmptyStringOrNull(orderId);
    if (!id) return null;

    const pending = this.pendingEntries.get(id);
    if (!pending) {
      console.warn(`[TradeReplayCapture] Refusing exit replay for ${id}; missing entry capture`);
      return null;
    }

    const exitPrice = positiveNumberOrNull(exitData?.price ?? exitData?.exitPrice);
    const reason = nonEmptyStringOrNull(exitData?.reason);
    const pnl = finiteNumberOrNull(exitData?.pnl);
    const holdTimeMs = nonNegativeNumberOrNull(exitData?.holdTime) ?? nonNegativeNumberOrNull(Date.now() - pending.capturedAt);
    if (exitPrice === null || !reason || pnl === null || holdTimeMs === null) {
      console.warn(`[TradeReplayCapture] Refusing incomplete exit replay for ${id}`);
      return null;
    }

    const entryCandles = pending.candlesAtEntry;

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
      orderId: id,
      direction: pending.direction,
      _noEntryCapture: false,
      entry: pending.entry,
      exit: {
        time: exitData.exitTimestamp ?? Date.now(),
        price: exitPrice,
        reason,
        pnl,
        pnlPercent: finiteNumberOrNull(exitData.pnlPercent),
        holdTimeMs
      },
      candles: mergedCandles,
      candleCount: mergedCandles.length,
      savedAt: Date.now()
    };

    // Save to disk
    const filepath = path.join(this.replayDir, `${id}.json`);
    try {
      const { writeJsonCompactAtomic } = require('./AtomicWrite');
      writeJsonCompactAtomic(filepath, replay);
      console.log(`[TradeReplayCapture] Replay saved: ${id} (${mergedCandles.length} candles)`);
    } catch (err) {
      console.warn(`[TradeReplayCapture] Replay save failed: ${err.message}`);
      return null;
    }

    // Cleanup pending
    this.pendingEntries.delete(id);

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
          const orderId = nonEmptyStringOrNull(data.orderId);
          if (!orderId) return null;
          return {
            orderId,
            direction: nonEmptyStringOrNull(data.direction),
            pnl: finiteNumberOrNull(data.exit?.pnl),
            entryPrice: positiveNumberOrNull(data.entry?.price),
            exitPrice: positiveNumberOrNull(data.exit?.price),
            reason: nonEmptyStringOrNull(data.exit?.reason),
            savedAt: nonNegativeNumberOrNull(data.savedAt)
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
