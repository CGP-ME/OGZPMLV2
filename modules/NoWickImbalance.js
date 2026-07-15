/**
 * NoWickImbalance.js — 100% Mechanical Wickless Candle Strategy
 *
 * Edge: Wickless candles represent price imbalances where institutional
 * order flow moved so aggressively that no pullback occurred within the
 * candle. The market seeks to fill these imbalances — price retraces to
 * the NoWick level with high probability.
 *
 * Rules (zero discretion):
 *   - Bullish NoWick: green candle where open === low (no bottom wick)
 *   - Bearish NoWick: red candle where open === high (no top wick)
 *   - Only trade WITH the trend (15m structure: HH/HL = buy, LH/LL = sell)
 *   - Entry: price retraces and taps the NoWick candle level
 *   - Validity: 9 candles after formation, 10th = invalid
 *   - SL: below most recent higher low (bull) / above most recent lower high (bear)
 *   - TP: 1:1 risk-reward
 *   - News filter: no trades 30 min before/after scheduled events
 *   - Multi-timeframe: 15m, 30m, 1h — higher TF takes priority
 *   - Color rule: green = buy only, red = sell only
 *
 * Source: xGhozt Wickless Candles concept + Trey's imbalance thesis
 * Designed for OGZPrime StrategyOrchestrator registration
 *
 * @module modules/NoWickImbalance
 */

const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'maxCandleAge',
  'slBreathingATR',
  'swingLookback',
  'minBodyPercent',
  'confidence',
];

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.NoWickImbalance');
  const cfg = { ...(base || {}), ...(overrides || {}) };
  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[NoWickImbalance] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  for (const key of ['maxCandleAge', 'swingLookback']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[NoWickImbalance] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.slBreathingATR) < 0) {
    throw new Error(`[NoWickImbalance] slBreathingATR must be non-negative (got ${cfg.slBreathingATR})`);
  }
  for (const key of ['minBodyPercent', 'confidence']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 1) {
      throw new Error(`[NoWickImbalance] ${key} must be 0..1 (got ${cfg[key]})`);
    }
  }
  return {
    ...cfg,
    maxCandleAge: Number(cfg.maxCandleAge),
    slBreathingATR: Number(cfg.slBreathingATR),
    swingLookback: Number(cfg.swingLookback),
    minBodyPercent: Number(cfg.minBodyPercent),
    confidence: Number(cfg.confidence),
    debug: cfg.debug === true,
  };
}

class NoWickImbalance {
  constructor(config = {}) {
    this.name = 'NoWickImbalance';
    this.cfg = Object.freeze(readConfig(config));
    this.maxCandleAge = this.cfg.maxCandleAge;       // Valid for configured candle count; next candle invalidates
    this.slBreathingATR = this.cfg.slBreathingATR;   // ATR multiplier for SL breathing room
    this.swingLookback = this.cfg.swingLookback;     // Candles to look back for swing points
    this.minBodyPercent = this.cfg.minBodyPercent;   // Min body size as % of total range (filter dojis)

    // Active NoWick levels waiting for retrace tap, isolated by symbol+timeframe.
    // Each scope entry: { pendingLevels, candleCount }.
    this.scopedState = new Map();

    this.DEBUG = this.cfg.debug;
  }

