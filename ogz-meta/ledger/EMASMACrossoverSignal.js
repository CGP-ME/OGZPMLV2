/**
 * ============================================================================
 * EMASMACrossoverSignal.js - EMA/SMA Crossover Entry Signal Generator
 * ============================================================================
 *
 * PURPOSE: Detect EMA and SMA crossover events and generate entry signals
 * with confidence scores that plug into the TradingBrain decision pipeline.
 *
 * WHAT IT DOES:
 * - Detects Golden Cross (fast MA crosses ABOVE slow MA) → BUY signal
 * - Detects Death Cross (fast MA crosses BELOW slow MA) → SELL signal
 * - Tracks crossover AGE (bars since cross) for signal decay
 * - Scores confluence across multiple MA pairs for stronger signals
 * - Filters false crosses using minimum separation threshold
 * - Tracks MA DIVERGENCE VELOCITY (how fast MAs spread apart)
 * - Detects SNAPBACK zones (rubber band effect — overextended = reversion incoming)
 * - Measures divergence acceleration to catch exponential blowoffs
 *
 * MA PAIRS MONITORED:
 * - EMA 9/20   (scalp/swing)
 * - EMA 20/50  (swing/position)
 * - EMA 50/200 (major trend)
 * - SMA 20/50  (classic swing)
 * - SMA 50/200 (institutional golden/death cross)
 *
 * PLUGS INTO:
 * - TradingBrain.calculateRealConfidence() as a confidence voter
 * - TradingBrain.determineTradingDirection() as a directional signal
 * - IndicatorEngine.getSnapshot() for MA values
 *
 * @author OGZPrime Development Team
 * @version 1.0.0
 * ============================================================================
 */

class EMASMACrossoverSignal {
  constructor(config = {}) {
    // === CONFIGURATION ===
    this.config = {
      // Minimum % separation between MAs to count as a valid cross (filters noise)
      minSeparationPct: config.minSeparationPct || 0.05,

      // How many bars a crossover signal stays "active" before decaying
      signalDecayBars: config.signalDecayBars || 10,

      // Confidence weights for each MA pair (higher = more important)
      weights: {
        ema9_20:   config.weights?.ema9_20   || 0.15,  // Fast scalp signal
        ema20_50:  config.weights?.ema20_50  || 0.20,  // Swing signal
        ema50_200: config.weights?.ema50_200 || 0.25,  // Major trend signal
        sma20_50:  config.weights?.sma20_50  || 0.15,  // Classic swing
        sma50_200: config.weights?.sma50_200 || 0.25,  // Institutional signal
      },

      // Require this many MA pairs to agree for a "confluence" bonus
      confluenceMinPairs: config.confluenceMinPairs || 2,
      confluenceBonus: config.confluenceBonus || 0.15,

      // === DIVERGENCE / SNAPBACK CONFIG ===
      // How many bars of spread history to keep per pair
      divergenceWindow: config.divergenceWindow || 15,

      // Spread widening faster than this % per bar = "accelerating divergence"
      divergenceAccelThreshold: config.divergenceAccelThreshold || 0.02,

      // Spread wider than this many ATR = overextended (snapback territory)
      // Falls back to % if no ATR available
      overextendedATR: config.overextendedATR || 2.5,
      overextendedPct: config.overextendedPct || 2.0,  // 2% spread = overextended

      // Confidence boost for snapback signals
      snapbackConfidence: config.snapbackConfidence || 0.20,
    };

    // === STATE: Previous MA values for cross detection ===
    this.prev = {
      ema9: null, ema20: null, ema50: null, ema200: null,
      sma20: null, sma50: null, sma200: null,
    };

    // === STATE: Active crossover signals ===
    // Each entry: { direction: 'bullish'|'bearish', bar: 0, confidence: 0.x }
    this.activeCrosses = {
      ema9_20:   null,
      ema20_50:  null,
      ema50_200: null,
      sma20_50:  null,
      sma50_200: null,
    };

    // === STATS ===
    this.stats = {
      totalCrossesDetected: 0,
      goldenCrosses: 0,
      deathCrosses: 0,
      lastCrossTime: null,
      snapbacksDetected: 0,
    };

    // === DIVERGENCE TRACKING ===
    // Spread history per pair: array of { spread, spreadPct, velocity, accel }
    this.divergence = {
      ema9_20:   { history: [], state: 'normal' },
      ema20_50:  { history: [], state: 'normal' },
      ema50_200: { history: [], state: 'normal' },
      sma20_50:  { history: [], state: 'normal' },
      sma50_200: { history: [], state: 'normal' },
    };

    // Active snapback signals (mean reversion opportunities)
    this.activeSnapbacks = [];

    console.log('📊 EMASMACrossoverSignal initialized');
    console.log(`   Min separation: ${this.config.minSeparationPct}%`);
    console.log(`   Signal decay: ${this.config.signalDecayBars} bars`);
    console.log(`   Divergence tracking: ON (overextended at ${this.config.overextendedPct}%)`);
  }

