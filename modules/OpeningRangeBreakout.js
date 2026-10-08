// modules/OpeningRangeBreakout.js
'use strict';

const { c: _c, o: _o, h: _h, l: _l, v: _v, t: _t } = require('../core/CandleHelper');
const FairValueGapDetector = require('./FairValueGapDetector');

/**
 * OpeningRangeBreakout (ORB) Strategy
 *
 * Implements Trey's ICT-style Opening Range + FVG entry system.
 * This is a SESSION-BASED strategy that tracks state across candles.
 *
 * STATE MACHINE:
 * 1. WAITING_FOR_OPEN → Wait for session open
 * 2. COLLECTING_OR → Accumulate high/low across the configured opening window
 * 3. WATCHING_FOR_BREAK → OR defined. Watch for breakout (close beyond OR high/low)
 * 4. WATCHING_FOR_FVG → Breakout detected. Scan for FVG in breakout direction
 * 5. SIGNAL_READY → FVG found. Return signal with LIMIT entry hint
 * 6. DONE → Signal consumed. Wait for next session
 *
 * Source: ogz-meta/ledger/opening-range-fvg-spec.md
 *
 * @module modules/OpeningRangeBreakout
 */

const STATES = {
  WAITING_FOR_OPEN: 'WAITING_FOR_OPEN',
  COLLECTING_OR: 'COLLECTING_OR',
  WATCHING_FOR_BREAK: 'WATCHING_FOR_BREAK',
  WATCHING_FOR_FVG: 'WATCHING_FOR_FVG',
  SIGNAL_READY: 'SIGNAL_READY',
  DONE: 'DONE',
};

const REQUIRED_CONFIG_KEYS = Object.freeze([
  'sessionOpenHourUTC',
  'sessionOpenET',
  'sessionTimeZone',
  'orDurationMinutes',
  'orMinWidthAtr',
  'fvgScanBars',
  'minFVGPercent',
  'maxFVGPercent',
  'entryLevel',
]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function requiredRaw(config, key, owner = 'strategies.OpeningRangeBreakout') {
  if (!hasOwn(config, key)) {
    throw new Error(`[ORB] ${owner}.${key} is required`);
  }
  return config[key];
}

function requiredNumber(config, key, { min = 0, exclusiveMin = false, owner } = {}) {
  const raw = requiredRaw(config, key, owner);
  const value = Number(raw);
  const belowMin = exclusiveMin ? value <= min : value < min;
  if (!Number.isFinite(value) || belowMin) {
    const comparator = exclusiveMin ? `greater than ${min}` : `at least ${min}`;
    throw new Error(`[ORB] ${owner || 'strategies.OpeningRangeBreakout'}.${key} must be a finite number ${comparator}; got ${raw}`);
  }
  return value;
}

function requiredString(config, key, { allowBlank = false } = {}) {
  const raw = requiredRaw(config, key);
  if (raw === null && allowBlank) return '';
  if (typeof raw !== 'string') {
    throw new Error(`[ORB] strategies.OpeningRangeBreakout.${key} must be a string`);
  }
  const value = raw.trim();
  if (!value && !allowBlank) {
    throw new Error(`[ORB] strategies.OpeningRangeBreakout.${key} cannot be blank`);
  }
  return value;
}

function resolveConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('[ORB] strategies.OpeningRangeBreakout config object is required');
  }
  for (const key of REQUIRED_CONFIG_KEYS) {
    requiredRaw(config, key);
  }
  return config;
}