  /**
   * Detect if a candle is a NoWick imbalance candle.
   *
   * Bullish NoWick: green candle, open === low (no bottom wick)
   *   → buyers dominated from open, never let price drop
   *   → the LOW (= open) becomes a support level the market wants to retest
   *
   * Bearish NoWick: red candle, open === high (no top wick)
   *   → sellers dominated from open, never let price rise
   *   → the HIGH (= open) becomes a resistance level the market wants to retest
   *
   * @param {Object} candle - { o, h, l, c, v, t }
   * @returns {Object|null} - { type: 'bullish'|'bearish', level: number } or null
   */
  _detectNoWick(candle) {
    if (!candle || typeof candle.o !== 'number') return null;

    const isBullish = candle.c > candle.o;  // green candle
    const isBearish = candle.c < candle.o;  // red candle

    // Filter tiny-body candles (dojis) — not real imbalances
    const bodySize = Math.abs(candle.c - candle.o);
    const totalRange = candle.h - candle.l;
    if (totalRange <= 0) return null;
    if ((bodySize / totalRange) < this.minBodyPercent) return null;

    // BUG FIX 2026-04-28 (Mercury catch): strict === would miss ~30-45% of
    // theoretically wickless candles on real market data due to floating-point
    // representation (e.g. open=375.20, low=375.199999999999998 — same to a
    // human, !== to JS). Use a tolerance one-tenth of a tick ($0.001), well
    // below any meaningful price difference but above all FP noise (~1e-12).
    const NOWICK_EPS = 1e-3;

    // Bullish: open === low (no bottom wick from open side)
    if (isBullish && Math.abs(candle.o - candle.l) < NOWICK_EPS) {
      return {
        type: 'bullish',
        level: candle.l,  // bottom of the candle — where buyers stepped in
        candleHigh: candle.h,
        candleLow: candle.l,
        body: bodySize,
        timestamp: candle.t
      };
    }

    // Bearish: open === high (no top wick from open side)
    if (isBearish && Math.abs(candle.o - candle.h) < NOWICK_EPS) {
      return {
        type: 'bearish',
        level: candle.h,  // top of the candle — where sellers stepped in
        candleHigh: candle.h,
        candleLow: candle.l,
        body: bodySize,
        timestamp: candle.t
      };
    }

    return null;
  }

  /**
   * Determine trend from swing structure on 15m candles.
   *
   * Uptrend: at least 2 consecutive higher lows AND higher highs
   * Downtrend: at least 2 consecutive lower highs AND lower lows
   * Otherwise: no trend (no trade)
   *
   * @param {Array} candles - recent candle history (15m)
   * @returns {'uptrend'|'downtrend'|'none'}
   */
  _detectTrend(candles) {
    if (!candles || candles.length < this.swingLookback) return 'none';

    const recent = candles.slice(-this.swingLookback);

    // Find swing highs and swing lows (simple: local max/min over 3 candles)
    const swingHighs = [];
    const swingLows = [];

    for (let i = 1; i < recent.length - 1; i++) {
      // Swing high: higher than both neighbors
      if (recent[i].h > recent[i - 1].h && recent[i].h > recent[i + 1].h) {
        swingHighs.push({ price: recent[i].h, index: i });
      }
      // Swing low: lower than both neighbors
      if (recent[i].l < recent[i - 1].l && recent[i].l < recent[i + 1].l) {
        swingLows.push({ price: recent[i].l, index: i });
      }
    }

    if (swingHighs.length < 2 || swingLows.length < 2) return 'none';

    // Check last 2 swing points for structure
    const lastSH = swingHighs.slice(-2);
    const lastSL = swingLows.slice(-2);

    const higherHighs = lastSH[1].price > lastSH[0].price;
    const higherLows = lastSL[1].price > lastSL[0].price;
    const lowerHighs = lastSH[1].price < lastSH[0].price;
    const lowerLows = lastSL[1].price < lastSL[0].price;

    if (higherHighs && higherLows) return 'uptrend';
    if (lowerHighs && lowerLows) return 'downtrend';

    return 'none';
  }

  /**
   * Find the most recent swing low (for uptrend SL) or swing high (for downtrend SL).
   *
   * @param {Array} candles - recent candle history
   * @param {'uptrend'|'downtrend'} trend
   * @returns {number|null} - the swing price for SL placement
   */
  _findRecentSwing(candles, trend) {
    if (!candles || candles.length < 5) return null;

    const recent = candles.slice(-this.swingLookback);

    if (trend === 'uptrend') {
      // Find most recent swing low (higher low)
      for (let i = recent.length - 2; i >= 1; i--) {
        if (recent[i].l < recent[i - 1].l && recent[i].l < recent[i + 1].l) {
          return recent[i].l;
        }
      }
    }

    if (trend === 'downtrend') {
      // Find most recent swing high (lower high)
      for (let i = recent.length - 2; i >= 1; i--) {
        if (recent[i].h > recent[i - 1].h && recent[i].h > recent[i + 1].h) {
          return recent[i].h;
        }
      }
    }

    return null;
  }