  // =========================================================================
  // CORE: Update with new indicator snapshot
  // Call this every candle with IndicatorEngine.getSnapshot() data
  // =========================================================================
  update(indicators) {
    if (!indicators) return this.getSignal();

    const ema = indicators.ema || {};
    const sma = indicators.sma || {};

    // Extract current MA values
    // IndicatorEngine uses numeric keys: ema[20], ema[50], ema[200]
    const current = {
      ema9:   ema[9]   || ema[12]  || null,  // Some configs use 12 instead of 9
      ema20:  ema[20]  || ema[26]  || null,  // Some configs use 26 instead of 20
      ema50:  ema[50]  || null,
      ema200: ema[200] || null,
      sma20:  sma[20]  || null,
      sma50:  sma[50]  || null,
      sma200: sma[200] || null,
    };

    // Only detect crosses if we have previous values (need 2 bars minimum)
    if (this.prev.ema20 !== null) {
      this._detectCross('ema9_20',   this.prev.ema9,  this.prev.ema20,  current.ema9,  current.ema20);
      this._detectCross('ema20_50',  this.prev.ema20, this.prev.ema50,  current.ema20, current.ema50);
      this._detectCross('ema50_200', this.prev.ema50, this.prev.ema200, current.ema50, current.ema200);
      this._detectCross('sma20_50',  this.prev.sma20, this.prev.sma50,  current.sma20, current.sma50);
      this._detectCross('sma50_200', this.prev.sma50, this.prev.sma200, current.sma50, current.sma200);
    }

    // Track divergence (spread velocity + acceleration) for ALL pairs
    const atr = indicators.atr || null;
    this._trackDivergence('ema9_20',   current.ema9,   current.ema20,  atr);
    this._trackDivergence('ema20_50',  current.ema20,  current.ema50,  atr);
    this._trackDivergence('ema50_200', current.ema50,  current.ema200, atr);
    this._trackDivergence('sma20_50',  current.sma20,  current.sma50,  atr);
    this._trackDivergence('sma50_200', current.sma50,  current.sma200, atr);

    // Detect snapback zones (overextended + decelerating = reversion incoming)
    this._detectSnapbacks();

    // Age all active crosses
    this._ageActiveCrosses();

    // Store current as previous for next bar
    this.prev = { ...current };

    return this.getSignal();
  }