class OpeningRangeBreakout {
  constructor(entryConfigProvider, exitConfigProvider) {
    this.entryConfigProvider = entryConfigProvider;
    this.exitConfigProvider = exitConfigProvider;
    const orbConfig = resolveConfig(this.entryConfigProvider());
    const exitConfig = this.exitConfigProvider();

    this.sessionOpenHourUTC = requiredNumber(orbConfig, 'sessionOpenHourUTC', { min: 0 });
    // 2026-05-04: NYSE 9:30 ET session detection. Handles DST automatically via Intl
    // (Intl.DateTimeFormat returns 13:30 UTC during EDT, 14:30 UTC during EST).
    // When sessionOpenET is set (e.g. '09:30'), it takes precedence over sessionOpenHourUTC.
    this.sessionOpenET = requiredString(orbConfig, 'sessionOpenET', { allowBlank: true });
    this.sessionTimeZone = requiredString(orbConfig, 'sessionTimeZone');
    if (this.sessionOpenET) {
      const [h, m] = this.sessionOpenET.split(':').map(s => parseInt(s, 10));
      if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        throw new Error(`[ORB] strategies.OpeningRangeBreakout.sessionOpenET must be HH:MM; got ${this.sessionOpenET}`);
      }
      this.sessionOpenHourET = h;
      this.sessionOpenMinuteET = m;
      this._etTimeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: this.sessionTimeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    this.orDurationMinutes = requiredNumber(orbConfig, 'orDurationMinutes', { min: 0, exclusiveMin: true });
    this.orMinWidthAtr = requiredNumber(orbConfig, 'orMinWidthAtr', { min: 0 });
    this.fvgScanBars = requiredNumber(orbConfig, 'fvgScanBars', { min: 0, exclusiveMin: true });
    this.minFVGPercent = requiredNumber(orbConfig, 'minFVGPercent', { min: 0 });
    this.maxFVGPercent = requiredNumber(orbConfig, 'maxFVGPercent', { min: 0, exclusiveMin: true });
    if (this.maxFVGPercent < this.minFVGPercent) {
      throw new Error('[ORB] strategies.OpeningRangeBreakout.maxFVGPercent must be >= minFVGPercent');
    }
    this.entryLevel = requiredString(orbConfig, 'entryLevel'); // 'top', 'middle', 'bottom'
    if (!['top', 'middle', 'bottom'].includes(this.entryLevel)) {
      throw new Error(`[ORB] strategies.OpeningRangeBreakout.entryLevel must be top, middle, or bottom; got ${this.entryLevel}`);
    }
    this.stopBufferPct = requiredNumber(exitConfig, 'stopBufferPct', { min: 0, owner: 'exitContracts.OpeningRangeBreakout' });
    this.targetRR = requiredNumber(exitConfig, 'targetRR', { min: 0, exclusiveMin: true, owner: 'exitContracts.OpeningRangeBreakout' });
    this.exitConfig = exitConfig;

    // State
    this.state = STATES.WAITING_FOR_OPEN;
    this.currentSessionDate = null;
    this.openingRange = null;     // { high, low, timestamp }
    this.orWindowStartMs = null;
    this.orWindowEndMs = null;
    this.breakoutDirection = null; // 'bullish' or 'bearish'
    this.pendingSignal = null;
    this.recentCandles = [];      // Rolling buffer for FVG scan
    this.fvgScanCandles = [];
    this.barsSinceBreakout = 0;

    // FVG detector instance
    this.fvgDetector = new FairValueGapDetector({
      minFVGPercent: this.minFVGPercent,
      maxFVGPercent: this.maxFVGPercent,
    });

    const sessionStr = this.sessionOpenET
      ? `${this.sessionOpenET} ${this.sessionTimeZone}`
      : `${this.sessionOpenHourUTC}:00 UTC`;
    console.log(`[ORB] Initialized: session=${sessionStr}, OR=${this.orDurationMinutes}min, entry=${this.entryLevel}`);
  }

  /**
   * Reset for new session
   */
  reset() {
    this.state = STATES.WAITING_FOR_OPEN;
    this.openingRange = null;
    this.orWindowStartMs = null;
    this.orWindowEndMs = null;
    this.breakoutDirection = null;
    this.pendingSignal = null;
    this.recentCandles = [];
    this.fvgScanCandles = [];
    this.barsSinceBreakout = 0;
  }

  /**
   * Main update - feed each new candle through the state machine.
   *
   * @param {Object} candle - OHLCV candle { o, h, l, c, v, t }
   * @returns {Object|null} Signal if ready, null otherwise
   */
  update(candle) { return this._update(candle, true); }

  observe(candle) { return this._update(candle, false); }

