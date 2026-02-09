/**
 * ============================================================================
 * MADynamicSR.js - Moving Average Dynamic Support & Resistance
 * ============================================================================
 *
 * PURPOSE: Treat EMAs and SMAs as LIVING support/resistance levels.
 * Price doesn't just cross MAs — it RESPECTS them, BOUNCES off them,
 * or BREAKS through them. Each of these events is a trade signal.
 *
 * WHAT THIS CATCHES (from Trey's chart analysis):
 *
 * 1. MA BOUNCE (Support/Resistance Hold)
 *    - Price pulls back TO an MA from above → bounces up = BUY (MA is support)
 *    - Price rallies UP TO an MA from below → rejects = SELL (MA is resistance)
 *    - This is the "trampoline effect" visible on QQQ weekly
 *
 * 2. MA BREAK (Breakdown/Breakout)
 *    - Price was above MA, drops THROUGH it = bearish breakdown
 *    - Price was below MA, surges THROUGH it = bullish breakout
 *    - Break + volume/momentum = high confidence
 *
 * 3. MA RETEST (Confirmation)
 *    - After breaking through an MA, price comes BACK to test it
 *    - If it holds on the retest = strongest signal (breakout confirmed)
 *    - If it fails the retest = false breakout (trap)
 *
 * 4. MA ZONE STACKING
 *    - When price is between multiple MAs clustered together = compression zone
 *    - Breakout from compression = explosive move incoming
 *
 * MAs TRACKED AS S/R:
 *    - EMA 9   (scalp S/R)
 *    - SMA 20  (swing S/R — the "trampoline" from QQQ charts)
 *    - EMA 50  (position S/R)
 *    - SMA 200 (institutional S/R — the "floor/ceiling")
 *
 * PLUGS INTO: Same integration points as EMASMACrossoverSignal
 *
 * @author OGZPrime Development Team
 * @version 1.0.0
 * ============================================================================
 */

class MADynamicSR {
  constructor(config = {}) {
    this.config = {
      // How close price needs to be to an MA to count as "touching" (% of price)
      touchZonePct: config.touchZonePct || 0.3,

      // How far price needs to move away after touching to confirm a bounce (%)
      bounceConfirmPct: config.bounceConfirmPct || 0.5,

      // How far price needs to break through an MA to count as a real break (%)
      breakConfirmPct: config.breakConfirmPct || 0.4,

      // How many bars a bounce/break signal stays active
      signalDecayBars: config.signalDecayBars || 8,

      // Retest window: how many bars after a break to watch for retest
      retestWindowBars: config.retestWindowBars || 12,

      // Confidence weights per MA level
      weights: {
        ema9:   config.weights?.ema9   || 0.10,  // Scalp level
        sma20:  config.weights?.sma20  || 0.25,  // The trampoline (QQQ charts)
        ema50:  config.weights?.ema50  || 0.25,  // Position level
        sma200: config.weights?.sma200 || 0.40,  // Institutional floor/ceiling
      },
    };

    // === MA LEVELS WE TRACK AS S/R ===
    this.levels = {
      ema9:   { key: 'ema9',   name: 'EMA 9',   type: 'ema', period: 9 },
      sma20:  { key: 'sma20',  name: 'SMA 20',  type: 'sma', period: 20 },
      ema50:  { key: 'ema50',  name: 'EMA 50',  type: 'ema', period: 50 },
      sma200: { key: 'sma200', name: 'SMA 200', type: 'sma', period: 200 },
    };

    // === STATE PER MA LEVEL ===
    // Tracks price's relationship with each MA
    this.state = {};
    for (const key of Object.keys(this.levels)) {
      this.state[key] = {
        priceRelation: 'unknown',   // 'above' | 'below' | 'at' | 'unknown'
        prevRelation: 'unknown',
        touchState: 'none',         // 'none' | 'approaching' | 'touching' | 'bouncing' | 'breaking'
        touchBar: 0,                // Bars since last touch
        lastBreakDir: null,         // 'bullish' | 'bearish' | null
        lastBreakBar: 0,            // Bars since last break
        retestPending: false,       // Waiting for retest after break?
        retestBar: 0,               // Bars since break (for retest window)
      };
    }

    // === PRICE HISTORY (small window for candle analysis) ===
    this.priceHistory = []; // { close, high, low, open }
    this.maxHistory = 5;

    // === ACTIVE SIGNALS ===
    this.activeSignals = []; // { type, maKey, direction, confidence, age, reason }

    // === STATS ===
    this.stats = {
      bounces: 0,
      breaks: 0,
      retests: 0,
      retestHolds: 0,
      retestFails: 0,
    };

    console.log('🎯 MADynamicSR initialized — MAs are now living support/resistance');
    console.log(`   Touch zone: ±${this.config.touchZonePct}% | Bounce confirm: ${this.config.bounceConfirmPct}% | Break confirm: ${this.config.breakConfirmPct}%`);
  }