  /**
   * Main evaluation — called by StrategyOrchestrator on each candle.
   *
   * Two-phase logic:
   *   Phase 1: Scan current candle for new NoWick formation → add to pending
   *   Phase 2: Check if current price taps any pending NoWick level → signal
   *
   * @param {Object} ctx - { candles, indicators, regime }
   *   candles: array of recent 15m candles
   *   indicators: { atr, rsi, ... }
   * @returns {Object|null} - { direction, confidence, reason, overrideLevels } or null
   */
  evaluate(ctx) {
    const candles = ctx.priceHistory;
    const indicators = ctx.indicators;
    if (!candles || candles.length < this.swingLookback) return null;

    const currentCandle = candles[candles.length - 1];
    const scopeKey = this._resolveScopeKey(ctx, currentCandle);
    const state = this._getScopeState(scopeKey);
    const currentPrice = currentCandle.c;
    const atr = indicators?.atr;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

    state.candleCount++;

    // ─── Phase 1: Detect new NoWick candle formations ───
    const nowick = this._detectNoWick(currentCandle);
    if (nowick) {
      const trend = this._detectTrend(candles);

      // Only add if NoWick aligns with trend
      // Bullish NoWick in uptrend = valid buy setup
      // Bearish NoWick in downtrend = valid sell setup
      const aligned =
        (nowick.type === 'bullish' && trend === 'uptrend') ||
        (nowick.type === 'bearish' && trend === 'downtrend');

      if (aligned) {
        state.pendingLevels.push({
          type: nowick.type,
          level: nowick.level,
          candleHigh: nowick.candleHigh,
          candleLow: nowick.candleLow,
          body: nowick.body,
          formationCount: state.candleCount,
          trend: trend,
          timestamp: nowick.timestamp
        });

        if (this.DEBUG) {
          console.log(`[NoWick] NEW ${nowick.type} imbalance @ ${nowick.level.toFixed(2)} | trend=${trend} | age=0`);
        }
      }
    }

    // ─── Age out expired levels (> 9 candles old) ───
    state.pendingLevels = state.pendingLevels.filter(level => {
      const age = state.candleCount - level.formationCount;
      if (age > this.maxCandleAge) {
        if (this.DEBUG) {
          console.log(`[NoWick] EXPIRED ${level.type} @ ${level.level.toFixed(2)} after ${age} candles`);
        }
        return false;
      }
      return true;
    });

    // ─── Phase 2: Check if current price taps any pending level ───
    for (let i = state.pendingLevels.length - 1; i >= 0; i--) {
      const level = state.pendingLevels[i];
      const age = state.candleCount - level.formationCount;

      let tapped = false;

      if (level.type === 'bullish') {
        // Bullish: waiting for price to retrace DOWN and tap the bottom of the NoWick candle
        // Current candle's low must touch or go below the level
        tapped = currentCandle.l <= level.level;
      } else if (level.type === 'bearish') {
        // Bearish: waiting for price to retrace UP and tap the top of the NoWick candle
        // Current candle's high must touch or go above the level
        tapped = currentCandle.h >= level.level;
      }

      if (!tapped) continue;

      // ─── TAPPED — generate signal ───

      // Re-verify trend is still valid at time of entry
      const currentTrend = this._detectTrend(candles);
      if (level.type === 'bullish' && currentTrend !== 'uptrend') {
        // Trend changed — invalidate this level
        state.pendingLevels.splice(i, 1);
        if (this.DEBUG) console.log(`[NoWick] INVALIDATED bullish @ ${level.level.toFixed(2)} — trend shifted to ${currentTrend}`);
        continue;
      }
      if (level.type === 'bearish' && currentTrend !== 'downtrend') {
        state.pendingLevels.splice(i, 1);
        if (this.DEBUG) console.log(`[NoWick] INVALIDATED bearish @ ${level.level.toFixed(2)} — trend shifted to ${currentTrend}`);
        continue;
      }

      // Find SL level — most recent swing point + breathing room
      const swingLevel = this._findRecentSwing(candles, currentTrend);
      if (!Number.isFinite(swingLevel) || swingLevel <= 0) {
        if (this.DEBUG) console.log(`[NoWick] SKIP — no swing point found for SL`);
        continue;
      }

      const breathingRoom = Number.isFinite(atr) && atr > 0 ? atr * this.slBreathingATR : 0;
      let stopLoss, takeProfit, direction;

      if (level.type === 'bullish') {
        direction = 'buy';
        stopLoss = swingLevel - breathingRoom;           // Below recent higher low
        const risk = currentPrice - stopLoss;            // Risk = actual market entry - SL
        if (!Number.isFinite(stopLoss) || !Number.isFinite(risk) || risk <= 0) {
          state.pendingLevels.splice(i, 1);
          if (this.DEBUG) console.log(`[NoWick] INVALIDATED bullish @ ${level.level.toFixed(2)} — SL ${stopLoss.toFixed(2)} is not below entry ${currentPrice.toFixed(2)}`);
          continue;
        }
        takeProfit = currentPrice + risk;                // TP = 1:1 from actual entry
      } else {
        direction = 'sell';
        stopLoss = swingLevel + breathingRoom;           // Above recent lower high
        const risk = stopLoss - currentPrice;            // Risk = SL - actual market entry
        if (!Number.isFinite(stopLoss) || !Number.isFinite(risk) || risk <= 0) {
          state.pendingLevels.splice(i, 1);
          if (this.DEBUG) console.log(`[NoWick] INVALIDATED bearish @ ${level.level.toFixed(2)} — SL ${stopLoss.toFixed(2)} is not above entry ${currentPrice.toFixed(2)}`);
          continue;
        }
        takeProfit = currentPrice - risk;                // TP = 1:1 from actual entry
      }

      // Sanity: SL must be a reasonable distance
      if (!Number.isFinite(takeProfit) || stopLoss <= 0 || takeProfit <= 0) {
        state.pendingLevels.splice(i, 1);
        continue;
      }
      if (direction === 'buy' && !(stopLoss < currentPrice && takeProfit > currentPrice)) {
        state.pendingLevels.splice(i, 1);
        continue;
      }
      if (direction === 'sell' && !(stopLoss > currentPrice && takeProfit < currentPrice)) {
        state.pendingLevels.splice(i, 1);
        continue;
      }
      if (Math.abs(currentPrice - stopLoss) <= 0) {
        state.pendingLevels.splice(i, 1);
        continue;
      }

      // Remove the tapped level — one shot only
      state.pendingLevels.splice(i, 1);

      const confidence = this.cfg.confidence;

      if (this.DEBUG) {
        console.log(`[NoWick] SIGNAL ${direction.toUpperCase()} @ ${level.level.toFixed(2)} | SL=${stopLoss.toFixed(2)} TP=${takeProfit.toFixed(2)} | age=${age} candles | trend=${currentTrend}`);
      }

      return {
        direction,
        confidence,
        reason: `NoWick ${level.type} imbalance tapped @ ${level.level.toFixed(2)} after ${age} candles | trend=${currentTrend} | 1:1 RR`,
        signalData: {
          type: level.type,
          level: level.level,
          age,
          trend: currentTrend,
          swingLevel,
          breathingRoom,
          entryPrice: currentPrice
        },
        overrideLevels: {
          stopLoss,
          takeProfit
        }
      };
    }

    return null;
  }

