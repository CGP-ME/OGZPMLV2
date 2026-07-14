/**
 * MADynamicSR.js — Trader DNA Strategy Implementation (CORRECTED)
 * ================================================================
 * Based on "3 EMA Strategies That NEVER LOSE" by Trader DNA
 *
 * CORRECTED INTERPRETATION:
 * - 20 MA = The entire trend system. Rising + under price = uptrend. Falling + over price = downtrend.
 * - 200 MA = Dynamic support/resistance level. Floor or ceiling. NOT for trend direction.
 *
 * ENTRY REQUIREMENTS (ALL must be true):
 * 1. 20 MA must be TRENDING (rising or falling), not flat
 * 2. Price must NOT be extended (too far from 20 MA)
 * 3. Skip first touch after parabolic extension
 * 4. 123 Pattern confirmed (HH/HL for longs, LH/LL for shorts)
 * 5. Price pulls back to 20 MA
 * 6. Confirmation candle appears (hammer, engulfing, etc.)
 * 7. Acceleration filter (candle range > 1.2x ATR)
 *
 * EXIT: 1:3 R:R, BUT capped at 200 MA if it's in the way
 *
 * Rewritten: 2026-03-09 per Trader DNA spec correction
 */

'use strict';

const { c, o, h, l } = require('../core/CandleHelper');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMBER_KEYS = [
  'entryMaPeriod',
  'srMaPeriod',
  'touchZonePct',
  'srTestCount',
  'swingLookback',
  'srZonePct',
  'slopeLookback',
  'minSlopePct',
  'maxExtensionAtr',
  'atrPeriod',
  'patternPersistBars',
  'baseConfidence',
  'touchQualityWeight',
  'maxConfidence',
];

const CONDITION_FLAG_KEYS = [
  'trendGate',
  'extension',
  'firstTouchAfterParabolic',
  'pullbackCooldown',
  'confirmationCandle',
  'srAlignment',
  'structuralValidity',
];

const REQUIRED_MULTIPLIER_KEYS = [
  'extensionMin',
  'extensionPenaltyScale',
  'firstTouchAfterParabolic',
  'pullbackCooldown',
  'confirmationAligned',
  'confirmationMissing',
  'confirmationConflict',
  'srAligned',
  'srMissing',
  'srWrongSide',
  'structuralValid',
  'structuralInvalid',
];

const REQUIRED_STRUCTURAL_KEYS = [
  'atrBufferMultiplier',
  'rewardRiskTarget',
  'minRewardRisk',
  'minTakeProfitPct',
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeConfig(base, override) {
  const merged = { ...base, ...override };
  if (isPlainObject(base.conditionFlags) || isPlainObject(override.conditionFlags)) {
    merged.conditionFlags = { ...(base.conditionFlags || {}), ...(override.conditionFlags || {}) };
  }
  if (isPlainObject(base.multipliers) || isPlainObject(override.multipliers)) {
    merged.multipliers = { ...(base.multipliers || {}), ...(override.multipliers || {}) };
  }
  if (isPlainObject(base.structural) || isPlainObject(override.structural)) {
    merged.structural = { ...(base.structural || {}), ...(override.structural || {}) };
  }
  return merged;
}

function requireFiniteConfig(config, key) {
  const value = Number(config[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`[MADynamicSR] Missing numeric config key strategies.MADynamicSR.${key}`);
  }
  return value;
}

function requireNestedFinite(config, section, key) {
  if (!isPlainObject(config[section])) {
    throw new Error(`[MADynamicSR] Missing config block strategies.MADynamicSR.${section}`);
  }
  const value = Number(config[section][key]);
  if (!Number.isFinite(value)) {
    throw new Error(`[MADynamicSR] Missing numeric config key strategies.MADynamicSR.${section}.${key}`);
  }
  return value;
}

function requireNestedBool(config, section, key) {
  if (!isPlainObject(config[section])) {
    throw new Error(`[MADynamicSR] Missing config block strategies.MADynamicSR.${section}`);
  }
  if (typeof config[section][key] !== 'boolean') {
    throw new Error(`[MADynamicSR] Missing boolean config key strategies.MADynamicSR.${section}.${key}`);
  }
  return config[section][key];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readPath(root, configPath) {
  return configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), root);
}