  // =========================================================================
  // DETECT: Check if a crossover occurred between two MAs
  // =========================================================================
  _detectCross(pairKey, prevFast, prevSlow, currFast, currSlow) {
    // Need all 4 values
    if (prevFast == null || prevSlow == null || currFast == null || currSlow == null) return;

    const prevDiff = prevFast - prevSlow;
    const currDiff = currFast - currSlow;

    // Check minimum separation to filter noise
    const avgPrice = (currFast + currSlow) / 2;
    if (avgPrice === 0) return;
    const separationPct = (Math.abs(currDiff) / avgPrice) * 100;

    // GOLDEN CROSS: fast was below slow, now fast is above slow
    if (prevDiff <= 0 && currDiff > 0 && separationPct >= this.config.minSeparationPct) {
      this.activeCrosses[pairKey] = {
        direction: 'bullish',
        bar: 0,
        confidence: this.config.weights[pairKey],
        separationPct,
        timestamp: Date.now(),
      };
      this.stats.totalCrossesDetected++;
      this.stats.goldenCrosses++;
      this.stats.lastCrossTime = Date.now();
      console.log(`✨ GOLDEN CROSS [${pairKey}] — Fast crossed above slow (sep: ${separationPct.toFixed(3)}%)`);
    }

    // DEATH CROSS: fast was above slow, now fast is below slow
    if (prevDiff >= 0 && currDiff < 0 && separationPct >= this.config.minSeparationPct) {
      this.activeCrosses[pairKey] = {
        direction: 'bearish',
        bar: 0,
        confidence: this.config.weights[pairKey],
        separationPct,
        timestamp: Date.now(),
      };
      this.stats.totalCrossesDetected++;
      this.stats.deathCrosses++;
      this.stats.lastCrossTime = Date.now();
      console.log(`💀 DEATH CROSS [${pairKey}] — Fast crossed below slow (sep: ${separationPct.toFixed(3)}%)`);
    }
  }

  // =========================================================================
  // AGE: Decay active signals over time
  // =========================================================================
  _ageActiveCrosses() {
    for (const key of Object.keys(this.activeCrosses)) {
      const cross = this.activeCrosses[key];
      if (!cross) continue;

      cross.bar++;

      // Apply linear decay: confidence drops to 0 over signalDecayBars
      const decayFactor = Math.max(0, 1 - (cross.bar / this.config.signalDecayBars));
      cross.confidence = this.config.weights[key] * decayFactor;

      // Expire dead signals
      if (cross.bar >= this.config.signalDecayBars) {
        this.activeCrosses[key] = null;
      }
    }
  }

  // =========================================================================
  // DIVERGENCE: Track how fast MAs are spreading apart
  // This is the "rubber band" detector — catches exponential blowoffs
  // =========================================================================
  _trackDivergence(pairKey, fast, slow, atr) {
    if (fast == null || slow == null) return;

    const div = this.divergence[pairKey];
    const avgPrice = (fast + slow) / 2;
    if (avgPrice === 0) return;

    // Raw spread (signed: positive = fast above slow)
    const spread = fast - slow;
    const spreadPct = (spread / avgPrice) * 100;
    const spreadAbs = Math.abs(spreadPct);

    // Calculate velocity (how fast spread is changing per bar)
    let velocity = 0;
    if (div.history.length > 0) {
      const prevSpreadPct = div.history[div.history.length - 1].spreadPct;
      velocity = spreadPct - prevSpreadPct;  // + means widening, - means narrowing
    }

    // Calculate acceleration (is the widening speeding up or slowing down?)
    let accel = 0;
    if (div.history.length > 1) {
      const prevVelocity = div.history[div.history.length - 1].velocity;
      accel = velocity - prevVelocity;
    }

    // Peak spread tracking (highest divergence since last cross)
    const peakSpread = div.history.length > 0
      ? Math.max(spreadAbs, ...div.history.map(h => Math.abs(h.spreadPct)))
      : spreadAbs;

    // Store
    div.history.push({ spread, spreadPct, spreadAbs, velocity, accel, peakSpread, timestamp: Date.now() });

    // Trim history
    if (div.history.length > this.config.divergenceWindow) {
      div.history.shift();
    }

    // === CLASSIFY DIVERGENCE STATE ===
    const isOverextended = atr
      ? (Math.abs(spread) / atr) > this.config.overextendedATR
      : spreadAbs > this.config.overextendedPct;

    const isAccelerating = Math.abs(velocity) > this.config.divergenceAccelThreshold;
    const isNarrowing = this._isNarrowing(div.history);

    // State machine — key insight: snapback = overextended + spread NARROWING
    if (isOverextended && isNarrowing) {
      div.state = 'snapback_zone';   // Overextended AND narrowing — reversal is HAPPENING
    } else if (isOverextended && isAccelerating && !isNarrowing) {
      div.state = 'blowoff';         // MAs flying apart — DON'T chase, wait for snap
    } else if (isOverextended) {
      div.state = 'overextended';    // Wide spread, watching for narrowing
    } else if (isAccelerating) {
      div.state = 'diverging';       // Spreading but not extreme yet
    } else {
      div.state = 'normal';
    }
  }