  // =========================================================================
  // UPDATE: Feed new bar data, detect bounces/breaks/retests
  // =========================================================================
  update(indicators, candle) {
    // candle: { open, high, low, close } — current bar
    // indicators: from IndicatorEngine.getSnapshot()

    const close = candle?.close || indicators.close || indicators.price;
    const high = candle?.high || close;
    const low = candle?.low || close;
    const open = candle?.open || close;

    if (!close) return this.getSignal();

    // Store price history
    this.priceHistory.push({ close, high, low, open });
    if (this.priceHistory.length > this.maxHistory) this.priceHistory.shift();

    // Extract MA values from indicators
    const maValues = this._extractMAValues(indicators);

    // === Process each MA level ===
    for (const [key, level] of Object.entries(this.levels)) {
      const maValue = maValues[key];
      if (!maValue || maValue === 0) continue;

      this._processMALevel(key, maValue, close, high, low);
    }

    // Age and expire signals
    this._ageSignals();

    // Check for MA compression zones
    this._checkCompression(maValues, close);

    return this.getSignal();
  }

  // =========================================================================
  // EXTRACT MA VALUES from indicator snapshot
  // =========================================================================
  _extractMAValues(indicators) {
    const values = {};

    // EMA values
    if (indicators.ema) {
      values.ema9  = indicators.ema[9]  || indicators.ema[12] || null; // Fallback to 12
      values.ema50 = indicators.ema[50] || null;
    }

    // SMA values
    if (indicators.sma) {
      values.sma20  = indicators.sma[20]  || null;
      values.sma200 = indicators.sma[200] || null;
    }

    return values;
  }