  _update(candle, emitEntries) {
    if (!candle || !_t(candle)) return null;

    const timestamp = _t(candle);
    const candleDate = new Date(timestamp);
    const currentConfig = this.entryConfigProvider();
    const currentExitConfig = this.exitConfigProvider();
    const sessionDate = this._getSessionDate(candleDate);

    // New session? Reset state machine
    if (sessionDate !== this.currentSessionDate) {
      this.reset();
      this._applySessionConfig(currentConfig);
      this.currentSessionDate = this._getSessionDate(candleDate);
    }
    this._applyLiveConfig(currentConfig, currentExitConfig);

    // Track recent candles for FVG scanning
    this.recentCandles.push(candle);
    if (this.recentCandles.length > this.fvgScanBars + 5) {
      this.recentCandles.shift();
    }

    // State machine dispatch
    switch (this.state) {
      case STATES.WAITING_FOR_OPEN:
        return this._handleWaitingForOpen(candle, candleDate);

      case STATES.COLLECTING_OR:
        return this._handleCollectingOpeningRange(candle, candleDate, emitEntries);

      case STATES.WATCHING_FOR_BREAK:
        return this._handleWatchingForBreak(candle, emitEntries);

      case STATES.WATCHING_FOR_FVG:
        return this._handleWatchingForFVG(candle, emitEntries);

      case STATES.SIGNAL_READY:
        // Signal already pending - return it
        return emitEntries ? this.pendingSignal : null;

      case STATES.DONE:
        // Wait for next session
        return null;

      default:
        return null;
    }
  }

  /**
   * Check if this candle marks the session open.
   * @private
   */
  _handleWaitingForOpen(candle, candleDate) {
    if (this._isInsideOpeningRangeWindow(candleDate)) {
      this._startOpeningRange(candle, candleDate);
    }

    return null;
  }

  _applySessionConfig(config) {
    this.sessionOpenHourUTC = Number(config.sessionOpenHourUTC);
    this.sessionOpenET = config.sessionOpenET.trim();
    this.sessionTimeZone = config.sessionTimeZone.trim();
    this.orDurationMinutes = Number(config.orDurationMinutes);
    this._etDateFmt = null;
    if (this.sessionOpenET) {
      const [hour, minute] = this.sessionOpenET.split(':').map(value => parseInt(value, 10));
      this.sessionOpenHourET = hour;
      this.sessionOpenMinuteET = minute;
      this._etTimeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: this.sessionTimeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } else {
      this.sessionOpenHourET = null;
      this.sessionOpenMinuteET = null;
      this._etTimeFmt = null;
    }
  }

  _applyLiveConfig(config, exitConfig) {
    this.orMinWidthAtr = Number(config.orMinWidthAtr);
    this.fvgScanBars = Number(config.fvgScanBars);
    this.minFVGPercent = Number(config.minFVGPercent);
    this.maxFVGPercent = Number(config.maxFVGPercent);
    this.entryLevel = config.entryLevel;
    this.stopBufferPct = Number(exitConfig.stopBufferPct);
    this.targetRR = Number(exitConfig.targetRR);
    this.exitConfig = exitConfig;
    this.fvgDetector.configure({
      minFVGPercent: this.minFVGPercent,
      maxFVGPercent: this.maxFVGPercent,
    });
  }

  /**
   * Accumulate the configured opening window before breakout logic can run.
   * @private
   */
  _handleCollectingOpeningRange(candle, candleDate, emitEntries) {
    if (this._isInsideOpeningRangeWindow(candleDate)) {
      this._extendOpeningRange(candle);
      return null;
    }

    if (!this._finalizeOpeningRange()) {
      return null;
    }

    return this._handleWatchingForBreak(candle, emitEntries);
  }

  _startOpeningRange(candle, candleDate) {
    const clockMinutes = this._getSessionClockMinutes(candleDate);
    const openMinutes = this._getSessionOpenMinutes();
    const elapsedMinutes = Math.max(0, clockMinutes - openMinutes);

    this.orWindowStartMs = _t(candle) - (elapsedMinutes * 60 * 1000);
    this.orWindowEndMs = this.orWindowStartMs + (this.orDurationMinutes * 60 * 1000);
    this.openingRange = {
      high: _h(candle),
      low: _l(candle),
      timestamp: _t(candle),
      windowStart: this.orWindowStartMs,
      windowEnd: this.orWindowEndMs,
      width: _h(candle) - _l(candle),
    };
    this.state = STATES.COLLECTING_OR;
    console.log(`[ORB] Opening Range collection started: high=${this.openingRange.high.toFixed(2)}, low=${this.openingRange.low.toFixed(2)}`);
  }

  _extendOpeningRange(candle) {
    if (!this.openingRange) return;

    this.openingRange.high = Math.max(this.openingRange.high, _h(candle));
    this.openingRange.low = Math.min(this.openingRange.low, _l(candle));
    this.openingRange.timestamp = _t(candle);
    this.openingRange.width = this.openingRange.high - this.openingRange.low;
  }

