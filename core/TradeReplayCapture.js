const ConfigLoader = require('../foundation/ConfigLoader');
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
const { normalizePatternScope } = require('./PatternScope');

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

function jsonCloneOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  return JSON.parse(JSON.stringify(value));
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = nonEmptyStringOrNull(value);
    if (normalized) return normalized;
  }
  return null;
}

function copyClosedCandle(candle) {
  const timestamp = finiteNumberOrNull(t(candle));
  const endTimestamp = finiteNumberOrNull(candle?.etime);
  const open = finiteNumberOrNull(o(candle));
  const high = finiteNumberOrNull(h(candle));
  const low = finiteNumberOrNull(l(candle));
  const close = finiteNumberOrNull(c(candle));
  const volume = finiteNumberOrNull(v(candle));
  if (timestamp === null || endTimestamp === null || open === null || high === null || low === null || close === null || volume === null) {
    return null;
  }
  return { o: open, h: high, l: low, c: close, v: volume, t: timestamp, etime: endTimestamp };
}

function replayScope(scope, caller) {
  const normalized = normalizePatternScope(
    scope && typeof scope === 'object' ? scope : {},
    caller
  );
  return normalized.ok ? normalized : null;
}

class TradeReplayCapture {
  constructor(config = {}) {
    this.replayDir = config.replayDir;
    this.candlesBefore = config.candlesBefore;
    this.candlesAfter = config.candlesAfter;

    // In-memory buffer of entry snapshots waiting for their exit
    this.pendingEntries = new Map();
    this.postExitCaptures = new Map();

    // Ensure directory
    if (!fs.existsSync(this.replayDir)) {
      fs.mkdirSync(this.replayDir, { recursive: true });
    }

    this.loadFailures = [];
    for (const file of fs.readdirSync(this.replayDir).filter(file => file.endsWith('.json') && !file.endsWith('.entry.json'))) {
      try {
        const replay = JSON.parse(fs.readFileSync(path.join(this.replayDir, file), 'utf8'));
        const scope = replayScope(replay.postExit?.scope, 'TradeReplayCapture.savedPostExit');
        if (replay.postExit?.complete === false && Number.isInteger(replay.postExit.requestedCandles) && scope) {
          this.postExitCaptures.set(replay.orderId, {
            filepath: path.join(this.replayDir, file), replay, scope,
            candleEndTimes: new Set(replay.postExitCandles.map(candle => candle.etime)),
            persistedCandleCount: replay.postExitCandles.length,
          });
        }
      } catch (error) {
        this.loadFailures.push({ file, reason: error.message });
      }
    }
    console.log('[TradeReplayCapture] initialized');
  }

