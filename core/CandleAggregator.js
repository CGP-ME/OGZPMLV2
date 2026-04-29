/**
 * CandleAggregator - Phase 3 of Modular Architecture Refactor
 *
 * PURPOSE: Builds higher timeframe candles from lower timeframe. Pure transformation.
 *
 * Self-contained: Yes - pure math, no external deps.
 * Hot-swap: Yes - can swap aggregation backend.
 *
 * @see ogz-meta/REFACTOR-PLAN-2026-02-27.md
 */

const { c: _c, o: _o, h: _h, l: _l, v: _v, t: _t } = require('./CandleHelper');

class CandleAggregator {
  constructor() {
    // Timeframe configs in milliseconds
    this.TIMEFRAME_MS = {
      '1m':  60000,
      '5m':  300000,
      '15m': 900000,
      '30m': 1800000,
      '1h':  3600000,
      '4h':  14400000,
      '1d':  86400000
    };

    // Multi-Symbol Phase 2 (2026-04-29): per-symbol per-target-TF stream
    // state for ingest(). Map<symbol, Map<targetTF, { periodStart, candles[] }>>
    // Symbol-aware from day 1 so Phase 3 (multi-symbol subscribe) doesn't
    // require Phase 4 (SymbolContext) to land first; Phase 4 just changes
    // WHERE the aggregator lives, not its API.
    this._streamState = new Map();
  }

  /**
   * Streaming aggregation. Feed 1m candles one at a time; emit any
   * higher-timeframe candles whose period just completed (detected when
   * a new 1m candle's period start differs from the buffered period).
   *
   * @param {string} symbol — trading symbol (TSLA, BTC/USD, etc.)
   * @param {Object} candle1m — single 1m candle in canonical OHLCV form
   * @param {string[]} targetTimeframes — which higher TFs to build (default ['5m','15m','30m'])
   * @returns {Array<{timeframe: string, candle: Object}>} emissions this tick
   */
  ingest(symbol, candle1m, targetTimeframes = ['5m', '15m', '30m']) {
    if (!candle1m || typeof symbol !== 'string') return [];
    const ts = _t(candle1m);
    if (typeof ts !== 'number' || !isFinite(ts)) return [];

    if (!this._streamState.has(symbol)) {
      this._streamState.set(symbol, new Map());
    }
    const symbolState = this._streamState.get(symbol);

    const emissions = [];
    for (const tf of targetTimeframes) {
      const intervalMs = this.TIMEFRAME_MS[tf];
      if (!intervalMs) continue;
      const candlePeriodStart = Math.floor(ts / intervalMs) * intervalMs;

      let buf = symbolState.get(tf);
      if (!buf) {
        // First candle for this (symbol, tf)
        symbolState.set(tf, { periodStart: candlePeriodStart, candles: [candle1m] });
        continue;
      }

      if (candlePeriodStart === buf.periodStart) {
        // Same period. Mercury Q3 fix (2026-04-29): dedupe by timestamp.
        // If the incoming 1m has the same `t` as the last buffered candle,
        // it's an UPDATE to an in-progress 1m (live broker tick refining
        // the candle as it forms). Replace last-in-place rather than
        // append, mirroring CandleStore.addCandle's same-timestamp semantic.
        const last = buf.candles[buf.candles.length - 1];
        if (last && _t(last) === ts) {
          buf.candles[buf.candles.length - 1] = candle1m;
        } else {
          buf.candles.push(candle1m);
        }
      } else if (candlePeriodStart > buf.periodStart) {
        // New period started — emit completed candle from prior buffer, start fresh
        emissions.push({
          timeframe: tf,
          candle: this.buildCandle(buf.candles, buf.periodStart),
        });
        buf.periodStart = candlePeriodStart;
        buf.candles = [candle1m];
      } else {
        // Out-of-order: candle's period is BEFORE the current buffer's.
        // Don't corrupt buffer state. Skip with a warning. (Should not
        // occur with normal broker live feeds; can occur during backfill
        // replay if 1m candles arrive non-monotonically.)
        console.warn(`[CandleAggregator] out-of-order 1m candle for ${symbol} ${tf} — buffered period ${buf.periodStart}, candle period ${candlePeriodStart}; skipping`);
      }
    }
    return emissions;
  }