  _finalizeOpeningRange() {
    if (!this.openingRange) return false;

    this.openingRange.width = this.openingRange.high - this.openingRange.low;
    if (!this._passesOpeningRangeWidthFilter()) {
      this.state = STATES.DONE;
      console.log(`[ORB] Opening Range width ${this.openingRange.width.toFixed(2)} failed ${this.orMinWidthAtr}x ATR width filter. Session done.`);
      return false;
    }

    this.state = STATES.WATCHING_FOR_BREAK;
    console.log(`[ORB] Opening Range set: high=${this.openingRange.high.toFixed(2)}, low=${this.openingRange.low.toFixed(2)}, width=${this.openingRange.width.toFixed(2)}`);
    return true;
  }

  _passesOpeningRangeWidthFilter() {
    if (this.orMinWidthAtr <= 0) return true;

    const ranges = this.recentCandles
      .map(candle => _h(candle) - _l(candle))
      .filter(value => Number.isFinite(value) && value > 0);
    if (!ranges.length) return false;

    const meanRange = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
    return this.openingRange.width >= meanRange * this.orMinWidthAtr;
  }

  _getSessionClockMinutes(candleDate) {
    if (this.sessionOpenET) {
      const parts = this._etTimeFmt.formatToParts(candleDate);
      const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
      const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
      return (hour * 60) + minute;
    }
    return (candleDate.getUTCHours() * 60) + candleDate.getUTCMinutes();
  }

  _getSessionOpenMinutes() {
    const targetHour = this.sessionOpenET ? this.sessionOpenHourET : this.sessionOpenHourUTC;
    const targetMinute = this.sessionOpenET ? this.sessionOpenMinuteET : 0;
    return (targetHour * 60) + targetMinute;
  }

  _isInsideOpeningRangeWindow(candleDate) {
    const clockMinutes = this._getSessionClockMinutes(candleDate);
    const openMinutes = this._getSessionOpenMinutes();
    return clockMinutes >= openMinutes && clockMinutes < openMinutes + this.orDurationMinutes;
  }

  /**
   * Watch for price to close beyond OR high/low.
   * @private
   */
  _handleWatchingForBreak(candle, emitEntries) {
    if (!this.openingRange) return null;

    const close = _c(candle);

    // Bullish breakout: close above OR high
    if (close > this.openingRange.high) {
      this.breakoutDirection = 'bullish';
      this.state = STATES.WATCHING_FOR_FVG;
      this.fvgScanCandles = [candle];
      this.barsSinceBreakout = 0;
      console.log(`[ORB] BULLISH breakout! Close ${close.toFixed(2)} > OR high ${this.openingRange.high.toFixed(2)}`);
      // Immediately check for FVG in this bar
      return this._handleWatchingForFVG(candle, emitEntries);
    }

    // Bearish breakout: close below OR low
    if (close < this.openingRange.low) {
      this.breakoutDirection = 'bearish';
      this.state = STATES.WATCHING_FOR_FVG;
      this.fvgScanCandles = [candle];
      this.barsSinceBreakout = 0;
      console.log(`[ORB] BEARISH breakout! Close ${close.toFixed(2)} < OR low ${this.openingRange.low.toFixed(2)}`);
      return this._handleWatchingForFVG(candle, emitEntries);
    }

    return null;
  }

  /**
   * Scan for FVG in breakout direction.
   * @private
   */
  _handleWatchingForFVG(candle, emitEntries) {
    if (!this.breakoutDirection) return null;

    if (this.fvgScanCandles[this.fvgScanCandles.length - 1] !== candle) {
      this.fvgScanCandles.push(candle);
    }
    this.barsSinceBreakout += 1;
    if (this.fvgScanCandles.length < 3) return null;

    // Look for FVG in the direction of breakout
    const fvg = this.fvgDetector.detect(this.fvgScanCandles, this.breakoutDirection);

    if (fvg && emitEntries) {
      // Found FVG! Generate signal
      const signal = this._generateSignal(fvg, candle);
      if (!signal) {
        this.pendingSignal = null;
        this.state = STATES.DONE;
        return null;
      }
      this.pendingSignal = signal;
      this.state = STATES.SIGNAL_READY;
      console.log(`[ORB] FVG found: ${fvg.direction} gap ${fvg.gapLow.toFixed(2)}-${fvg.gapHigh.toFixed(2)}`);
      return signal;
    }

    // Check scan limit
    if (this.barsSinceBreakout >= this.fvgScanBars) {
      // No FVG found within window - session done
      this.state = STATES.DONE;
      console.log(`[ORB] FVG scan window ended after ${this.fvgScanBars} bars without an entry signal. Session done.`);
    }

    return null;
  }