function loadResolvedConfig(overrides = {}) {
  const cached = typeof ConfigLoader.getCachedSnapshot === 'function'
    ? ConfigLoader.getCachedSnapshot()
    : null;
  const loaded = cached?.config
    ? readPath(cached.config, 'strategies.MADynamicSR')
    : readPath(ConfigLoader.BASE_CONFIG, 'strategies.MADynamicSR');
  if (!isPlainObject(loaded)) {
    throw new Error('[MADynamicSR] Missing config block strategies.MADynamicSR');
  }

  const merged = deepMergeConfig(loaded, isPlainObject(overrides) ? overrides : {});
  const normalized = {};
  for (const key of REQUIRED_NUMBER_KEYS) {
    normalized[key] = requireFiniteConfig(merged, key);
  }
  normalized.enabled = Boolean(merged.enabled);
  normalized.conditionFlags = {};
  for (const key of CONDITION_FLAG_KEYS) {
    normalized.conditionFlags[key] = requireNestedBool(merged, 'conditionFlags', key);
  }
  normalized.multipliers = {};
  for (const key of REQUIRED_MULTIPLIER_KEYS) {
    normalized.multipliers[key] = requireNestedFinite(merged, 'multipliers', key);
  }
  normalized.structural = {};
  for (const key of REQUIRED_STRUCTURAL_KEYS) {
    normalized.structural[key] = requireNestedFinite(merged, 'structural', key);
  }
  validateResolvedConfig(normalized);
  return normalized;
}

function requirePositive(value, configPath) {
  if (!(value > 0)) {
    throw new Error(`[MADynamicSR] ${configPath} must be greater than 0`);
  }
}

function requirePositiveInteger(value, configPath) {
  requirePositive(value, configPath);
  if (!Number.isInteger(value)) {
    throw new Error(`[MADynamicSR] ${configPath} must be an integer`);
  }
}

function validateResolvedConfig(config) {
  for (const key of [
    'entryMaPeriod',
    'srMaPeriod',
    'touchZonePct',
    'srTestCount',
    'swingLookback',
    'srZonePct',
    'slopeLookback',
    'minSlopePct',
    'maxExtensionAtr',
    'atrPeriod',
    'patternPersistBars',
    'baseConfidence',
    'touchQualityWeight',
    'maxConfidence',
  ]) {
    requirePositive(config[key], `strategies.MADynamicSR.${key}`);
  }
  for (const key of ['entryMaPeriod', 'srMaPeriod', 'srTestCount', 'swingLookback', 'slopeLookback', 'atrPeriod', 'patternPersistBars']) {
    requirePositiveInteger(config[key], `strategies.MADynamicSR.${key}`);
  }
  if (config.slopeLookback < 2) {
    throw new Error('[MADynamicSR] strategies.MADynamicSR.slopeLookback must be at least 2 bars');
  }
  for (const key of REQUIRED_MULTIPLIER_KEYS) {
    requirePositive(config.multipliers[key], `strategies.MADynamicSR.multipliers.${key}`);
  }
  for (const key of REQUIRED_STRUCTURAL_KEYS) {
    requirePositive(config.structural[key], `strategies.MADynamicSR.structural.${key}`);
  }
}

