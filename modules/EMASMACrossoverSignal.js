/**
 * EMASMACrossoverSignal.js — V2-Compatible Rebuild
 * ================================================
 * Detects Golden/Death cross events across multiple MA pairs.
 * Restored confidence geometry:
 *   - ATR-normalized post-cross velocity
 *   - ATR-normalized MA-extension elasticity
 *   - distinct signal freshness decay
 *
 * V2 FIXES:
 *   • Candle format: uses .c/.o/.h/.l/.v/.t (Kraken OHLCV)
 *   • Self-contained EMA/SMA — no dependency on OptimizedIndicators
 *   • Bounded arrays (divergenceHistory, signalLog)
 *   • Clean integration API: update(candle, priceHistory) → signal
 *
 * Integration:
 *   const crossover = new EMASMACrossoverSignal();
 *   // Inside your candle loop:
 *   const signal = crossover.update(candle, this.priceHistory);
 *   // signal = { direction, confidence, crossovers, confidenceMultipliers, confluence }
 */

'use strict';

// FIX 2026-02-16: Use centralized candle helper for format compatibility
const { c } = require('../core/CandleHelper');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'decayBars',
  'decayMinMultiplier',
  'velocityWindowBars',
  'velocityAtrPeriod',
  'velocityScale',
  'velocityMaxBoost',
  'velocityMaxPenalty',
  'elasticityMinAtr',
  'elasticityMaxAtr',
  'elasticityScale',
  'elasticityMaxBoost',
  'elasticityMaxPenalty',
  'baseConfidence',
  'confluenceWeight',
  'freshCrossoverBonusPerCross',
  'freshCrossoverBonusMax',
  'maxConfidence',
];

const REQUIRED_BOOLEAN_KEYS = ['enabled'];

function finiteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`[EMASMACrossover] missing finite config key: ${label}`);
  }
  return numeric;
}

function positiveInteger(value, label) {
  const numeric = finiteNumber(value, label);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`[EMASMACrossover] ${label} must be a positive integer (got ${value})`);
  }
  return numeric;
}

function nonNegativeInteger(value, label) {
  const numeric = finiteNumber(value, label);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`[EMASMACrossover] ${label} must be a non-negative integer (got ${value})`);
  }
  return numeric;
}

function fraction(value, label, { allowOne = true } = {}) {
  const numeric = finiteNumber(value, label);
  const maxOk = allowOne ? numeric <= 1 : numeric < 1;
  if (numeric < 0 || !maxOk) {
    throw new Error(`[EMASMACrossover] ${label} must be ${allowOne ? '0..1' : '0..<1'} (got ${value})`);
  }
  return numeric;
}