  /**
   * Generate the trade signal from FVG.
   * @private
   */
  _generateSignal(fvg, currentCandle) {
    const levels = this.fvgDetector.calculateLevels(
      fvg,
      this.entryLevel,
      this.stopBufferPct,
      this.targetRR
    );
    if (!levels) {
      console.warn(`[ORB] Ignoring ${fvg.direction} FVG with invalid exit geometry`);
      this.state = STATES.DONE;
      return null;
    }

    return {
      strategy: 'OpeningRangeBreakout',
      direction: fvg.direction === 'bullish' ? 'buy' : 'sell',
      confidence: this._calculateConfidence(fvg),

      // Entry details
      entry: levels.entry,
      stop: levels.stop,
      target: levels.target,
      risk: levels.risk,

      // FVG zone for reference
      fvg: {
        gapHigh: fvg.gapHigh,
        gapLow: fvg.gapLow,
        midpoint: fvg.midpoint,
        gapPercent: fvg.gapPercent,
      },

      // Opening Range for reference
      openingRange: this.openingRange,

      // LIMIT order hint (don't market chase)
      orderType: 'LIMIT',
      limitPrice: levels.entry,

      // Exit contract hint for ExitContractManager
      exitContractHint: {
        strategyName: 'OpeningRangeBreakout',
        stopLossPercent: -Math.abs((levels.stop - levels.entry) / levels.entry * 100),
        takeProfitPercent: Math.abs((levels.target - levels.entry) / levels.entry * 100),
        trailingStopPercent: this.exitConfig.trailingStopPercent,
        trailingActivation: this.exitConfig.trailingActivation,
        maxHoldTimeMinutes: this.exitConfig.maxHoldTimeMinutes,
        invalidationConditions: this.exitConfig.invalidationConditions,
      },

      timestamp: _t(currentCandle),
      reason: `ORB ${fvg.direction} | OR ${this.openingRange.low.toFixed(0)}-${this.openingRange.high.toFixed(0)} | FVG ${fvg.gapLow.toFixed(0)}-${fvg.gapHigh.toFixed(0)}`,
    };
  }

  /**
   * Calculate confidence based on FVG quality and OR characteristics.
   * @private
   */
  _calculateConfidence(fvg) {
    let confidence = 0.50; // Base confidence

    // Boost for cleaner gaps (larger but not excessive)
    if (fvg.gapPercent >= 0.3 && fvg.gapPercent <= 1.0) {
      confidence += 0.15;
    } else if (fvg.gapPercent > 1.0 && fvg.gapPercent <= 1.5) {
      confidence += 0.10;
    }

    // Cap at 0.85 (nothing is certain)
    return Math.min(0.85, confidence);
  }

  /**
   * Consume the pending signal (called after trade execution).
   */
  consumeSignal() {
    this.pendingSignal = null;
    this.state = STATES.DONE;
  }

  /**
   * Get session date string (for tracking session boundaries).
   * @private
   */
  _getSessionDate(date) {
    if (this.sessionOpenET) {
      // ET-based session boundary — DST-aware via Intl. en-CA formats as YYYY-MM-DD.
      if (!this._etDateFmt) {
        this._etDateFmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: this.sessionTimeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      }
      return this._etDateFmt.format(date);
    }
    // Legacy UTC-based session boundary (crypto)
    const adjusted = new Date(date);
    if (adjusted.getUTCHours() < this.sessionOpenHourUTC) {
      adjusted.setUTCDate(adjusted.getUTCDate() - 1);
    }
    return adjusted.toISOString().slice(0, 10);
  }

  /**
   * Get current state for debugging/dashboard.
   */
  getState() {
    return {
      state: this.state,
      sessionDate: this.currentSessionDate,
      openingRange: this.openingRange,
      orWindowStartMs: this.orWindowStartMs,
      orWindowEndMs: this.orWindowEndMs,
      breakoutDirection: this.breakoutDirection,
      hasPendingSignal: !!this.pendingSignal,
      recentCandleCount: this.recentCandles.length,
      fvgScanCandleCount: this.fvgScanCandles.length,
      barsSinceBreakout: this.barsSinceBreakout,
    };
  }
}

module.exports = OpeningRangeBreakout;