class MADynamicSR {
  constructor(config = {}) {
    this.config = loadResolvedConfig(config);

    // MA periods per CORRECTED Trader DNA interpretation
    this.entryMaPeriod = this.config.entryMaPeriod;     // 20 MA — the trend + entry line
    this.srMaPeriod = this.config.srMaPeriod;           // 200 MA — support/resistance level (NOT trend)
    this.atrPeriod = this.config.atrPeriod;             // For SL buffer and structural validity

    // Swing detection settings
    this.swingLookback = this.config.swingLookback;     // Bars to confirm swing (3 for 15m)
    this.srTestCount = this.config.srTestCount;         // Times a level must be tested
    this.srZonePct = this.config.srZonePct;             // Zone width as % of price

    // Touch detection
    this.touchZonePct = this.config.touchZonePct;       // % distance to count as "touching"

    // Pattern persistence
    this.patternPersistBars = this.config.patternPersistBars;

    // 20 MA slope detection
    this.slopeLookback = this.config.slopeLookback;     // Compare current 20 MA to prior MA
    this.minSlopePct = this.config.minSlopePct;         // 20 MA must move to count as trending

    this.maxExtensionAtr = this.config.maxExtensionAtr;
    this.conditionFlags = this.config.conditionFlags;
    this.multipliers = this.config.multipliers;
    this.structural = this.config.structural;

    // State tracking
    this.swings = [];           // Array of { type: 'high'|'low', price, bar, wick }
    this.srLevels = [];         // Array of { price, tests, lastTest }
    this.pattern123 = null;     // Current 123 pattern state
    this.patternDetectedBar = 0;
    this.lastSignal = null;
    this.barCount = 0;

    // Structure-based cooldown: one trade per pullback
    this.inPullbackTaken = false;

    // NEW: Extension state tracking
    this._wasExtended = false;
    this._firstTouchAfterExtension = false;

    // Diagnostic counters
    this.diag = {
      trendBullish: 0,      // Now means "20 MA rising"
      trendBearish: 0,      // Now means "20 MA falling"
      trendFlat: 0,         // NEW: 20 MA flat (no trade)
      trendGateRejects: 0,
      extensionSkips: 0,    // NEW: Skipped due to extension
      extensionPenalties: 0,
      firstTouchSkips: 0,   // NEW: Skipped first touch after extension
      firstTouchPenalties: 0,
      pullbackCooldownPenalties: 0,
      patternUptrend: 0,
      patternDowntrend: 0,
      patternNull: 0,
      swingHighs: 0,
      swingLows: 0,
      emaTouches: 0,
      srAligned: 0,
      srMissing: 0,
      srWrongSide: 0,
      confirmBullish: 0,
      confirmBearish: 0,
      confirmationAligned: 0,
      confirmationMissing: 0,
      confirmationConflicts: 0,
      allAlignedLong: 0,
      allAlignedShort: 0,
      // Sanity check failures (after allAligned)
      rrCappedFail: 0,      // 200 MA cap killed R:R
      slInvalid: 0,         // SL >= price (long) or SL <= price (short)
      tpInvalid: 0,         // TP <= price (long) or TP >= price (short)
      rrTooLow: 0,          // actualRR < MIN_RR
      tpTooSmall: 0,        // tpDistance < MIN_TP_PCT
      structuralValid: 0,
      structuralInvalid: 0,
      signalsEmitted: 0     // Signals that passed ALL checks
    };

    this.configReceipt = {
      entryMaPeriod: this.entryMaPeriod,
      srMaPeriod: this.srMaPeriod,
      atrPeriod: this.atrPeriod,
      touchZonePct: this.touchZonePct,
      slopeLookback: this.slopeLookback,
      minSlopePct: this.minSlopePct,
      maxExtensionAtr: this.maxExtensionAtr,
      conditionFlags: this.conditionFlags,
      multipliers: this.multipliers,
      structural: this.structural
    };
    console.log(`[MADynamicSR][CONFIG] ${JSON.stringify(this.configReceipt)}`);
    console.log(`[MADynamicSR] initialized (Trader DNA CORRECTED) - Entry MA: ${this.entryMaPeriod}, S/R MA: ${this.srMaPeriod}`);
  }