function readConfig(overrides = {}) {
  const base = ConfigLoader.get('strategies.EMASMACrossover');
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error('[EMASMACrossover] config/trading.config.json strategies.EMASMACrossover is required');
  }

  const cfg = {
    ...base,
    entryEventsOnly: ConfigLoader.get('strategyBehavior.emaCrossover.entryEventsOnly'),
    confirmBars: ConfigLoader.get('strategyBehavior.emaCrossover.confirmBars'),
    warmupBars: ConfigLoader.get('strategyBehavior.emaCrossover.warmupBars'),
    ...(overrides || {}),
  };

  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[EMASMACrossover] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  const missingBoolean = REQUIRED_BOOLEAN_KEYS.filter(key => typeof cfg[key] !== 'boolean');
  if (missingBoolean.length > 0) {
    throw new Error(`[EMASMACrossover] missing boolean config key(s): ${missingBoolean.join(', ')}`);
  }
  if (typeof cfg.entryEventsOnly !== 'boolean') {
    throw new Error('[EMASMACrossover] strategyBehavior.emaCrossover.entryEventsOnly must be boolean');
  }

  const normalized = {
    enabled: cfg.enabled,
    entryEventsOnly: cfg.entryEventsOnly,
    confirmBars: nonNegativeInteger(cfg.confirmBars, 'strategyBehavior.emaCrossover.confirmBars'),
    warmupBars: positiveInteger(cfg.warmupBars, 'strategyBehavior.emaCrossover.warmupBars'),
    decayBars: positiveInteger(cfg.decayBars, 'decayBars'),
    decayMinMultiplier: fraction(cfg.decayMinMultiplier, 'decayMinMultiplier'),
    velocityWindowBars: positiveInteger(cfg.velocityWindowBars, 'velocityWindowBars'),
    velocityAtrPeriod: positiveInteger(cfg.velocityAtrPeriod, 'velocityAtrPeriod'),
    velocityScale: finiteNumber(cfg.velocityScale, 'velocityScale'),
    velocityMaxBoost: fraction(cfg.velocityMaxBoost, 'velocityMaxBoost'),
    velocityMaxPenalty: fraction(cfg.velocityMaxPenalty, 'velocityMaxPenalty'),
    elasticityMinAtr: finiteNumber(cfg.elasticityMinAtr, 'elasticityMinAtr'),
    elasticityMaxAtr: finiteNumber(cfg.elasticityMaxAtr, 'elasticityMaxAtr'),
    elasticityScale: finiteNumber(cfg.elasticityScale, 'elasticityScale'),
    elasticityMaxBoost: fraction(cfg.elasticityMaxBoost, 'elasticityMaxBoost'),
    elasticityMaxPenalty: fraction(cfg.elasticityMaxPenalty, 'elasticityMaxPenalty'),
    baseConfidence: fraction(cfg.baseConfidence, 'baseConfidence'),
    confluenceWeight: fraction(cfg.confluenceWeight, 'confluenceWeight'),
    freshCrossoverBonusPerCross: fraction(cfg.freshCrossoverBonusPerCross, 'freshCrossoverBonusPerCross'),
    freshCrossoverBonusMax: fraction(cfg.freshCrossoverBonusMax, 'freshCrossoverBonusMax'),
    maxConfidence: fraction(cfg.maxConfidence, 'maxConfidence'),
  };

  if (normalized.elasticityMaxAtr <= normalized.elasticityMinAtr) {
    throw new Error('[EMASMACrossover] elasticity ATR band must satisfy min < max');
  }
  if (normalized.maxConfidence < normalized.baseConfidence) {
    throw new Error('[EMASMACrossover] maxConfidence must be >= baseConfidence');
  }

  return Object.freeze(normalized);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

class EMASMACrossoverSignal {
  constructor(config = {}) {
    // MA pair definitions — period pairs + type
    this.pairs = [
      { id: 'ema9_20',   fast: 9,   slow: 20,  type: 'ema', weight: 1.0 },
      { id: 'ema20_50',  fast: 20,  slow: 50,  type: 'ema', weight: 1.2 },
      { id: 'ema50_200', fast: 50,  slow: 200, type: 'ema', weight: 1.5 },
      { id: 'sma20_50',  fast: 20,  slow: 50,  type: 'sma', weight: 1.0 },
      { id: 'sma50_200', fast: 50,  slow: 200, type: 'sma', weight: 1.4 },
    ];

    this.cfg = readConfig(config);
    this.decayBars = this.cfg.decayBars;
    this.entryEventsOnly = this.cfg.entryEventsOnly;
    this.confirmBars = this.cfg.confirmBars;
    const slowestPair = this.pairs.reduce((max, pair) => Math.max(max, pair.slow), 0);
    this.warmupBars = this.cfg.warmupBars;
    this.warmupBars = Math.max(this.warmupBars, this.entryEventsOnly ? slowestPair : 1);

    // --- internal state ---
    this.crossoverState = {};      // { pairId: { side, barsAgo } }
    this.prevSpreads = {};         // { pairId: number } — last tick's spread
    this.divergenceHistory = {};   // { pairId: [{ spread, velocity }] }  BOUNDED
    this.signalLog = [];           // recent signals — BOUNDED at 50
    this.barIndex = 0;
    this.diagCounters = {
      updates: 0,
      crossesDetected: 0,
      eventsFresh: 0,
      filtersComputed: 0,
      velocityFired: 0,
      elasticityFired: 0,
      decayFired: 0,
      votesEmitted: 0,
    };

    // Pre-init state per pair
    for (const p of this.pairs) {
      this.crossoverState[p.id] = { side: 'none', barsAgo: 999, crossPrice: null, crossBarIndex: null };
      this.prevSpreads[p.id] = null;
      this.divergenceHistory[p.id] = [];
    }

    this.configReceipt = Object.freeze({
      module: 'EMASMACrossover',
      entryEventsOnly: this.entryEventsOnly,
      confirmBars: this.confirmBars,
      warmupBars: this.warmupBars,
      baseConfidence: this.cfg.baseConfidence,
      confluenceWeight: this.cfg.confluenceWeight,
      velocityWindowBars: this.cfg.velocityWindowBars,
      velocityScale: this.cfg.velocityScale,
      elasticityBandAtr: [this.cfg.elasticityMinAtr, this.cfg.elasticityMaxAtr],
      decayBars: this.cfg.decayBars,
      decayMinMultiplier: this.cfg.decayMinMultiplier,
    });
    console.log(`[EMASMACrossover][CONFIG] ${JSON.stringify(this.configReceipt)}`);
  }