  /**
   * Check if spread is NARROWING (absolute spread shrinking over 2+ bars)
   * This is the real snapback signal: MAs were overextended, now converging
   */
  _isNarrowing(history) {
    if (history.length < 3) return false;
    const recent = history.slice(-3);
    const absSpreads = recent.map(h => Math.abs(h.spreadPct));
    // Narrowing = each bar's absolute spread is smaller than the previous
    // (MAs are getting closer together)
    return absSpreads[2] < absSpreads[1] && absSpreads[1] < absSpreads[0];
  }

  // =========================================================================
  // SNAPBACK: Detect when overextended MAs start reverting
  // This is your "exponential divergence → mean reversion" signal
  // =========================================================================
  _detectSnapbacks() {
    // Clear expired snapbacks
    this.activeSnapbacks = this.activeSnapbacks.filter(s => s.age < this.config.signalDecayBars);

    for (const [pairKey, div] of Object.entries(this.divergence)) {
      if (div.state !== 'snapback_zone') continue;
      if (div.history.length < 3) continue;

      const latest = div.history[div.history.length - 1];

      // Already have an active snapback for this pair? Age it, don't double-fire.
      const existing = this.activeSnapbacks.find(s => s.pair === pairKey);
      if (existing) {
        existing.age++;
        continue;
      }

      // Determine snapback direction: if fast was WAY above slow, expect bearish snap
      // If fast was WAY below slow, expect bullish snap
      const direction = latest.spreadPct > 0 ? 'bearish' : 'bullish';

      // Confidence scales with how overextended it was
      const extensionMagnitude = Math.min(latest.spreadAbs / this.config.overextendedPct, 2.0);
      const confidence = this.config.snapbackConfidence * extensionMagnitude;

      this.activeSnapbacks.push({
        pair: pairKey,
        direction,
        confidence,
        spreadAtDetection: latest.spreadPct,
        peakSpread: latest.peakSpread,
        age: 0,
        timestamp: Date.now(),
      });

      this.stats.snapbacksDetected++;
      console.log(`🔄 SNAPBACK ZONE [${pairKey}] — MAs overextended ${latest.spreadAbs.toFixed(2)}% + decelerating → expect ${direction} reversion`);
      console.log(`   Peak spread: ${latest.peakSpread.toFixed(2)}% | Velocity: ${latest.velocity.toFixed(4)} | Confidence: ${(confidence * 100).toFixed(1)}%`);
    }

    // Age all snapbacks
    this.activeSnapbacks.forEach(s => s.age++);
  }

  // =========================================================================
  // GET DIVERGENCE STATUS: For dashboard and TradingBrain
  // =========================================================================
  getDivergenceStatus() {
    const status = {};

    for (const [pairKey, div] of Object.entries(this.divergence)) {
      const latest = div.history.length > 0 ? div.history[div.history.length - 1] : null;
      status[pairKey] = {
        state: div.state,
        spreadPct: latest?.spreadPct?.toFixed(3) || '0',
        velocity: latest?.velocity?.toFixed(4) || '0',
        accel: latest?.accel?.toFixed(4) || '0',
        peakSpread: latest?.peakSpread?.toFixed(3) || '0',
        historyBars: div.history.length,
      };
    }

    return status;
  }

  // =========================================================================
  // GET SNAPBACK SIGNAL: Returns active mean-reversion signals
  // =========================================================================
  getSnapbackSignal() {
    if (this.activeSnapbacks.length === 0) {
      return { hasSignal: false, direction: 'neutral', confidence: 0, snapbacks: [] };
    }

    let bullishConf = 0;
    let bearishConf = 0;

    for (const snap of this.activeSnapbacks) {
      // Decay confidence with age
      const decayFactor = Math.max(0, 1 - (snap.age / this.config.signalDecayBars));
      const decayedConf = snap.confidence * decayFactor;

      if (snap.direction === 'bullish') bullishConf += decayedConf;
      else bearishConf += decayedConf;
    }

    const direction = bullishConf > bearishConf ? 'bullish'
                    : bearishConf > bullishConf ? 'bearish'
                    : 'neutral';

    return {
      hasSignal: true,
      direction,
      confidence: Math.max(bullishConf, bearishConf),
      bullishConf,
      bearishConf,
      snapbacks: this.activeSnapbacks.map(s => ({
        pair: s.pair,
        direction: s.direction,
        confidence: s.confidence,
        age: s.age,
        spreadAtDetection: s.spreadAtDetection,
        peakSpread: s.peakSpread,
      })),
    };
  }