  /**
   * Main update - call on each candle
   * REWRITTEN 2026-03-09: Corrected Trader DNA implementation
   */
  update(candle, priceHistory) {
    this.barCount++;

    // Detect swings early (only needs swingLookback * 2 + 1 = 7 candles)
    if (priceHistory && priceHistory.length >= this.swingLookback * 2 + 1) {
      this._detectSwings(priceHistory);
      this._updateSRLevels();
    }

    // Need enough history for 200 MA + slope lookback to generate signals
    const minBars = Math.max(this.entryMaPeriod, this.srMaPeriod) + this.slopeLookback + 20;
    if (!priceHistory || priceHistory.length < minBars) {
      return this._emptySignal();
    }

    const closes = priceHistory.map(x => c(x));
    const price = c(candle);
    const high = h(candle);
    const low = l(candle);

    // Calculate MAs
    const ma20 = this._ema(closes, this.entryMaPeriod);     // Entry + trend line
    const ma200 = this._ema(closes, this.srMaPeriod);       // S/R level (NOT trend gate)
    const atr = this._atr(priceHistory, this.atrPeriod);
    if (!ma20) return this._emptySignal();
    // ma200 can be null if not enough data — that's okay, we just skip S/R features

    const touchingMA = this._isTouchingEMA(price, ma20);
    if (touchingMA) this.diag.emaTouches++;

    const maSlope = this._getMaSlope(closes, this.entryMaPeriod);
    if (maSlope === 'rising') this.diag.trendBullish++;
    else if (maSlope === 'falling') this.diag.trendBearish++;
    else this.diag.trendFlat++;

    const extension = this._extensionInfo(price, ma20, atr);
    const wasExtendedBefore = this._wasExtended;
    if (extension.extended) {
      this._wasExtended = true;
      this.diag.extensionSkips++;
    }

    if (!touchingMA && this.inPullbackTaken) {
      this.inPullbackTaken = false;
    }

    const srAlignment = this._checkSRAlignment(ma20);
    if (srAlignment.aligned) this.diag.srAligned++;

    const confirmation = this._checkConfirmationCandle(candle, priceHistory);
    if (confirmation.bullish) this.diag.confirmBullish++;
    if (confirmation.bearish) this.diag.confirmBearish++;

    let direction = 'neutral';
    let confidence = 0;
    let reason = '';
    let confidenceProfile = this._emptyConfidenceProfile();
    let structural = null;

    if (touchingMA) {
      // Calculate touch quality (closer = higher confidence)
      const distancePct = Math.abs(price - ma20) / ma20 * 100;
      const touchQuality = clamp(1 - (distancePct / this.touchZonePct), 0, 1);  // 1.0 = perfect touch, 0 = edge of zone

      if (maSlope === 'rising') {
        direction = 'buy';
        reason = `MA Touch LONG: rising ${this.entryMaPeriod} EMA ($${ma20.toFixed(2)})`;
      } else if (maSlope === 'falling') {
        direction = 'sell';
        reason = `MA Touch SHORT: falling ${this.entryMaPeriod} EMA ($${ma20.toFixed(2)})`;
      } else {
        this.diag.trendGateRejects++;
        return this._emptySignal('trend_slope_flat', {
          touchingMA,
          maSlope,
          extension,
          srAlignment,
          confirmation
        });
      }

      confidence = this.config.baseConfidence + (touchQuality * this.config.touchQualityWeight);
      structural = this._structuralProfile(direction, price, ma20, atr);
      confidenceProfile = this._confidenceProfile({
        direction,
        maSlope,
        touchingMA,
        extension,
        wasExtendedBefore,
        srAlignment,
        confirmation,
        structural
      });
      confidence = clamp(confidence * confidenceProfile.composite, 0, this.config.maxConfidence);

      this.diag.signalsEmitted++;
      this.inPullbackTaken = true;
    }

    const signal = {
      module: 'MADynamicSR',
      direction,
      confidence,
      reason,
      touchingMA,
      levels: {
        ma20,
        ma200,
        atr,
        structural,
      },
      maSlope,
      trend: maSlope,
      extension,
      srAlignment,
      confirmation,
      confidenceProfile,
      conditionFlags: this.conditionFlags
    };

    this.lastSignal = signal;
    return signal;
  }

  /**
   * Detect swing highs and lows from price history
   */
  _detectSwings(priceHistory) {
    if (priceHistory.length < this.swingLookback * 2 + 1) return;

    const len = priceHistory.length;
    const lookback = this.swingLookback;

    // Check if we have a new swing high
    const midBar = len - 1 - lookback;
    if (midBar < lookback) return;

    const midCandle = priceHistory[midBar];
    const midHigh = h(midCandle);
    const midLow = l(midCandle);

    // Check for swing high
    let isSwingHigh = true;
    for (let i = midBar - lookback; i <= midBar + lookback; i++) {
      if (i === midBar) continue;
      if (h(priceHistory[i]) >= midHigh) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      const globalBar = this.barCount - lookback;  // Global bar number, not array index
      const existing = this.swings.find(s => s.bar === globalBar);
      if (!existing) {
        this.swings.push({
          type: 'high',
          price: c(midCandle),
          wick: midHigh,  // Use wick per Trader DNA
          bar: globalBar
        });
        this.diag.swingHighs++;
      }
    }

    // Check for swing low
    let isSwingLow = true;
    for (let i = midBar - lookback; i <= midBar + lookback; i++) {
      if (i === midBar) continue;
      if (l(priceHistory[i]) <= midLow) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      const globalBar = this.barCount - lookback;  // Global bar number, not array index
      const existing = this.swings.find(s => s.bar === globalBar);
      if (!existing) {
        this.swings.push({
          type: 'low',
          price: c(midCandle),
          wick: midLow,  // Use wick per Trader DNA
          bar: globalBar
        });
        this.diag.swingLows++;
      }
    }

    // Keep only last 50 swings
    if (this.swings.length > 50) {
      this.swings = this.swings.slice(-50);
    }
  }