  /**
   * Capture candle context at trade ENTRY
   * @param {string} orderId
   * @param {Object} entryData - { price, direction, confidence, regime, patterns, indicators }
   * @param {Array} priceHistory - Bot's current candle array [{o,h,l,c,v,t}, ...]
   */
  captureEntry(orderId, entryData, priceHistory, scope = null) {
    const id = nonEmptyStringOrNull(orderId);
    const direction = nonEmptyStringOrNull(entryData?.direction);
    const price = positiveNumberOrNull(entryData?.price);
    const timestamp = nonNegativeNumberOrNull(entryData?.timestamp);
    if (!id || path.basename(id) !== id || !direction || price === null || timestamp === null) return null;
    const entryPath = path.join(this.replayDir, `${id}.entry.json`);
    if (fs.existsSync(entryPath)) {
      const saved = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      this.pendingEntries.set(id, saved);
      return saved;
    }

    // Grab the last N candles leading up to entry
    const candleSnapshot = (Array.isArray(priceHistory) ? priceHistory : []).slice(-this.candlesBefore).map(candle => ({
      o: o(candle), h: h(candle), l: l(candle), c: c(candle), v: v(candle),
      t: t(candle)  // timestamp in ms
    }));

    this.pendingEntries.set(id, {
      orderId: id,
      capturedAt: Date.now(),
      direction,
      entry: {
        // TRC-MED-02: prefer caller-supplied timestamp over wall clock
        time: timestamp,
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
        },
        entryStrategy: firstNonEmptyString(entryData.entryStrategy, entryData.strategy, entryData.winnerStrategy),
        winnerStrategy: firstNonEmptyString(entryData.winnerStrategy, entryData.entryStrategy, entryData.strategy),
        strategy: firstNonEmptyString(entryData.strategy, entryData.entryStrategy, entryData.winnerStrategy),
        signalId: nonEmptyStringOrNull(entryData.signalId),
        decisionId: nonEmptyStringOrNull(entryData.decisionId),
        traceId: nonEmptyStringOrNull(entryData.traceId),
        signalBasis: nonEmptyStringOrNull(entryData.signalBasis),
        crossoverCount: finiteNumberOrNull(entryData.crossoverCount),
        decisionLedger: jsonCloneOrNull(entryData.decisionLedger),
        strategySignals: Array.isArray(entryData.strategySignals) ? jsonCloneOrNull(entryData.strategySignals) : null,
        orchestratorDecision: jsonCloneOrNull(entryData.orchestratorDecision),
        competingStrategies: Array.isArray(entryData.competingStrategies) ? jsonCloneOrNull(entryData.competingStrategies) : null,
        confluence: jsonCloneOrNull(entryData.confluence),
        positionSizing: jsonCloneOrNull(entryData.positionSizing),
        exitContract: jsonCloneOrNull(entryData.exitContract),
        riskGates: jsonCloneOrNull(entryData.riskGates)
      },
      candlesAtEntry: candleSnapshot,
      candleContext: candleSnapshot.length ? 'captured_at_entry' : 'unavailable_at_entry',
      scope: replayScope(scope, 'TradeReplayCapture.captureEntry')
    });
    const saved = this.pendingEntries.get(id);
    require('./AtomicWrite').writeJsonCompactAtomic(entryPath, saved);
    return saved;
  }

  /**
   * Capture candle context at trade EXIT and save complete replay
   * @param {string} orderId
   * @param {Object} exitData - { price, reason, pnl, pnlPercent, holdTime }
   * @param {Array} priceHistory - Bot's current candle array
   * @returns {Object} Saved replay status, reason and path
   */
  captureExitResult(orderId, exitData, priceHistory, scope = null) {
    const id = nonEmptyStringOrNull(orderId);
    if (!id || path.basename(id) !== id) return { status: 'unavailable', reason: 'invalid_order_id', path: null };

    const completedPath = path.join(this.replayDir, `${id}.json`);
    if (fs.existsSync(completedPath)) {
      const previous = this.loadReplay(id);
      if (previous.status !== 'available') return { status: 'unavailable', reason: previous.reason, path: null };
      return previous.data.exit?.time === exitData.exitTimestamp
        ? { status: 'saved', reason: null, path: completedPath }
        : { status: 'unavailable', reason: 'existing_replay_exit_conflict', path: null };
    }
    let pending = this.pendingEntries.get(id);
    const entryPath = path.join(this.replayDir, `${id}.entry.json`);
    if (!pending && fs.existsSync(entryPath)) {
      try {
        pending = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      } catch (error) {
        return { status: 'unavailable', reason: 'entry_capture_unreadable', message: error.message, path: null };
      }
    }
    if (!pending) {
      console.warn(`[TradeReplayCapture] Refusing exit replay for ${id}; missing entry capture`);
      return { status: 'unavailable', reason: 'missing_entry_capture', path: null };
    }

    const exitPrice = positiveNumberOrNull(exitData?.price ?? exitData?.exitPrice);
    const reason = nonEmptyStringOrNull(exitData?.reason);
    const pnl = finiteNumberOrNull(exitData?.pnl);
    const holdTimeMs = nonNegativeNumberOrNull(exitData?.holdTime);
    const exitTimestamp = nonNegativeNumberOrNull(exitData?.exitTimestamp);
    if (exitPrice === null || !reason || pnl === null || holdTimeMs === null || exitTimestamp === null) {
      console.warn(`[TradeReplayCapture] Refusing incomplete exit replay for ${id}`);
      return { status: 'unavailable', reason: 'invalid_exit_input', path: null };
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
    const resolvedScope = replayScope(scope, 'TradeReplayCapture.captureExitResult') || pending.scope;
    const requestedCandles = Number.isInteger(this.candlesAfter) && this.candlesAfter >= 0
      ? this.candlesAfter
      : null;
    const replay = {
      orderId: id,
      direction: pending.direction,
      _noEntryCapture: false,
      accountingBasis: exitData.accountingBasis,
      exitFills: exitData.exitFills,
      candleContext: pending.candleContext,
      captureScope: 'entry_and_exit_windows_plus_recorded_post_exit_candles',
      entry: pending.entry,
      exit: {
        time: exitTimestamp,
        price: exitPrice,
        reason,
        pnl,
        pnlPercent: finiteNumberOrNull(exitData.pnlPercent),
        holdTimeMs
      },
      candles: mergedCandles,
      exitCandleContext: currentCandles.length ? 'captured_at_exit' : 'unavailable_at_exit',
      candleCount: mergedCandles.length,
      postExitCandles: [],
      postExit: {
        requestedCandles,
        capturedCandles: 0,
        complete: requestedCandles === 0,
        scope: resolvedScope ? {
          brokerId: resolvedScope.brokerId,
          accountId: resolvedScope.accountId,
          accountIdSource: resolvedScope.accountIdSource,
          assetClass: resolvedScope.assetClass,
          executionMode: resolvedScope.executionMode,
          symbol: resolvedScope.symbol,
          timeframe: resolvedScope.timeframe,
          scopeKey: resolvedScope.scopeKey,
          scopeKeyVersion: resolvedScope.scopeKeyVersion,
        } : null,
      },
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
      return { status: 'retryable', reason: 'persistence_failure', message: err.message, path: null };
    }

    this.pendingEntries.delete(id);

    if (requestedCandles !== null && requestedCandles > 0 && resolvedScope) {
      this.postExitCaptures.set(id, {
        filepath,
        replay,
        scope: resolvedScope,
        candleEndTimes: new Set(),
        persistedCandleCount: 0,
      });
    }

    return { status: 'saved', reason: null, path: filepath };
  }

  /**
   * Appends a broker-confirmed closed candle after a recorded exit. The replay's
   * post-exit region is deliberately separate from its entry/exit candle context.
   */
  capturePostExitCandle(candle, scope = null) {
    const producerScope = replayScope(scope, 'TradeReplayCapture.capturePostExitCandle');
    const closedCandle = copyClosedCandle(candle);
    const result = { captured: 0, failures: [] };
    if (!producerScope || !closedCandle) return result;

    for (const [orderId, pending] of this.postExitCaptures.entries()) {
      if (pending.scope.scopeKey !== producerScope.scopeKey) continue;
      if (closedCandle.t < pending.replay.exit.time) continue;

      if (!pending.replay.postExit.complete && !pending.candleEndTimes.has(closedCandle.etime)) {
        pending.candleEndTimes.add(closedCandle.etime);
        pending.replay.postExitCandles.push(closedCandle);
      }
      if (pending.persistedCandleCount === pending.replay.postExitCandles.length) continue;
      pending.replay.postExit.capturedCandles = pending.replay.postExitCandles.length;
      pending.replay.postExit.complete = pending.replay.postExit.capturedCandles >= pending.replay.postExit.requestedCandles;
      pending.replay.savedAt = Date.now();

      try {
        const { writeJsonCompactAtomic } = require('./AtomicWrite');
        writeJsonCompactAtomic(pending.filepath, pending.replay);
      } catch (err) {
        // The feed owns candle delivery, not replay persistence. Keep every
        // captured candle so the next same-scope boundary can save it too.
        result.failures.push({
          orderId,
          scope: pending.scope,
          capturedCandles: pending.replay.postExit.capturedCandles,
          persistedCandles: pending.persistedCandleCount,
          requestedCandles: pending.replay.postExit.requestedCandles,
          code: err.code || null,
          message: err.message,
        });
        continue;
      }

      pending.persistedCandleCount = pending.replay.postExit.capturedCandles;
      result.captured += 1;
      if (pending.replay.postExit.complete) this.postExitCaptures.delete(orderId);
    }
    return result;
  }

  /**
   * Load a replay by orderId
   * @param {string} orderId
   * @returns {Object|null} Replay data
   */
  loadReplay(orderId) {
    const id = nonEmptyStringOrNull(orderId);
    if (!id || path.basename(id) !== id) return { status: 'unavailable', reason: 'invalid_order_id', data: null };
    const filepath = path.join(this.replayDir, `${id}.json`);
    if (!fs.existsSync(filepath)) return { status: 'missing', reason: 'replay_not_recorded', data: null };
    try {
      return { status: 'available', data: JSON.parse(fs.readFileSync(filepath, 'utf8')) };
    } catch (error) {
      return { status: 'unavailable', reason: error.message, data: null };
    }
  }

  listReplays(limit = ConfigLoader.getInternalsFileValue('journal.replayCapturePolicy.listDefaultLimit')) {
    const data = [];
    const failures = [];
    try {
      for (const file of fs.readdirSync(this.replayDir).filter(file => file.endsWith('.json') && !file.endsWith('.entry.json'))) {
        try {
          const replay = JSON.parse(fs.readFileSync(path.join(this.replayDir, file), 'utf8'));
          if (!nonEmptyStringOrNull(replay.orderId) || !Number.isFinite(replay.savedAt)) {
            failures.push({ file, reason: 'replay_identity_or_timestamp_missing' });
            continue;
          }
          data.push({ orderId: replay.orderId, direction: replay.direction, pnl: finiteNumberOrNull(replay.exit?.pnl),
            savedAt: replay.savedAt, scopeKey: replay.postExit?.scope?.scopeKey,
            accountingBasis: replay.accountingBasis || 'legacy_recorded_value' });
        } catch (error) { failures.push({ file, reason: error.message }); }
      }
    } catch (error) { failures.push({ reason: error.message }); }
    data.sort((a, b) => b.savedAt - a.savedAt);
    return { status: failures.length ? 'partial' : 'available', data: data.slice(0, limit), failures };
  }

}

module.exports = TradeReplayCapture;