  /**
   * Reset stream state for a single symbol. Used by SessionRouter on
   * crypto/stocks swap so cross-asset 1m candles don't pollute each
   * other's HTF buffers.
   */
  resetSymbol(symbol) {
    this._streamState.delete(symbol);
  }

  /** Reset all stream state across all symbols. */
  resetAll() {
    this._streamState.clear();
  }

  /**
   * Aggregate 1m candles into higher timeframe candles
   *
   * @param {Array} candles1m - Array of 1-minute candles
   * @param {string} targetTimeframe - Target timeframe ('5m', '15m', '1h', etc.)
   * @returns {Array} Aggregated candles
   */
  aggregate(candles1m, targetTimeframe) {
    if (!candles1m || candles1m.length === 0) {
      return [];
    }

    const intervalMs = this.TIMEFRAME_MS[targetTimeframe];
    if (!intervalMs) {
      throw new Error(`Unknown timeframe: ${targetTimeframe}`);
    }

    // Group candles by period
    const groups = new Map();

    for (const candle of candles1m) {
      const timestamp = _t(candle);
      const periodStart = Math.floor(timestamp / intervalMs) * intervalMs;

      if (!groups.has(periodStart)) {
        groups.set(periodStart, []);
      }
      groups.get(periodStart).push(candle);
    }

    // Build aggregated candles from groups
    const aggregated = [];
    for (const [periodStart, candlesInPeriod] of groups) {
      aggregated.push(this.buildCandle(candlesInPeriod, periodStart));
    }

    // Sort by timestamp
    aggregated.sort((a, b) => a.t - b.t);

    return aggregated;
  }

  /**
   * Build a single candle from array of candles
   *
   * @param {Array} candles - Array of candles to combine
   * @param {number} timestamp - Optional timestamp override for aggregated candle
   * @returns {Object} Single aggregated candle in Kraken format (t,o,h,l,c,v)
   */
  buildCandle(candles, timestamp = null) {
    if (!candles || candles.length === 0) {
      return null;
    }

    // First candle's open, last candle's close
    const open = _o(candles[0]);
    const close = _c(candles[candles.length - 1]);

    // High is max of all highs, low is min of all lows
    let high = _h(candles[0]);
    let low = _l(candles[0]);
    let volume = 0;

    for (const candle of candles) {
      high = Math.max(high, _h(candle));
      low = Math.min(low, _l(candle));
      volume += _v(candle) || 0;
    }

    return {
      t: timestamp !== null ? timestamp : _t(candles[0]),
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume
    };
  }

  /**
   * Check if a candle period is complete based on current timestamp
   *
   * @param {number} candleTimestamp - The candle's period start timestamp
   * @param {string} timeframe - The timeframe of the candle
   * @param {number} currentTimestamp - Current time (optional, defaults to now)
   * @returns {boolean} True if the period is complete
   */
  isPeriodComplete(candleTimestamp, timeframe, currentTimestamp = Date.now()) {
    const intervalMs = this.TIMEFRAME_MS[timeframe];
    if (!intervalMs) {
      return false;
    }

    const periodEnd = candleTimestamp + intervalMs;
    return currentTimestamp >= periodEnd;
  }

  /**
   * Get the period start timestamp for a given timestamp and timeframe
   *
   * @param {number} timestamp - Any timestamp within the period
   * @param {string} timeframe - The timeframe
   * @returns {number} The period start timestamp
   */
  getPeriodStart(timestamp, timeframe) {
    const intervalMs = this.TIMEFRAME_MS[timeframe];
    if (!intervalMs) {
      return timestamp;
    }

    return Math.floor(timestamp / intervalMs) * intervalMs;
  }

  /**
   * Get supported timeframes
   *
   * @returns {string[]} Array of supported timeframe strings
   */
  getSupportedTimeframes() {
    return Object.keys(this.TIMEFRAME_MS);
  }

  /**
   * Get interval in milliseconds for a timeframe
   *
   * @param {string} timeframe - The timeframe
   * @returns {number} Interval in milliseconds
   */
  getIntervalMs(timeframe) {
    return this.TIMEFRAME_MS[timeframe] || 0;
  }
}

module.exports = { CandleAggregator };