  /**
   * Build S/R levels from swings - levels tested multiple times are stronger
   */
  _updateSRLevels() {
    if (this.swings.length < 2) return;

    // Group swings into zones
    const zonePct = this.srZonePct / 100;

    for (const swing of this.swings) {
      const price = swing.wick;  // Use wick

      // Check if this swing is near an existing level
      let foundLevel = null;
      for (const level of this.srLevels) {
        const diff = Math.abs(price - level.price) / level.price;
        if (diff <= zonePct) {
          foundLevel = level;
          break;
        }
      }

      if (foundLevel) {
        // Update existing level
        if (swing.bar > foundLevel.lastTest) {
          foundLevel.tests++;
          foundLevel.lastTest = swing.bar;
          // Adjust level to average (per Trader DNA - adjust to wicks)
          foundLevel.price = (foundLevel.price + price) / 2;
        }
      } else {
        // New level
        this.srLevels.push({
          price,
          tests: 1,
          lastTest: swing.bar,
          type: swing.type === 'high' ? 'resistance' : 'support'
        });
      }
    }

    // Keep only recent levels (last 20)
    this.srLevels = this.srLevels
      .sort((a, b) => b.lastTest - a.lastTest)
      .slice(0, 20);
  }

  /**
   * Detect 123 pattern - the core trend confirmation
   * Uptrend: Higher High AND Higher Low
   * Downtrend: Lower High AND Lower Low
   *
   * FIX: Pattern is CACHED - once confirmed, stays true until structure breaks
   * Uptrend stays until we get a Lower Low
   * Downtrend stays until we get a Higher High
   */
  _detect123Pattern() {
    // FIX: Get last 2 swing highs and last 2 swing lows INDEPENDENTLY
    // Old bug: slice(-6) then filter meant strong trends had <2 of one type
    const highs = this.swings.filter(s => s.type === 'high').slice(-2);
    const lows = this.swings.filter(s => s.type === 'low').slice(-2);

    if (highs.length < 2 || lows.length < 2) return this.pattern123;

    const [prevHigh, lastHigh] = highs;
    const [prevLow, lastLow] = lows;

    const higherHigh = lastHigh.wick > prevHigh.wick;
    const higherLow = lastLow.wick > prevLow.wick;
    const lowerHigh = lastHigh.wick < prevHigh.wick;
    const lowerLow = lastLow.wick < prevLow.wick;

    // Uptrend: Higher High + Higher Low (bullish structure)
    if (higherHigh && higherLow) {
      return 'uptrend';
    }
    // Downtrend: Lower High + Lower Low (bearish structure)
    if (lowerHigh && lowerLow) {
      return 'downtrend';
    }
    // Mixed structure (HH+LL or LH+HL) = no clear trend
    return null;
  }

  /**
   * Calculate 20 MA slope — is it trending or flat?
   * Trader DNA: "20 MA flat, moving through candles = useless, don't trade"
   *
   * @returns {'rising'|'falling'|'flat'}
   */
  _getMaSlope(closes, period) {
    if (closes.length < period + this.slopeLookback) return 'flat';

    const currentMa = this._ema(closes, period);

    // Calculate MA value from slopeLookback bars ago
    const olderCloses = closes.slice(0, closes.length - this.slopeLookback);
    const olderMa = this._ema(olderCloses, period);

    if (!currentMa || !olderMa || olderMa === 0) return 'flat';

    const slopePct = ((currentMa - olderMa) / olderMa) * 100;

    if (slopePct > this.minSlopePct) return 'rising';
    if (slopePct < -this.minSlopePct) return 'falling';
    return 'flat';
  }

  /**
   * Check if price is extended (too far) from the 20 MA
   * Trader DNA: "distance between price and 20 MA = extension = overbought"
   * "I would never be buying up here because we're super far away from the 20 MA"
   */
  _extensionInfo(price, ma20, atr) {
    const distance = Math.abs(price - ma20);
    const distancePct = ma20 ? (distance / ma20) * 100 : null;
    const extensionAtr = atr && atr > 0 ? distance / atr : null;
    const extended = Number.isFinite(extensionAtr)
      ? extensionAtr > this.maxExtensionAtr
      : false;
    return {
      extended,
      distance,
      distancePct,
      extensionAtr,
      maxExtensionAtr: this.maxExtensionAtr
    };
  }

  /**
   * Check if price is touching the 20 MA
   */
  _isTouchingEMA(price, ema) {
    const distance = Math.abs(price - ema) / ema * 100;
    return distance <= this.touchZonePct;
  }

  _emptyConfidenceProfile() {
    return {
      composite: 1,
      components: {
        trendGate: {
          enabled: this.conditionFlags.trendGate,
          fired: false,
          hardCondition: true,
          multiplier: 1
        },
        extension: { enabled: this.conditionFlags.extension, fired: false, multiplier: 1 },
        firstTouchAfterParabolic: { enabled: this.conditionFlags.firstTouchAfterParabolic, fired: false, multiplier: 1 },
        pullbackCooldown: { enabled: this.conditionFlags.pullbackCooldown, fired: false, multiplier: 1 },
        confirmationCandle: { enabled: this.conditionFlags.confirmationCandle, fired: false, multiplier: 1 },
        srAlignment: { enabled: this.conditionFlags.srAlignment, fired: false, multiplier: 1 },
        structuralValidity: { enabled: this.conditionFlags.structuralValidity, fired: false, multiplier: 1 }
      }
    };
  }