  // =========================================================================
  // PROCESS EACH MA LEVEL: Detect touch, bounce, break, retest
  // =========================================================================
  _processMALevel(key, maValue, close, high, low) {
    const st = this.state[key];
    const weight = this.config.weights[key];
    const levelName = this.levels[key].name;

    // === Determine price relationship ===
    const distPct = ((close - maValue) / maValue) * 100;
    const distAbsPct = Math.abs(distPct);

    st.prevRelation = st.priceRelation;

    if (distAbsPct <= this.config.touchZonePct) {
      st.priceRelation = 'at';
    } else if (close > maValue) {
      st.priceRelation = 'above';
    } else {
      st.priceRelation = 'below';
    }

    // === Did price's wick touch the MA? (even if close didn't) ===
    const wickTouched = (low <= maValue && high >= maValue) ||
                        (Math.abs(low - maValue) / maValue * 100 <= this.config.touchZonePct) ||
                        (Math.abs(high - maValue) / maValue * 100 <= this.config.touchZonePct);

    // === DETECT EVENTS ===

    // ------ 1. BOUNCE DETECTION ------
    // Price was above MA, dipped to touch it, bounced back up (support bounce)
    if (st.prevRelation === 'above' && (st.priceRelation === 'at' || wickTouched) && close > maValue) {
      const bounceStrength = distPct; // How far it bounced back
      if (bounceStrength >= this.config.bounceConfirmPct * 0.5) {
        this._addSignal('bounce', key, 'bullish', weight * 0.8,
          `${levelName} acting as SUPPORT — price bounced off (${distPct.toFixed(2)}% above)`);
        this.stats.bounces++;
      } else {
        st.touchState = 'touching'; // Still sitting on MA, watching
      }
    }

    // Price was below MA, rallied to touch it, rejected back down (resistance bounce)
    if (st.prevRelation === 'below' && (st.priceRelation === 'at' || wickTouched) && close < maValue) {
      const bounceStrength = Math.abs(distPct);
      if (bounceStrength >= this.config.bounceConfirmPct * 0.5) {
        this._addSignal('bounce', key, 'bearish', weight * 0.8,
          `${levelName} acting as RESISTANCE — price rejected (${Math.abs(distPct).toFixed(2)}% below)`);
        this.stats.bounces++;
      } else {
        st.touchState = 'touching';
      }
    }

    // Confirmed bounce: was touching, now moved away in expected direction
    if (st.touchState === 'touching') {
      st.touchBar++;
      if (st.priceRelation === 'above' && st.prevRelation !== 'above') {
        this._addSignal('bounce', key, 'bullish', weight,
          `${levelName} CONFIRMED support bounce — price reclaimed above`);
        st.touchState = 'none';
        st.touchBar = 0;
        this.stats.bounces++;
      } else if (st.priceRelation === 'below' && st.prevRelation !== 'below') {
        this._addSignal('bounce', key, 'bearish', weight,
          `${levelName} CONFIRMED resistance rejection — price pushed below`);
        st.touchState = 'none';
        st.touchBar = 0;
        this.stats.bounces++;
      } else if (st.touchBar > 3) {
        // Sitting on MA too long — reset, it's consolidating not bouncing
        st.touchState = 'none';
        st.touchBar = 0;
      }
    }

    // ------ 2. BREAKOUT / BREAKDOWN DETECTION ------
    // Was above, now below = BREAKDOWN
    if (st.prevRelation === 'above' && st.priceRelation === 'below' &&
        distAbsPct >= this.config.breakConfirmPct) {
      this._addSignal('break', key, 'bearish', weight,
        `${levelName} BREAKDOWN — price fell through (${distAbsPct.toFixed(2)}% below)`);
      st.lastBreakDir = 'bearish';
      st.lastBreakBar = 0;
      st.retestPending = true;
      st.retestBar = 0;
      this.stats.breaks++;
    }

    // Was below, now above = BREAKOUT
    if (st.prevRelation === 'below' && st.priceRelation === 'above' &&
        distAbsPct >= this.config.breakConfirmPct) {
      this._addSignal('break', key, 'bullish', weight,
        `${levelName} BREAKOUT — price surged through (${distAbsPct.toFixed(2)}% above)`);
      st.lastBreakDir = 'bullish';
      st.lastBreakBar = 0;
      st.retestPending = true;
      st.retestBar = 0;
      this.stats.breaks++;
    }

    // ------ 3. RETEST DETECTION (after a break) ------
    if (st.retestPending) {
      st.retestBar++;

      // Retest window expired?
      if (st.retestBar > this.config.retestWindowBars) {
        st.retestPending = false;
        // No retest = the break was clean, that's also a signal
      }

      // Did price come back to test the MA?
      if (st.priceRelation === 'at' || wickTouched) {
        st.retestPending = false;
        this.stats.retests++;

        if (st.lastBreakDir === 'bullish' && close > maValue) {
          // Bullish break → retest → held above = STRONG BUY
          this._addSignal('retest_hold', key, 'bullish', weight * 1.3,
            `${levelName} RETEST HELD — broke above, came back, support confirmed 💪`);
          this.stats.retestHolds++;
        } else if (st.lastBreakDir === 'bearish' && close < maValue) {
          // Bearish break → retest → held below = STRONG SELL
          this._addSignal('retest_hold', key, 'bearish', weight * 1.3,
            `${levelName} RETEST HELD — broke below, came back, resistance confirmed 💪`);
          this.stats.retestHolds++;
        } else {
          // Failed retest — price broke back through = false breakout/breakdown
          const failDir = st.lastBreakDir === 'bullish' ? 'bearish' : 'bullish';
          this._addSignal('retest_fail', key, failDir, weight * 0.6,
            `${levelName} FALSE BREAK — retest failed, price reversed back through`);
          this.stats.retestFails++;
        }
      }
    }

    st.lastBreakBar++;
  }