  // =========================================================================
  // GET SIGNAL: Aggregate all active crosses into a single entry signal
  // =========================================================================
  getSignal() {
    let bullishScore = 0;
    let bearishScore = 0;
    let bullishCount = 0;
    let bearishCount = 0;
    const activeSignals = [];

    for (const [key, cross] of Object.entries(this.activeCrosses)) {
      if (!cross) continue;

      activeSignals.push({
        pair: key,
        direction: cross.direction,
        confidence: cross.confidence,
        age: cross.bar,
      });

      if (cross.direction === 'bullish') {
        bullishScore += cross.confidence;
        bullishCount++;
      } else {
        bearishScore += cross.confidence;
        bearishCount++;
      }
    }

    // Determine net direction
    let direction = 'neutral';
    let netConfidence = 0;

    if (bullishScore > bearishScore && bullishScore > 0) {
      direction = 'bullish';
      netConfidence = bullishScore - bearishScore;
    } else if (bearishScore > bullishScore && bearishScore > 0) {
      direction = 'bearish';
      netConfidence = bearishScore - bullishScore;
    }

    // Confluence bonus: multiple MA pairs agreeing amplifies signal
    const dominantCount = direction === 'bullish' ? bullishCount : bearishCount;
    let confluenceBonus = 0;
    if (dominantCount >= this.config.confluenceMinPairs) {
      confluenceBonus = this.config.confluenceBonus;
      netConfidence += confluenceBonus;
    }

    // Cap confidence at 1.0
    netConfidence = Math.min(1.0, netConfidence);

    return {
      direction,                          // 'bullish', 'bearish', or 'neutral'
      confidence: netConfidence,           // 0.0 - 1.0
      bullishScore,
      bearishScore,
      confluenceBonus,
      activePairs: dominantCount,
      signals: activeSignals,
      hasSignal: direction !== 'neutral',

      // Divergence / Snapback data
      snapback: this.getSnapbackSignal(),
      divergence: this.getDivergenceStatus(),
    };
  }

  // =========================================================================
  // VOTES: Return structured votes for TradingBrain ensemble voting
  // =========================================================================
  getVotes() {
    const signal = this.getSignal();
    const votes = [];

    if (!signal.hasSignal) return votes;

    // Main directional vote
    const voteDirection = signal.direction === 'bullish' ? 1 : -1;
    votes.push({
      tag: `MA_CROSS:${signal.direction}`,
      vote: voteDirection,
      strength: signal.confidence,
    });

    // Individual pair votes for granularity
    for (const sig of signal.signals) {
      const pairVote = sig.direction === 'bullish' ? 1 : -1;
      votes.push({
        tag: `MA_CROSS:${sig.pair}:${sig.direction}`,
        vote: pairVote,
        strength: sig.confidence,
      });
    }

    // Confluence vote (extra weight when multiple pairs agree)
    if (signal.confluenceBonus > 0) {
      votes.push({
        tag: 'MA_CROSS:CONFLUENCE',
        vote: voteDirection,
        strength: signal.confluenceBonus,
      });
    }

    // Snapback / Mean Reversion votes
    const snapback = this.getSnapbackSignal();
    if (snapback.hasSignal) {
      const snapDir = snapback.direction === 'bullish' ? 1 : -1;
      votes.push({
        tag: `MA_SNAPBACK:${snapback.direction}`,
        vote: snapDir,
        strength: snapback.confidence,
      });

      // Individual snapback pair votes
      for (const snap of snapback.snapbacks) {
        votes.push({
          tag: `MA_SNAPBACK:${snap.pair}:${snap.direction}`,
          vote: snap.direction === 'bullish' ? 1 : -1,
          strength: snap.confidence * Math.max(0, 1 - snap.age / this.config.signalDecayBars),
        });
      }
    }

    // BLOWOFF WARNING: negative vote when MAs are accelerating apart
    // This tells TradingBrain "don't chase this move"
    for (const [key, div] of Object.entries(this.divergence)) {
      if (div.state === 'blowoff') {
        const latest = div.history[div.history.length - 1];
        // Vote AGAINST the direction of the blowoff
        const blowoffDir = latest.spreadPct > 0 ? -1 : 1; // Spread up = don't buy, spread down = don't sell
        votes.push({
          tag: `MA_BLOWOFF:${key}`,
          vote: blowoffDir,
          strength: 0.15, // Moderate warning
        });
      }
    }

    return votes;
  }