  _confidenceProfile({
    direction,
    maSlope,
    touchingMA,
    extension,
    wasExtendedBefore,
    srAlignment,
    confirmation,
    structural
  }) {
    const profile = this._emptyConfidenceProfile();
    profile.components.trendGate = {
      enabled: this.conditionFlags.trendGate,
      fired: this.conditionFlags.trendGate,
      hardCondition: true,
      passed: maSlope === 'rising' || maSlope === 'falling',
      maSlope,
      direction,
      multiplier: 1
    };

    if (this.conditionFlags.extension && extension.extended) {
      const overshoot = Math.max(0, extension.extensionAtr - this.maxExtensionAtr);
      const multiplier = clamp(
        1 - (overshoot * this.multipliers.extensionPenaltyScale),
        this.multipliers.extensionMin,
        1
      );
      profile.components.extension = {
        enabled: true,
        fired: true,
        multiplier,
        extensionAtr: extension.extensionAtr,
        maxExtensionAtr: this.maxExtensionAtr
      };
      this.diag.extensionPenalties++;
    }

    if (this.conditionFlags.firstTouchAfterParabolic && wasExtendedBefore && touchingMA) {
      profile.components.firstTouchAfterParabolic = {
        enabled: true,
        fired: true,
        multiplier: this.multipliers.firstTouchAfterParabolic
      };
      this._firstTouchAfterExtension = true;
      this._wasExtended = false;
      this.diag.firstTouchSkips++;
      this.diag.firstTouchPenalties++;
    } else if (touchingMA && this._firstTouchAfterExtension) {
      this._firstTouchAfterExtension = false;
    }

    if (this.conditionFlags.pullbackCooldown && touchingMA && this.inPullbackTaken) {
      profile.components.pullbackCooldown = {
        enabled: true,
        fired: true,
        multiplier: this.multipliers.pullbackCooldown
      };
      this.diag.pullbackCooldownPenalties++;
    }

    if (this.conditionFlags.confirmationCandle) {
      const aligned = direction === 'buy' ? confirmation.bullish : confirmation.bearish;
      const conflicted = direction === 'buy' ? confirmation.bearish : confirmation.bullish;
      if (aligned) {
        profile.components.confirmationCandle = {
          enabled: true,
          fired: true,
          state: 'aligned',
          pattern: confirmation.pattern,
          multiplier: this.multipliers.confirmationAligned
        };
        this.diag.confirmationAligned++;
      } else if (conflicted) {
        profile.components.confirmationCandle = {
          enabled: true,
          fired: true,
          state: 'conflict',
          pattern: confirmation.pattern,
          multiplier: this.multipliers.confirmationConflict
        };
        this.diag.confirmationConflicts++;
      } else {
        profile.components.confirmationCandle = {
          enabled: true,
          fired: false,
          state: 'missing',
          pattern: confirmation.pattern,
          multiplier: this.multipliers.confirmationMissing
        };
        this.diag.confirmationMissing++;
      }
    }

    if (this.conditionFlags.srAlignment) {
      const correctType = direction === 'buy' ? 'support' : 'resistance';
      if (srAlignment.aligned && srAlignment.type === correctType) {
        profile.components.srAlignment = {
          enabled: true,
          fired: true,
          state: 'aligned',
          multiplier: this.multipliers.srAligned,
          level: srAlignment
        };
      } else if (srAlignment.aligned) {
        profile.components.srAlignment = {
          enabled: true,
          fired: true,
          state: 'wrong_side',
          multiplier: this.multipliers.srWrongSide,
          level: srAlignment
        };
        this.diag.srWrongSide++;
      } else {
        profile.components.srAlignment = {
          enabled: true,
          fired: false,
          state: 'missing',
          multiplier: this.multipliers.srMissing,
          level: srAlignment
        };
        this.diag.srMissing++;
      }
    }

    if (this.conditionFlags.structuralValidity) {
      if (structural.valid) {
        profile.components.structuralValidity = {
          enabled: true,
          fired: true,
          state: 'valid',
          multiplier: this.multipliers.structuralValid,
          structural
        };
        this.diag.structuralValid++;
      } else {
        profile.components.structuralValidity = {
          enabled: true,
          fired: true,
          state: structural.failure,
          multiplier: this.multipliers.structuralInvalid,
          structural
        };
        this.diag.structuralInvalid++;
      }
    }

    profile.composite = Object.values(profile.components)
      .reduce((product, component) => product * component.multiplier, 1);
    return profile;
  }