  // =========================================================================
  // COMPRESSION ZONE: Multiple MAs clustered = explosive move incoming
  // =========================================================================
  _checkCompression(maValues, close) {
    const validMAs = Object.entries(maValues)
      .filter(([_, v]) => v != null && v > 0)
      .map(([key, value]) => ({ key, value }));

    if (validMAs.length < 3) return;

    // Calculate max spread between all MAs as % of price
    const maVals = validMAs.map(m => m.value);
    const maxMA = Math.max(...maVals);
    const minMA = Math.min(...maVals);
    const spreadPct = ((maxMA - minMA) / close) * 100;

    // If all tracked MAs are within 2% of each other = compression
    if (spreadPct < 2.0 && validMAs.length >= 3) {
      // Check if we already have an active compression signal
      const existing = this.activeSignals.find(s => s.type === 'compression');
      if (!existing) {
        this._addSignal('compression', 'all', 'neutral', 0.15,
          `MA COMPRESSION — ${validMAs.length} MAs within ${spreadPct.toFixed(1)}% → explosive move incoming`);
        console.log(`🔥 MA COMPRESSION ZONE: ${validMAs.map(m => m.key).join(', ')} within ${spreadPct.toFixed(1)}%`);
      }
    }
  }

  // =========================================================================
  // SIGNAL MANAGEMENT
  // =========================================================================
  _addSignal(type, maKey, direction, confidence, reason) {
    // Don't duplicate: same type + same MA + same direction within decay window
    const existing = this.activeSignals.find(
      s => s.type === type && s.maKey === maKey && s.direction === direction && s.age < 3
    );
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      return;
    }

    this.activeSignals.push({
      type,
      maKey,
      direction,
      confidence: Math.min(confidence, 1.0),
      age: 0,
      reason,
      timestamp: Date.now(),
    });