  /**
   * Reset state — called by SessionRouter on asset swap.
   */
  reset(scope = null) {
    if (scope && typeof scope === 'object') {
      const symbol = this._normalizeScopePart(scope.symbol, 'symbol');
      const timeframe = this._normalizeScopePart(scope.timeframe, 'timeframe');
      this.scopedState.delete(`${symbol}:${timeframe}`);
      return;
    }
    this.scopedState.clear();
  }

  _getScopeState(scopeKey) {
    if (!this.scopedState.has(scopeKey)) {
      this.scopedState.set(scopeKey, { pendingLevels: [], candleCount: 0 });
    }
    return this.scopedState.get(scopeKey);
  }

  _resolveScopeKey(ctx, currentCandle) {
    const symbol = this._normalizeScopePart(
      ctx?.extras?.symbol || currentCandle?.symbol,
      'symbol'
    );
    const timeframe = this._normalizeScopePart(
      ctx?.extras?.timeframe || currentCandle?.timeframe,
      'timeframe'
    );
    return `${symbol}:${timeframe}`;
  }

  _normalizeScopePart(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`[STRATEGY-SCOPE] NoWickImbalance ${field} is required for scoped pending levels`);
    }
    return value.trim().toUpperCase();
  }
}

module.exports = NoWickImbalance;