  _structuralProfile(direction, price, ma20, atr) {
    const atrBuffer = atr && atr > 0 ? atr * this.structural.atrBufferMultiplier : price * 0.01;
    let stopLoss;
    let takeProfit;
    let risk;
    if (direction === 'buy') {
      stopLoss = ma20 - atrBuffer;
      risk = price - stopLoss;
      takeProfit = price + (risk * this.structural.rewardRiskTarget);
      if (stopLoss >= price) {
        this.diag.slInvalid++;
        return { valid: false, failure: 'sl_invalid', stopLoss, takeProfit, risk };
      }
      if (takeProfit <= price) {
        this.diag.tpInvalid++;
        return { valid: false, failure: 'tp_invalid', stopLoss, takeProfit, risk };
      }
      const tpDistance = (takeProfit - price) / price;
      const actualRR = risk > 0 ? (takeProfit - price) / risk : 0;
      if (actualRR < this.structural.minRewardRisk) {
        this.diag.rrTooLow++;
        return { valid: false, failure: 'rr_too_low', stopLoss, takeProfit, risk, actualRR, tpDistance };
      }
      if (tpDistance < this.structural.minTakeProfitPct) {
        this.diag.tpTooSmall++;
        return { valid: false, failure: 'tp_too_small', stopLoss, takeProfit, risk, actualRR, tpDistance };
      }
      return { valid: true, stopLoss, takeProfit, risk, actualRR, tpDistance };
    }

    stopLoss = ma20 + atrBuffer;
    risk = stopLoss - price;
    takeProfit = price - (risk * this.structural.rewardRiskTarget);
    if (stopLoss <= price) {
      this.diag.slInvalid++;
      return { valid: false, failure: 'sl_invalid', stopLoss, takeProfit, risk };
    }
    if (takeProfit >= price) {
      this.diag.tpInvalid++;
      return { valid: false, failure: 'tp_invalid', stopLoss, takeProfit, risk };
    }
    const tpDistance = (price - takeProfit) / price;
    const actualRR = risk > 0 ? (price - takeProfit) / risk : 0;
    if (actualRR < this.structural.minRewardRisk) {
      this.diag.rrTooLow++;
      return { valid: false, failure: 'rr_too_low', stopLoss, takeProfit, risk, actualRR, tpDistance };
    }
    if (tpDistance < this.structural.minTakeProfitPct) {
      this.diag.tpTooSmall++;
      return { valid: false, failure: 'tp_too_small', stopLoss, takeProfit, risk, actualRR, tpDistance };
    }
    return { valid: true, stopLoss, takeProfit, risk, actualRR, tpDistance };
  }

  /**
   * Check if EMA aligns with a previously tested S/R level
   */
  _checkSRAlignment(ema) {
    const zonePct = this.srZonePct / 100;

    for (const level of this.srLevels) {
      if (level.tests < this.srTestCount) continue;  // Must be tested multiple times

      const diff = Math.abs(ema - level.price) / level.price;
      if (diff <= zonePct) {
        return {
          aligned: true,
          type: level.type,
          price: level.price,
          tests: level.tests
        };
      }
    }

    return { aligned: false, type: null, price: null, tests: 0 };
  }

  /**
   * Check for confirmation candlestick patterns
   */
  _checkConfirmationCandle(candle, priceHistory) {
    const open = o(candle);
    const close = c(candle);
    const high = h(candle);
    const low = l(candle);

    const body = Math.abs(close - open);
    const range = high - low;
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;

    const result = {
      bullish: false,
      bearish: false,
      pattern: 'none',
      strength: 0
    };

    if (range === 0) return result;

    // Hammer (bullish) - small body, long lower wick, little upper wick
    if (close > open && lowerWick >= body * 2 && upperWick <= body * 0.5) {
      result.bullish = true;
      result.pattern = 'hammer';
      result.strength = Math.min(1, lowerWick / range);
    }
    // Inverted Hammer / Shooting Star (bearish) - small body, long upper wick
    else if (close < open && upperWick >= body * 2 && lowerWick <= body * 0.5) {
      result.bearish = true;
      result.pattern = 'shooting_star';
      result.strength = Math.min(1, upperWick / range);
    }
    // Bullish Engulfing
    else if (priceHistory.length >= 2) {
      const prev = priceHistory[priceHistory.length - 2];
      const prevOpen = o(prev);
      const prevClose = c(prev);

      if (prevClose < prevOpen && close > open &&
          close > prevOpen && open < prevClose) {
        result.bullish = true;
        result.pattern = 'bullish_engulfing';
        result.strength = body / range;
      }
      // Bearish Engulfing
      else if (prevClose > prevOpen && close < open &&
               close < prevOpen && open > prevClose) {
        result.bearish = true;
        result.pattern = 'bearish_engulfing';
        result.strength = body / range;
      }
    }

    // Strong bullish candle (big green body)
    if (!result.bullish && close > open && body / range > 0.6) {
      result.bullish = true;
      result.pattern = 'strong_bullish';
      result.strength = body / range * 0.8;
    }
    // Strong bearish candle (big red body)
    if (!result.bearish && close < open && body / range > 0.6) {
      result.bearish = true;
      result.pattern = 'strong_bearish';
      result.strength = body / range * 0.8;
    }

    return result;
  }

