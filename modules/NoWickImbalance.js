/**
 * NoWickImbalance.js — 100% Mechanical Wickless Candle Strategy
 *
 * Edge: Wickless candles represent price imbalances where institutional
 * order flow moved so aggressively that no pullback occurred within the
 * candle. The market seeks to fill these imbalances — price retraces to
 * the NoWick level with high probability.
 *
 * Rules (zero discretion):
 *   - Bullish NoWick: green candle with no entry-side bottom wick
 *   - Bearish NoWick: red candle with no entry-side top wick
 *   - Only trade WITH the trend (15m structure: HH/HL = buy, LH/LL = sell)
 *   - Entry: tap or rejection mode, owned by required config
 *   - Validity: maxCandleAge candles after formation
 *   - SL: structural stop beyond recent extreme plus ATR buffer
 *   - TP: configured RR from structural stop distance
 *   - News/session/FVG filters: deferred to shared context services
 *   - Color rule: green = buy only, red = sell only
 *
 * Source: xGhozt Wickless Candles concept + Trey's imbalance thesis
 * Designed for OGZPrime StrategyOrchestrator registration
 *
 * @module modules/NoWickImbalance
 */

const ConfigLoader = require('../foundation/ConfigLoader');

const ENTRY_MODES = new Set(['tap', 'rejection']);

const REQUIRED_NUMERIC_KEYS = [
  'maxCandleAge',
  'swingLookback',
  'minBodyPercent',
  'entrySideWickMaxPct',
  'swingExtremeLookback',
  'almostTouchPct',
  'stopLookbackBars',
  'stopBufferAtr',
  'targetRR',
  'twinProximityBars',
  'confidence',
];