  // =========================================================================
  // CONFIDENCE BOOST: Return confidence addition for TradingBrain
  // Used in calculateRealConfidence() to add MA crossover confidence
  // =========================================================================
  getConfidenceBoost() {
    const signal = this.getSignal();
    const snapback = this.getSnapbackSignal();

    return {
      // Crossover signals
      bullishBoost: signal.bullishScore,
      bearishBoost: signal.bearishScore,
      confluenceBonus: signal.confluenceBonus,
      direction: signal.direction,
      activePairs: signal.activePairs,

      // Snapback / Mean Reversion signals
      snapbackDirection: snapback.direction,
      snapbackConfidence: snapback.confidence,
      hasSnapback: snapback.hasSignal,

      // Blowoff warnings (don't chase)
      blowoffPairs: Object.entries(this.divergence)
        .filter(([_, d]) => d.state === 'blowoff')
        .map(([key, _]) => key),
    };
  }

  // =========================================================================
  // ENTRY CHECK: Simple yes/no for whether MA crosses support an entry
  // =========================================================================
  shouldEnterLong() {
    const signal = this.getSignal();
    return {
      enter: signal.direction === 'bullish' && signal.confidence > 0.1,
      confidence: signal.confidence,
      reason: signal.activePairs > 0
        ? `${signal.activePairs} MA pair(s) bullish crossover`
        : 'No bullish MA crosses active',
    };
  }

  shouldEnterShort() {
    const signal = this.getSignal();
    return {
      enter: signal.direction === 'bearish' && signal.confidence > 0.1,
      confidence: signal.confidence,
      reason: signal.activePairs > 0
        ? `${signal.activePairs} MA pair(s) bearish crossover`
        : 'No bearish MA crosses active',
    };
  }

  // =========================================================================
  // TELEMETRY: Get current state for dashboard/logging
  // =========================================================================
  getState() {
    return {
      activeCrosses: { ...this.activeCrosses },
      signal: this.getSignal(),
      stats: { ...this.stats },
      divergence: this.getDivergenceStatus(),
      snapback: this.getSnapbackSignal(),
      config: {
        minSeparationPct: this.config.minSeparationPct,
        signalDecayBars: this.config.signalDecayBars,
        overextendedPct: this.config.overextendedPct,
        weights: { ...this.config.weights },
      },
    };
  }

  // =========================================================================
  // RESET: Clear all state
  // =========================================================================
  reset() {
    this.prev = {
      ema9: null, ema20: null, ema50: null, ema200: null,
      sma20: null, sma50: null, sma200: null,
    };
    this.activeCrosses = {
      ema9_20: null, ema20_50: null, ema50_200: null,
      sma20_50: null, sma50_200: null,
    };
    this.divergence = {
      ema9_20:   { history: [], state: 'normal' },
      ema20_50:  { history: [], state: 'normal' },
      ema50_200: { history: [], state: 'normal' },
      sma20_50:  { history: [], state: 'normal' },
      sma50_200: { history: [], state: 'normal' },
    };
    this.activeSnapbacks = [];
    console.log('📊 EMASMACrossoverSignal reset');
  }
}

module.exports = EMASMACrossoverSignal;