  // ─── CORE API ───────────────────────────────────────────────
  /**
   * Feed a new 1-minute candle + full price history.
   * Returns a unified signal object.
   *
   * @param {Object} candle  — { c, o, h, l, v, t } (V2 Kraken format)
   * @param {Array}  priceHistory — array of candles, newest LAST
   * @returns {Object} signal
   */
  update(candle, priceHistory) {
    this.diagCounters.updates++;
    if (!priceHistory || priceHistory.length < this.warmupBars) {
      return this._emptySignal();
    }

    const closes = priceHistory.map(candle => c(candle));
    const price = c(candle);

    // Calculate all MAs we need
    const maValues = this._calculateAllMAs(closes);

    // Process each pair
    const crossovers = [];
    let bullishCount = 0;
    let bearishCount = 0;
    let totalWeight = 0;
    let snapbackSignal = null;
    let blowoffWarning = false;
    const activeVotes = [];
    const funnel = {
      crossesDetected: 0,
      eventsFresh: 0,
      filtersComputed: 0,
      velocityFired: 0,
      elasticityFired: 0,
      decayFired: 0,
      votesEmitted: 0,
    };
    const atr = this._atr(priceHistory, this.cfg.velocityAtrPeriod);

    // ═══════════════════════════════════════════════════════════════════
    // Crossover event detection plus confidence geometry.
    // Standing alignment remains available only when entryEventsOnly=false.
    // ═══════════════════════════════════════════════════════════════════

    for (const pair of this.pairs) {
      const fastVal = maValues[`${pair.type}${pair.fast}`];
      const slowVal = maValues[`${pair.type}${pair.slow}`];

      if (fastVal == null || slowVal == null) continue;

      const spread = ((fastVal - slowVal) / slowVal) * 100;  // as %
      const state = this.crossoverState[pair.id];

      // --- Crossover detection (CORE) ---
      const prevSide = state.side;
      const currentSide = fastVal > slowVal ? 'golden' : fastVal < slowVal ? 'death' : 'flat';

      // Track fresh crossovers
      if (prevSide !== 'none' && prevSide !== currentSide && currentSide !== 'flat') {
        state.side = currentSide;
        state.barsAgo = 0;
        state.crossPrice = price;
        state.crossBarIndex = this.barIndex;
        crossovers.push({
          pair: pair.id,
          type: currentSide,
          weight: pair.weight,
          spread: spread
        });
        funnel.crossesDetected++;
      } else {
        state.side = currentSide;
        state.barsAgo++;
      }

      if (this.entryEventsOnly) {
        if (state.barsAgo <= this.confirmBars) {
          if (state.side === 'golden') {
            bullishCount += pair.weight;
            activeVotes.push({ pair, side: 'golden', state, fastVal, slowVal, spread });
          } else if (state.side === 'death') {
            bearishCount += pair.weight;
            activeVotes.push({ pair, side: 'death', state, fastVal, slowVal, spread });
          }
          funnel.eventsFresh++;
        }
      } else {
        // Count current MA alignment (no decay - just current state)
        if (currentSide === 'golden') {
          bullishCount += pair.weight;
          activeVotes.push({ pair, side: 'golden', state, fastVal, slowVal, spread });
        } else if (currentSide === 'death') {
          bearishCount += pair.weight;
          activeVotes.push({ pair, side: 'death', state, fastVal, slowVal, spread });
        }
      }
      totalWeight += pair.weight;

      const prevSpread = this.prevSpreads[pair.id];
      if (prevSpread != null) {
        const velocity = spread - prevSpread;
        const hist = this.divergenceHistory[pair.id];
        hist.push({ spread, velocity });
        if (hist.length > this.cfg.velocityWindowBars) hist.shift();
      }
      this.prevSpreads[pair.id] = spread;
    }
    this.barIndex += 1;
    this.diagCounters.crossesDetected += funnel.crossesDetected;
    this.diagCounters.eventsFresh += funnel.eventsFresh;

    // ═══════════════════════════════════════════════════════════════════
    // Direction and base confidence are config-owned. Restored filters are
    // confidence multipliers, never binary gates.
    // ═══════════════════════════════════════════════════════════════════
    const confluenceRatio = totalWeight > 0
      ? Math.max(bullishCount, bearishCount) / totalWeight
      : 0;

    let direction = 'neutral';
    let confidence = 0;

    // Direction: whichever side has more weight
    if (bullishCount > bearishCount) {
      direction = 'buy';
      confidence = this.cfg.baseConfidence + (confluenceRatio * this.cfg.confluenceWeight);
      // Bonus for fresh crossovers
      const freshGolden = crossovers.filter(c => c.type === 'golden').length;
      if (freshGolden > 0) {
        confidence += Math.min(this.cfg.freshCrossoverBonusMax, freshGolden * this.cfg.freshCrossoverBonusPerCross);
      }
    } else if (bearishCount > bullishCount) {
      direction = 'sell';
      confidence = this.cfg.baseConfidence + (confluenceRatio * this.cfg.confluenceWeight);
      const freshDeath = crossovers.filter(c => c.type === 'death').length;
      if (freshDeath > 0) {
        confidence += Math.min(this.cfg.freshCrossoverBonusMax, freshDeath * this.cfg.freshCrossoverBonusPerCross);
      }
    }

    const confidenceMultipliers = this._confidenceMultipliers({
      direction,
      activeVotes,
      price,
      atr,
      funnel,
    });
    if (direction !== 'neutral') {
      confidence = Math.min(
        this.cfg.maxConfidence,
        Math.max(0, confidence * confidenceMultipliers.composite)
      );
      funnel.votesEmitted++;
      this.diagCounters.votesEmitted++;
    }
    snapbackSignal = confidenceMultipliers.elasticity.snapback;
    blowoffWarning = confidenceMultipliers.elasticity.blowoff;

    // FIX 2026-02-25: Add SL/TP fields for consistency with other strategies
    // Default: 0.5% stop, 0.8% target (uses ECM defaults if not overridden)
    const signal = {
      module: 'EMASMACrossover',
      direction,
      confidence,
      stopLoss: null,        // Let ExitContractManager use strategy defaults
      takeProfit: null,      // Let ExitContractManager use strategy defaults
      crossovers,            // new crosses this tick
      activeBullish: bullishCount,
      activeBearish: bearishCount,
      confluence: confluenceRatio,
      snapback: snapbackSignal,
      blowoff: blowoffWarning,
      confidenceMultipliers,
      diagnostics: funnel,
      maValues,              // expose raw MA values for dashboard
      entryEventsOnly: this.entryEventsOnly,
      confirmBars: this.confirmBars,
      warmupBars: this.warmupBars
    };

    // Log (bounded)
    this.signalLog.push({ t: candle.t, ...signal });
    if (this.signalLog.length > 50) this.signalLog.shift();

    return signal;
  }