    const emoji = type === 'bounce' ? '🏐' : type === 'break' ? '💥' : type === 'retest_hold' ? '💪' : type === 'retest_fail' ? '❌' : '🔥';
    console.log(`${emoji} MA S/R [${maKey}]: ${type} ${direction} — ${reason}`);
  }

  _ageSignals() {
    this.activeSignals = this.activeSignals.filter(s => {
      s.age++;
      return s.age <= this.config.signalDecayBars;
    });
  }

  // =========================================================================
  // GET SIGNAL: Aggregate all active S/R signals
  // =========================================================================
  getSignal() {
    if (this.activeSignals.length === 0) {
      return {
        hasSignal: false,
        direction: 'neutral',
        confidence: 0,
        bullishScore: 0,
        bearishScore: 0,
        signals: [],
        compression: false,
      };
    }

    let bullishScore = 0;
    let bearishScore = 0;
    let compression = false;
    const signals = [];

    for (const sig of this.activeSignals) {
      // Apply signal decay
      const decayFactor = Math.max(0, 1 - (sig.age / this.config.signalDecayBars));
      const decayedConf = sig.confidence * decayFactor;

      if (sig.type === 'compression') {
        compression = true;
        continue;
      }

      if (sig.direction === 'bullish') bullishScore += decayedConf;
      else if (sig.direction === 'bearish') bearishScore += decayedConf;

      signals.push({
        type: sig.type,
        maKey: sig.maKey,
        direction: sig.direction,
        confidence: decayedConf,
        age: sig.age,
        reason: sig.reason,
      });
    }

    const direction = bullishScore > bearishScore ? 'bullish'
                    : bearishScore > bullishScore ? 'bearish'
                    : 'neutral';

    const netConfidence = Math.abs(bullishScore - bearishScore);

    return {
      hasSignal: direction !== 'neutral',
      direction,
      confidence: netConfidence,
      bullishScore,
      bearishScore,
      signals,
      compression,
      activeLevels: signals.length,
    };
  }

  // =========================================================================
  // GET VOTES: For TradingBrain ensemble voting system
  // =========================================================================
  getVotes() {
    const votes = [];
    const signal = this.getSignal();

    if (!signal.hasSignal && !signal.compression) return votes;

    // Main directional vote
    if (signal.hasSignal) {
      votes.push({
        tag: `MA_SR:${signal.direction}`,
        vote: signal.direction === 'bullish' ? 1 : -1,
        strength: signal.confidence,
      });
    }

    // Individual level votes (so TradingBrain knows WHICH MA is acting as S/R)
    for (const sig of signal.signals) {
      votes.push({
        tag: `MA_SR:${sig.maKey}:${sig.type}:${sig.direction}`,
        vote: sig.direction === 'bullish' ? 1 : -1,
        strength: sig.confidence,
      });
    }

    // Compression vote (neutral but important context)
    if (signal.compression) {
      votes.push({
        tag: 'MA_SR:COMPRESSION',
        vote: 0,
        strength: 0.15,
      });
    }

    // Retest hold = extra conviction (strongest signal)
    const retestHolds = signal.signals.filter(s => s.type === 'retest_hold');
    if (retestHolds.length > 0) {
      const totalRetestConf = retestHolds.reduce((sum, s) => sum + s.confidence, 0);
      votes.push({
        tag: 'MA_SR:RETEST_CONFIRMED',
        vote: retestHolds[0].direction === 'bullish' ? 1 : -1,
        strength: totalRetestConf,
      });
    }

    return votes;
  }

  // =========================================================================
  // GET CONFIDENCE BOOST: For TradingBrain.calculateRealConfidence()
  // =========================================================================
  getConfidenceBoost() {
    const signal = this.getSignal();

    return {
      bullishBoost: signal.bullishScore,
      bearishBoost: signal.bearishScore,
      direction: signal.direction,
      activeLevels: signal.activeLevels,
      compression: signal.compression,
      hasRetestConfirmation: signal.signals.some(s => s.type === 'retest_hold'),
    };
  }

  // =========================================================================
  // CONVENIENCE: Should we enter based on S/R signals?
  // =========================================================================
  shouldEnterLong() {
    const sig = this.getSignal();
    return {
      enter: sig.direction === 'bullish' && sig.confidence > 0.15,
      confidence: sig.bullishScore,
      reason: sig.signals.filter(s => s.direction === 'bullish').map(s => s.reason).join(' | '),
    };
  }

  shouldEnterShort() {
    const sig = this.getSignal();
    return {
      enter: sig.direction === 'bearish' && sig.confidence > 0.15,
      confidence: sig.bearishScore,
      reason: sig.signals.filter(s => s.direction === 'bearish').map(s => s.reason).join(' | '),
    };
  }

  // =========================================================================
  // GET STATE: Full telemetry for dashboard
  // =========================================================================
  getState() {
    return {
      signal: this.getSignal(),
      levels: Object.fromEntries(
        Object.entries(this.state).map(([key, st]) => [key, {
          priceRelation: st.priceRelation,
          touchState: st.touchState,
          retestPending: st.retestPending,
          lastBreakDir: st.lastBreakDir,
        }])
      ),
      stats: { ...this.stats },
    };
  }

  // =========================================================================
  // RESET
  // =========================================================================
  reset() {
    for (const key of Object.keys(this.state)) {
      this.state[key] = {
        priceRelation: 'unknown',
        prevRelation: 'unknown',
        touchState: 'none',
        touchBar: 0,
        lastBreakDir: null,
        lastBreakBar: 0,
        retestPending: false,
        retestBar: 0,
      };
    }
    this.priceHistory = [];
    this.activeSignals = [];
    console.log('🎯 MADynamicSR reset');
  }
}

module.exports = MADynamicSR;