  /**
   * Calculate EMA
   */
  _ema(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  /**
   * Calculate SMA
   */
  _sma(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  _atr(priceHistory, period) {
    if (priceHistory.length < period + 1) return null;
    let trSum = 0;
    for (let i = priceHistory.length - period; i < priceHistory.length; i++) {
      const curr = priceHistory[i];
      const prev = priceHistory[i - 1];
      const tr = Math.max(
        h(curr) - l(curr),
        Math.abs(h(curr) - c(prev)),
        Math.abs(l(curr) - c(prev))
      );
      trSum += tr;
    }
    return trSum / period;
  }

  _emptySignal(reason = 'insufficient_data', context = {}) {
    return {
      module: 'MADynamicSR',
      direction: 'neutral',
      confidence: 0,
      reason,
      pattern: null,
      touchingEMA: false,
      srAlignment: context.srAlignment || { aligned: false },
      confirmation: context.confirmation || { bullish: false, bearish: false },
      levels: {},
      trend: context.maSlope || null,
      maSlope: context.maSlope || null,
      extension: context.extension || null,
      confidenceProfile: this._emptyConfidenceProfile(),
      conditionFlags: this.conditionFlags
    };
  }

  getSnapshot() {
    return {
      swings: this.swings.slice(-10),
      srLevels: this.srLevels,
      lastSignal: this.lastSignal,
      diagnostics: this.diag
    };
  }

  printDiagnostics() {
    const d = this.diag;
    const totalAligned = d.allAlignedLong + d.allAlignedShort;
    const totalFiltered = d.rrCappedFail + d.slInvalid + d.tpInvalid + d.rrTooLow + d.tpTooSmall;
    console.log('\n===== MADynamicSR DIAGNOSTICS =====');
    console.log(`Total bars processed: ${this.barCount}`);
    console.log(`Swings detected: ${d.swingHighs} highs, ${d.swingLows} lows`);
    console.log(`20 MA slope: ${d.trendBullish} rising, ${d.trendBearish} falling, ${d.trendFlat} flat`);
    console.log(`Extension skips: ${d.extensionSkips} (too far from 20 MA)`);
    console.log(`First-touch skips: ${d.firstTouchSkips} (after extension)`);
    console.log(`123 pattern: ${d.patternUptrend} up, ${d.patternDowntrend} down, ${d.patternNull} null`);
    console.log(`Entry EMA touch: ${d.emaTouches} times`);
    console.log(`S/R aligned: ${d.srAligned} times`);
    console.log(`Confirm candle: ${d.confirmBullish} bullish, ${d.confirmBearish} bearish`);
    console.log(`ALL ALIGNED: ${d.allAlignedLong} long, ${d.allAlignedShort} short (${totalAligned} total)`);
    console.log(`--- POST-ALIGN FILTERS (${totalFiltered} rejected) ---`);
    console.log(`  200 MA cap killed R:R: ${d.rrCappedFail}`);
    console.log(`  SL invalid (wrong side): ${d.slInvalid}`);
    console.log(`  TP invalid (wrong side): ${d.tpInvalid}`);
    console.log(`  R:R too low (<1.5): ${d.rrTooLow}`);
    console.log(`  TP too small (<0.7%): ${d.tpTooSmall}`);
    console.log(`SIGNALS EMITTED: ${d.signalsEmitted}`);
    console.log('====================================\n');
  }

  destroy() {
    this.swings = [];
    this.srLevels = [];
    this.lastSignal = null;
  }
}

module.exports = MADynamicSR;