  // ─── MA CALCULATIONS (self-contained) ───────────────────────

  _calculateAllMAs(closes) {
    const result = {};
    const periods = new Set();
    for (const p of this.pairs) {
      periods.add(`${p.type}${p.fast}`);
      periods.add(`${p.type}${p.slow}`);
    }

    for (const key of periods) {
      const type = key.startsWith('ema') ? 'ema' : 'sma';
      const period = parseInt(key.replace(/^(ema|sma)/, ''));

      if (closes.length < period) {
        result[key] = null;
        continue;
      }

      if (type === 'ema') {
        result[key] = this._ema(closes, period);
      } else {
        result[key] = this._sma(closes, period);
      }
    }
    return result;
  }

  _ema(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    // Seed with SMA of first `period` values
    let ema = 0;
    for (let i = 0; i < period; i++) ema += closes[i];
    ema /= period;
    // Walk forward
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _sma(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _atr(candles, period) {
    if (!Array.isArray(candles) || candles.length < period + 1) return null;
    const window = candles.slice(-(period + 1));
    const ranges = [];
    for (let index = 1; index < window.length; index += 1) {
      const current = window[index];
      const previous = window[index - 1];
      const high = Number(current.h);
      const low = Number(current.l);
      const previousClose = c(previous);
      if (![high, low, previousClose].every(Number.isFinite)) return null;
      ranges.push(Math.max(
        high - low,
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
      ));
    }
    return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  }

  _confidenceMultipliers({ direction, activeVotes, price, atr, funnel }) {
    const neutral = {
      composite: 1,
      velocity: { multiplier: 1, fired: false, normalizedDisplacement: null },
      elasticity: { multiplier: 1, fired: false, extensionAtr: null, snapback: null, blowoff: false },
      decay: { multiplier: 1, fired: false, ageBars: null },
    };
    if (!this.entryEventsOnly || direction === 'neutral' || !Number.isFinite(atr) || atr <= 0) {
      return neutral;
    }

    const directionSide = direction === 'buy' ? 'golden' : 'death';
    const votes = activeVotes.filter(vote => vote.side === directionSide);
    if (votes.length === 0) return neutral;

    funnel.filtersComputed++;
    this.diagCounters.filtersComputed++;

    const velocity = this._velocityMultiplier(votes, direction, price, atr);
    const elasticity = this._elasticityMultiplier(votes, direction, price, atr);
    const decay = this._decayMultiplier(votes);
    if (velocity.fired) {
      funnel.velocityFired++;
      this.diagCounters.velocityFired++;
    }
    if (elasticity.fired) {
      funnel.elasticityFired++;
      this.diagCounters.elasticityFired++;
    }
    if (decay.fired) {
      funnel.decayFired++;
      this.diagCounters.decayFired++;
    }

    return {
      composite: velocity.multiplier * elasticity.multiplier * decay.multiplier,
      velocity,
      elasticity,
      decay,
    };
  }

  _velocityMultiplier(votes, direction, price, atr) {
    const sign = direction === 'buy' ? 1 : -1;
    const samples = votes
      .filter(vote => Number.isFinite(vote.state.crossPrice) && vote.state.barsAgo <= this.cfg.velocityWindowBars)
      .map(vote => (sign * (price - vote.state.crossPrice)) / atr);
    if (samples.length === 0) {
      return { multiplier: 1, fired: false, normalizedDisplacement: null };
    }
    const normalizedDisplacement = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const delta = normalizedDisplacement >= 0
      ? Math.min(this.cfg.velocityMaxBoost, normalizedDisplacement * this.cfg.velocityScale)
      : -Math.min(this.cfg.velocityMaxPenalty, Math.abs(normalizedDisplacement) * this.cfg.velocityScale);
    const multiplier = 1 + delta;
    return {
      multiplier,
      fired: Math.abs(multiplier - 1) > 0.000001,
      normalizedDisplacement,
    };
  }

  _elasticityMultiplier(votes, direction, price, atr) {
    const sign = direction === 'buy' ? 1 : -1;
    const samples = votes
      .map(vote => (sign * (price - vote.slowVal)) / atr)
      .filter(Number.isFinite);
    if (samples.length === 0) {
      return { multiplier: 1, fired: false, extensionAtr: null, snapback: null, blowoff: false };
    }
    const extensionAtr = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    let multiplier;
    let blowoff = false;
    if (extensionAtr < this.cfg.elasticityMinAtr) {
      multiplier = 1 - Math.min(
        this.cfg.elasticityMaxPenalty,
        (this.cfg.elasticityMinAtr - extensionAtr) * this.cfg.elasticityScale
      );
    } else if (extensionAtr <= this.cfg.elasticityMaxAtr) {
      const band = this.cfg.elasticityMaxAtr - this.cfg.elasticityMinAtr;
      const progress = band > 0 ? (extensionAtr - this.cfg.elasticityMinAtr) / band : 0;
      multiplier = 1 + Math.min(this.cfg.elasticityMaxBoost, progress * this.cfg.elasticityMaxBoost);
    } else {
      blowoff = true;
      multiplier = 1 - Math.min(
        this.cfg.elasticityMaxPenalty,
        (extensionAtr - this.cfg.elasticityMaxAtr) * this.cfg.elasticityScale
      );
    }
    const snapback = extensionAtr > this.cfg.elasticityMaxAtr
      ? { direction: direction === 'buy' ? 'bearish_snapback' : 'bullish_snapback', extensionAtr }
      : null;
    return {
      multiplier: clamp(multiplier, 0, 1 + this.cfg.elasticityMaxBoost),
      fired: Math.abs(multiplier - 1) > 0.000001,
      extensionAtr,
      snapback,
      blowoff,
    };
  }

  _decayMultiplier(votes) {
    const ages = votes
      .map(vote => vote.state.barsAgo)
      .filter(Number.isFinite);
    if (ages.length === 0) {
      return { multiplier: 1, fired: false, ageBars: null };
    }
    const ageBars = Math.min(...ages);
    const progress = Math.min(1, ageBars / this.cfg.decayBars);
    const multiplier = Math.max(
      this.cfg.decayMinMultiplier,
      1 - progress * (1 - this.cfg.decayMinMultiplier)
    );
    return {
      multiplier,
      fired: Math.abs(multiplier - 1) > 0.000001,
      ageBars,
    };
  }

  // ─── HELPERS ────────────────────────────────────────────────

  _emptySignal() {
    return {
      module: 'EMASMACrossover',
      direction: 'neutral',
      confidence: 0,
      stopLoss: null,      // FIX 2026-02-25: Add for consistency
      takeProfit: null,    // FIX 2026-02-25: Add for consistency
      crossovers: [],
      activeBullish: 0,
      activeBearish: 0,
      confluence: 0,
      snapback: null,
      blowoff: false,
      confidenceMultipliers: {
        composite: 1,
        velocity: { multiplier: 1, fired: false, normalizedDisplacement: null },
        elasticity: { multiplier: 1, fired: false, extensionAtr: null, snapback: null, blowoff: false },
        decay: { multiplier: 1, fired: false, ageBars: null },
      },
      diagnostics: {
        crossesDetected: 0,
        eventsFresh: 0,
        filtersComputed: 0,
        velocityFired: 0,
        elasticityFired: 0,
        decayFired: 0,
        votesEmitted: 0,
      },
      maValues: {},
      entryEventsOnly: this.entryEventsOnly,
      confirmBars: this.confirmBars,
      warmupBars: this.warmupBars
    };
  }

  /** Dashboard snapshot */
  getSnapshot() {
    return {
      crossoverState: { ...this.crossoverState },
      lastSignal: this.signalLog[this.signalLog.length - 1] || null,
      recentSignals: this.signalLog.slice(-5),
      config: this.configReceipt,
      diagnostics: { ...this.diagCounters }
    };
  }

  /** Cleanup for shutdown */
  destroy() {
    this.signalLog = [];
    this.divergenceHistory = {};
    this.crossoverState = {};
    this.prevSpreads = {};
    this.diagCounters = {};
  }
}

module.exports = EMASMACrossoverSignal;