const REQUIRED_INTEGER_KEYS = [
  'maxCandleAge',
  'swingLookback',
  'swingExtremeLookback',
  'stopLookbackBars',
  'twinProximityBars',
];

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.NoWickImbalance');
  const cfg = { ...(base || {}), ...(overrides || {}) };
  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[NoWickImbalance] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  for (const key of REQUIRED_INTEGER_KEYS) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[NoWickImbalance] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (!ENTRY_MODES.has(cfg.entryMode)) {
    throw new Error(`[NoWickImbalance] entryMode must be tap or rejection (got ${cfg.entryMode})`);
  }
  if (typeof cfg.twinSplitEnabled !== 'boolean') {
    throw new Error(`[NoWickImbalance] twinSplitEnabled must be boolean (got ${cfg.twinSplitEnabled})`);
  }
  for (const key of ['entrySideWickMaxPct', 'almostTouchPct']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 100) {
      throw new Error(`[NoWickImbalance] ${key} must be 0..100 (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.stopBufferAtr) < 0) {
    throw new Error(`[NoWickImbalance] stopBufferAtr must be non-negative (got ${cfg.stopBufferAtr})`);
  }
  if (Number(cfg.targetRR) <= 0) {
    throw new Error(`[NoWickImbalance] targetRR must be positive (got ${cfg.targetRR})`);
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
    swingLookback: Number(cfg.swingLookback),
    minBodyPercent: Number(cfg.minBodyPercent),
    entrySideWickMaxPct: Number(cfg.entrySideWickMaxPct),
    swingExtremeLookback: Number(cfg.swingExtremeLookback),
    almostTouchPct: Number(cfg.almostTouchPct),
    stopLookbackBars: Number(cfg.stopLookbackBars),
    stopBufferAtr: Number(cfg.stopBufferAtr),
    targetRR: Number(cfg.targetRR),
    twinProximityBars: Number(cfg.twinProximityBars),
    confidence: Number(cfg.confidence),
    entryMode: cfg.entryMode,
    twinSplitEnabled: cfg.twinSplitEnabled,
    debug: cfg.debug === true,
  };
}

class NoWickImbalance {
  constructor(config = {}) {
    this.name = 'NoWickImbalance';
    this.cfg = Object.freeze(readConfig(config));
    this.maxCandleAge = this.cfg.maxCandleAge;       // Valid for configured candle count; next candle invalidates
    this.swingLookback = this.cfg.swingLookback;     // Candles to look back for swing points
    this.minBodyPercent = this.cfg.minBodyPercent;   // Min body size as % of total range (filter dojis)
    this.entrySideWickMaxPct = this.cfg.entrySideWickMaxPct;
    this.swingExtremeLookback = this.cfg.swingExtremeLookback;
    this.almostTouchPct = this.cfg.almostTouchPct;
    this.stopLookbackBars = this.cfg.stopLookbackBars;
    this.stopBufferAtr = this.cfg.stopBufferAtr;
    this.targetRR = this.cfg.targetRR;
    this.entryMode = this.cfg.entryMode;
    this.twinSplitEnabled = this.cfg.twinSplitEnabled;
    this.twinProximityBars = this.cfg.twinProximityBars;

    // Active NoWick levels waiting for retrace tap, isolated by symbol+timeframe.
    // Each scope entry: { pendingLevels, invalidatedLevels, candleCount }.
    this.scopedState = new Map();

    this.DEBUG = this.cfg.debug;
  }

  /**
   * Detect if a candle is a NoWick imbalance candle.
   *
   * Bullish NoWick: green candle, entry-side bottom wick within config
   *   → buyers dominated from open, never let price drop
   *   → the LOW (= open) becomes a support level the market wants to retest
   *
   * Bearish NoWick: red candle, entry-side top wick within config
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

    const bottomWickPct = Math.max(0, candle.o - candle.l) / totalRange * 100;
    const topWickPct = Math.max(0, candle.h - candle.o) / totalRange * 100;

    // Bullish: no bottom wick from open side
    if (isBullish && bottomWickPct <= this.entrySideWickMaxPct) {
      return {
        type: 'bullish',
        level: candle.l,  // bottom of the candle — where buyers stepped in
        candleHigh: candle.h,
        candleLow: candle.l,
        entrySideWickPct: bottomWickPct,
        body: bodySize,
        timestamp: candle.t
      };
    }

    // Bearish: no top wick from open side
    if (isBearish && topWickPct <= this.entrySideWickMaxPct) {
      return {
        type: 'bearish',
        level: candle.h,  // top of the candle — where sellers stepped in
        candleHigh: candle.h,
        candleLow: candle.l,
        entrySideWickPct: topWickPct,
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
    this._expireState(state);

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

      if (aligned && !this._isSwingExtremeFormation(nowick, candles)) {
        const pendingLevel = {
          type: nowick.type,
          level: nowick.level,
          candleHigh: nowick.candleHigh,
          candleLow: nowick.candleLow,
          entrySideWickPct: nowick.entrySideWickPct,
          body: nowick.body,
          formationCount: state.candleCount,
          trend: trend,
          timestamp: nowick.timestamp
        };
        this._attachTwinGroup(state, pendingLevel);
        state.pendingLevels.push(pendingLevel);

        if (this.DEBUG) {
          console.log(`[NoWick] NEW ${nowick.type} imbalance @ ${nowick.level.toFixed(2)} | trend=${trend} | age=0`);
        }
      }
    }

    // ─── Phase 2: Check if current price taps any pending level ───
    for (let i = state.pendingLevels.length - 1; i >= 0; i--) {
      const level = state.pendingLevels[i];
      const age = state.candleCount - level.formationCount;
      if (age <= 0) continue;

      const touch = this._getTouchState(level, currentCandle);
      if (!touch.touched) {
        if (this._isAlmostTouch(level, currentCandle)) {
          this._invalidatePendingLevel(state, i, 'almost_touch_reversal', currentCandle);
        }
        continue;
      }
      if (this.entryMode === 'rejection' && !touch.rejected) {
        this._invalidatePendingLevel(state, i, 'touch_without_rejection', currentCandle);
        continue;
      }

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

      const exit = this._computeStructuralExit(level.type, currentPrice, candles, atr);
      if (!exit) {
        state.pendingLevels.splice(i, 1);
        if (this.DEBUG) console.log(`[NoWick] INVALIDATED ${level.type} @ ${level.level.toFixed(2)} — structural exit geometry invalid`);
        continue;
      }
      const { direction, stopLoss, takeProfit, structuralLevel, stopBuffer, risk } = exit;

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

      const twinSiblings = this._findTouchedTwinSiblings(state, i, currentCandle);
      const twinSplit = this.twinSplitEnabled && twinSiblings.length > 0;
      const entryLegLevels = twinSplit
        ? [{ index: i, level }, ...twinSiblings]
        : [{ index: i, level }];
      const entryFanout = entryLegLevels.map((leg, fanoutIndex) => {
        const legExit = this._computeStructuralExit(leg.level.type, currentPrice, candles, atr);
        return {
          fanoutIndex,
          fanoutCount: entryLegLevels.length,
          entryGroupType: twinSplit ? 'twin' : 'single',
          entryGroupId: leg.level.twinGroupId || null,
          direction: legExit?.direction || direction,
          confidence: this.cfg.confidence,
          sizingMultiplier: twinSplit ? 0.5 : 1,
          reason: `NoWick ${leg.level.type} imbalance ${this.entryMode} @ ${leg.level.level.toFixed(2)} after ${state.candleCount - leg.level.formationCount} candles | trend=${currentTrend} | ${this.targetRR}:1 RR`,
          signalData: {
            type: leg.level.type,
            level: leg.level.level,
            age: state.candleCount - leg.level.formationCount,
            trend: currentTrend,
            entryMode: this.entryMode,
            structuralLevel: legExit?.structuralLevel ?? null,
            stopBuffer: legExit?.stopBuffer ?? null,
            risk: legExit?.risk ?? null,
            entryPrice: currentPrice,
            twinSplit: {
              active: twinSplit,
              fanoutIndex,
              fanoutCount: entryLegLevels.length,
            },
          },
          overrideLevels: legExit
            ? {
              stopLoss: legExit.stopLoss,
              takeProfit: legExit.takeProfit,
            }
            : null,
        };
      }).filter(leg => (
        leg.overrideLevels &&
        Number.isFinite(leg.overrideLevels.stopLoss) &&
        Number.isFinite(leg.overrideLevels.takeProfit)
      ));
      if (entryFanout.length !== entryLegLevels.length) {
        state.pendingLevels.splice(i, 1);
        continue;
      }
      const removeIndexes = new Set([i]);
      if (twinSplit) twinSiblings.forEach(sibling => removeIndexes.add(sibling.index));
      [...removeIndexes].sort((a, b) => b - a).forEach(index => state.pendingLevels.splice(index, 1));

      const confidence = this.cfg.confidence;
      const primaryLeg = entryFanout[0];

      if (this.DEBUG) {
        console.log(`[NoWick] SIGNAL ${direction.toUpperCase()} @ ${level.level.toFixed(2)} | SL=${stopLoss.toFixed(2)} TP=${takeProfit.toFixed(2)} | age=${age} candles | trend=${currentTrend}`);
      }

      return {
        direction,
        confidence,
        entryFanout: twinSplit ? entryFanout : [],
        entryGroupType: primaryLeg.entryGroupType,
        entryGroupId: primaryLeg.entryGroupId,
        entryTriggerClass: 'nowick_retrace',
        reason: `NoWick ${level.type} imbalance ${this.entryMode} @ ${level.level.toFixed(2)} after ${age} candles | trend=${currentTrend} | ${this.targetRR}:1 RR`,
        signalData: {
          type: level.type,
          level: level.level,
          age,
          trend: currentTrend,
          entryMode: this.entryMode,
          structuralLevel,
          stopBuffer,
          risk,
          entryPrice: currentPrice,
          twinSplit: twinSplit
            ? {
              active: true,
              fanoutCount: entryFanout.length,
              pairedLevels: twinSiblings.map(sibling => ({
                level: sibling.level.level,
                type: sibling.level.type,
                age: state.candleCount - sibling.level.formationCount,
              })),
            }
            : { active: false },
        },
        overrideLevels: {
          stopLoss,
          takeProfit
        }
      };
    }

    return null;
  }

  _expireState(state) {
    if (!Array.isArray(state.pendingLevels)) state.pendingLevels = [];
    if (!Array.isArray(state.invalidatedLevels)) state.invalidatedLevels = [];
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
    state.invalidatedLevels = state.invalidatedLevels.filter(level => (
      state.candleCount - level.formationCount <= this.maxCandleAge
    ));
  }

  _isSwingExtremeFormation(nowick, candles) {
    const recent = candles.slice(-this.swingExtremeLookback);
    if (recent.length === 0) return false;
    if (nowick.type === 'bullish') {
      const lowestLow = Math.min(...recent.map(candle => candle.l));
      return nowick.candleLow <= lowestLow;
    }
    const highestHigh = Math.max(...recent.map(candle => candle.h));
    return nowick.candleHigh >= highestHigh;
  }

  _getTouchState(level, candle) {
    if (level.type === 'bullish') {
      return {
        touched: candle.l <= level.level,
        rejected: candle.c > level.level,
      };
    }
    return {
      touched: candle.h >= level.level,
      rejected: candle.c < level.level,
    };
  }

  _isAlmostTouch(level, candle) {
    if (this.almostTouchPct <= 0) return false;
    const band = this.almostTouchPct / 100;
    if (level.type === 'bullish') {
      const nearLevel = level.level * (1 + band);
      return candle.l > level.level && candle.l <= nearLevel;
    }
    const nearLevel = level.level * (1 - band);
    return candle.h < level.level && candle.h >= nearLevel;
  }

  _invalidatePendingLevel(state, index, reason, candle) {
    const [level] = state.pendingLevels.splice(index, 1);
    state.invalidatedLevels.push({
      type: level.type,
      level: level.level,
      formationCount: level.formationCount,
      invalidatedAtCount: state.candleCount,
      reason,
      timestamp: candle?.t,
    });
    if (this.DEBUG) {
      console.log(`[NoWick] INVALIDATED ${level.type} @ ${level.level.toFixed(2)} — ${reason}`);
    }
  }

  _computeStructuralExit(type, currentPrice, candles, atr) {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    if (!Array.isArray(candles) || candles.length < this.stopLookbackBars) return null;

    const recent = candles.slice(-this.stopLookbackBars);
    const stopBuffer = Number.isFinite(atr) && atr > 0 ? atr * this.stopBufferAtr : 0;
    if (type === 'bullish') {
      const structuralLevel = Math.min(...recent.map(candle => candle.l));
      const stopLoss = structuralLevel - stopBuffer;
      const risk = currentPrice - stopLoss;
      if (!Number.isFinite(stopLoss) || !Number.isFinite(risk) || risk <= 0) return null;
      return {
        direction: 'buy',
        stopLoss,
        takeProfit: currentPrice + risk * this.targetRR,
        structuralLevel,
        stopBuffer,
        risk,
      };
    }

    const structuralLevel = Math.max(...recent.map(candle => candle.h));
    const stopLoss = structuralLevel + stopBuffer;
    const risk = stopLoss - currentPrice;
    if (!Number.isFinite(stopLoss) || !Number.isFinite(risk) || risk <= 0) return null;
    return {
      direction: 'sell',
      stopLoss,
      takeProfit: currentPrice - risk * this.targetRR,
      structuralLevel,
      stopBuffer,
      risk,
    };
  }

  _attachTwinGroup(state, pendingLevel) {
    if (!this.twinSplitEnabled) return;
    const sibling = state.pendingLevels.find(level => (
      level.type === pendingLevel.type &&
      Math.abs(pendingLevel.formationCount - level.formationCount) <= this.twinProximityBars
    ));
    if (!sibling) return;
    const groupId = sibling.twinGroupId || `${pendingLevel.type}:${sibling.formationCount}:${pendingLevel.formationCount}`;
    sibling.twinGroupId = groupId;
    pendingLevel.twinGroupId = groupId;
  }

  _findTouchedTwinSiblings(state, activeIndex, candle) {
    const active = state.pendingLevels[activeIndex];
    if (!active?.twinGroupId) return [];
    const siblings = [];
    for (let index = 0; index < state.pendingLevels.length; index += 1) {
      if (index === activeIndex) continue;
      const level = state.pendingLevels[index];
      if (level.twinGroupId !== active.twinGroupId) continue;
      const touch = this._getTouchState(level, candle);
      if (!touch.touched) continue;
      if (this.entryMode === 'rejection' && !touch.rejected) continue;
      siblings.push({ index, level });
    }
    return siblings;
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
      this.scopedState.set(scopeKey, { pendingLevels: [], invalidatedLevels: [], candleCount: 0 });
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
