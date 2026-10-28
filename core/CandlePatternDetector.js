/**
 * CandlePatternDetector.js — Real Candlestick Pattern Recognition
 * 
 * 2026-02-12: Built from scratch to replace the fake "Learning Pattern" system.
 * Scans actual OHLCV candle data and identifies named chart patterns.
 * Returns pattern names that match the dashboard's SVG visualizations.
 * 
 * Detected patterns:
 *   Single candle:  hammer, shooting_star, doji, bullish_engulfing, bearish_engulfing
 *   Multi candle:   morning_star, evening_star, double_bottom, double_top
 *   Structure:      ascending_triangle, descending_triangle, head_shoulders, 
 *                   inverse_head_shoulders, flag, pennant, wedge
 */

'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');

const { c, o, h, l, v } = require('./CandleHelper');

class CandlePatternDetector {
  constructor() {
    this.detectedPatterns = [];
    this.lastDetection = null;
  }

  /**
   * Main entry: scan candles and return all detected patterns
   * @param {Array} candles - OHLCV candles [{o, h, l, c, v, t}, ...]
   * @param {Object} indicators - {rsi, trend, macd, volume}
   * @returns {Array} detected patterns [{name, confidence, direction, description}, ...]
   */
  detect(candles, indicators = {}) {
    if (!candles || candles.length < ConfigLoader.getInternalsFileValue('candlePatterns.history.minimumCandles')) return [];

    // Normalize candle format (handle both {o,h,l,c} and {open,high,low,close})
    const c = candles.map(candle => ({
      o: candle.o ?? candle.open ?? 0,
      h: candle.h ?? candle.high ?? 0,
      l: candle.l ?? candle.low ?? 0,
      c: candle.c ?? candle.close ?? 0,
      v: candle.v ?? candle.volume ?? 0,
      t: candle.t ?? candle.time ?? candle.timestamp ?? 0
    }));

    const patterns = [];

    // === SINGLE CANDLE PATTERNS (last 1-2 candles) ===
    if (c.length >= 2) {
      const curr = c[c.length - 1];
      const prev = c[c.length - 2];

      // Hammer (bullish reversal)
      const hammerResult = this._detectHammer(curr, prev, indicators);
      if (hammerResult) patterns.push(hammerResult);

      // Shooting Star (bearish reversal)
      const starResult = this._detectShootingStar(curr, prev, indicators);
      if (starResult) patterns.push(starResult);

      // Doji
      const dojiResult = this._detectDoji(curr);
      if (dojiResult) patterns.push(dojiResult);

      // Bullish Engulfing
      const bullEngulf = this._detectBullishEngulfing(curr, prev, indicators);
      if (bullEngulf) patterns.push(bullEngulf);

      // Bearish Engulfing
      const bearEngulf = this._detectBearishEngulfing(curr, prev, indicators);
      if (bearEngulf) patterns.push(bearEngulf);
    }

    // === THREE-CANDLE PATTERNS ===
    if (c.length >= 3) {
      const [a, b, curr] = c.slice(-3);

      const morningStar = this._detectMorningStar(a, b, curr);
      if (morningStar) patterns.push(morningStar);

      const eveningStar = this._detectEveningStar(a, b, curr);
      if (eveningStar) patterns.push(eveningStar);
    }

    // === MULTI-CANDLE STRUCTURE PATTERNS (need 20+ candles) ===
    if (c.length >= ConfigLoader.getInternalsFileValue('candlePatterns.history.structureMinimum')) {
      const recent = c.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.history.structureLookback')); // Use last 30 candles for structure

      const dblBottom = this._detectDoubleBottom(recent);
      if (dblBottom) patterns.push(dblBottom);

      const dblTop = this._detectDoubleTop(recent);
      if (dblTop) patterns.push(dblTop);

      const ascTri = this._detectAscendingTriangle(recent);
      if (ascTri) patterns.push(ascTri);

      const descTri = this._detectDescendingTriangle(recent);
      if (descTri) patterns.push(descTri);

      const hs = this._detectHeadShoulders(recent);
      if (hs) patterns.push(hs);

      const ihs = this._detectInverseHeadShoulders(recent);
      if (ihs) patterns.push(ihs);
    }

    if (c.length >= ConfigLoader.getInternalsFileValue('candlePatterns.history.continuationMinimum')) {
      const recent = c.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.history.continuationLookback'));

      const flag = this._detectFlag(recent);
      if (flag) patterns.push(flag);

      const wedge = this._detectWedge(recent);
      if (wedge) patterns.push(wedge);
    }

    // Sort by confidence descending
    patterns.sort((a, b) => b.confidence - a.confidence);

    this.detectedPatterns = patterns;
    this.lastDetection = Date.now();

    return patterns;
  }

  // ─── HELPERS ────────────────────────────────────────
  _bodySize(candle) { return Math.abs(c(candle) - o(candle)); }
  _range(candle) { return h(candle) - l(candle) || 0.001; }
  _isBullish(candle) { return c(candle) > o(candle); }
  _isBearish(candle) { return c(candle) < o(candle); }
  _upperWick(candle) { return h(candle) - Math.max(o(candle), c(candle)); }
  _lowerWick(candle) { return Math.min(o(candle), c(candle)) - l(candle); }
  _bodyRatio(candle) { return this._bodySize(candle) / this._range(candle); }
  _midpoint(candle) { return (o(candle) + c(candle)) / 2; }

  // ─── SINGLE CANDLE ─────────────────────────────────

  _detectHammer(curr, prev, indicators) {
    const body = this._bodySize(curr);
    const range = this._range(curr);
    const lowerWick = this._lowerWick(curr);
    const upperWick = this._upperWick(curr);

    // Hammer: small body at top, long lower wick (2x+ body), tiny upper wick
    if (lowerWick >= body * ConfigLoader.getInternalsFileValue('candlePatterns.single.hammerLongWick') && upperWick < body * ConfigLoader.getInternalsFileValue('candlePatterns.single.hammerShortWick') && body > range * ConfigLoader.getInternalsFileValue('candlePatterns.single.minimumBody')) {
      // More confident if in downtrend
      const trendBonus = (indicators.trend === 'downtrend' || indicators.trend === 'bearish') ? ConfigLoader.getInternalsFileValue('candlePatterns.single.trendBonus') : 0;
      const rsiBonus = (indicators.rsi && indicators.rsi < ConfigLoader.getInternalsFileValue('candlePatterns.single.hammerRsi')) ? ConfigLoader.getInternalsFileValue('candlePatterns.single.rsiBonus') : 0;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.single.baseConfidence') + trendBonus + rsiBonus + (lowerWick / range) * ConfigLoader.getInternalsFileValue('candlePatterns.single.wickConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.single.confidenceCap'));

      return {
        name: 'hammer',
        confidence: conf,
        direction: 'buy',
        description: `Hammer at $${c(curr).toFixed(2)} — lower wick ${(lowerWick/body).toFixed(1)}x body`
      };
    }
    return null;
  }

  _detectShootingStar(curr, prev, indicators) {
    const body = this._bodySize(curr);
    const range = this._range(curr);
    const upperWick = this._upperWick(curr);
    const lowerWick = this._lowerWick(curr);

    // Shooting star: small body at bottom, long upper wick, tiny lower wick
    if (upperWick >= body * ConfigLoader.getInternalsFileValue('candlePatterns.single.hammerLongWick') && lowerWick < body * ConfigLoader.getInternalsFileValue('candlePatterns.single.hammerShortWick') && body > range * ConfigLoader.getInternalsFileValue('candlePatterns.single.minimumBody')) {
      const trendBonus = (indicators.trend === 'uptrend' || indicators.trend === 'bullish') ? ConfigLoader.getInternalsFileValue('candlePatterns.single.trendBonus') : 0;
      const rsiBonus = (indicators.rsi && indicators.rsi > ConfigLoader.getInternalsFileValue('candlePatterns.single.shootingRsi')) ? ConfigLoader.getInternalsFileValue('candlePatterns.single.rsiBonus') : 0;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.single.baseConfidence') + trendBonus + rsiBonus + (upperWick / range) * ConfigLoader.getInternalsFileValue('candlePatterns.single.wickConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.single.confidenceCap'));

      return {
        name: 'shooting_star',
        confidence: conf,
        direction: 'sell',
        description: `Shooting star at $${c(curr).toFixed(2)} — upper wick ${(upperWick/body).toFixed(1)}x body`
      };
    }
    return null;
  }

  _detectDoji(curr) {
    const body = this._bodySize(curr);
    const range = this._range(curr);

    // Doji: body is less than 10% of range
    if (range > 0 && body / range < ConfigLoader.getInternalsFileValue('candlePatterns.single.dojiBodyRatio')) {
      return {
        name: 'doji',
        confidence: ConfigLoader.getInternalsFileValue('candlePatterns.single.dojiConfidence'),
        direction: 'neutral',
        description: `Doji at $${c(curr).toFixed(2)} — indecision, watch for breakout`
      };
    }
    return null;
  }

  _detectBullishEngulfing(curr, prev, indicators) {
    if (!this._isBullish(curr) || !this._isBearish(prev)) return null;

    const currBody = this._bodySize(curr);
    const prevBody = this._bodySize(prev);

    // Current green candle completely covers previous red candle
    if (o(curr) <= c(prev) && c(curr) >= o(prev) && currBody > prevBody * ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.bodyRatio')) {
      const ratio = currBody / prevBody;
      const trendBonus = (indicators.trend === 'downtrend' || indicators.trend === 'bearish') ? ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.trendBonus') : 0;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.baseConfidence') + Math.min(ratio * ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.ratioScale'), ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.ratioBonusCap')) + trendBonus, ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.confidenceCap'));

      return {
        name: 'bullish_engulfing',
        confidence: conf,
        direction: 'buy',
        description: `Bullish engulfing — green candle ${ratio.toFixed(1)}x previous red`
      };
    }
    return null;
  }

  _detectBearishEngulfing(curr, prev, indicators) {
    if (!this._isBearish(curr) || !this._isBullish(prev)) return null;

    const currBody = this._bodySize(curr);
    const prevBody = this._bodySize(prev);

    if (o(curr) >= c(prev) && c(curr) <= o(prev) && currBody > prevBody * ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.bodyRatio')) {
      const ratio = currBody / prevBody;
      const trendBonus = (indicators.trend === 'uptrend' || indicators.trend === 'bullish') ? ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.trendBonus') : 0;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.baseConfidence') + Math.min(ratio * ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.ratioScale'), ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.ratioBonusCap')) + trendBonus, ConfigLoader.getInternalsFileValue('candlePatterns.engulfing.confidenceCap'));

      return {
        name: 'bearish_engulfing',
        confidence: conf,
        direction: 'sell',
        description: `Bearish engulfing — red candle ${ratio.toFixed(1)}x previous green`
      };
    }
    return null;
  }

  // ─── THREE-CANDLE ──────────────────────────────────

  _detectMorningStar(a, b, curr) {
    // Day 1: large red, Day 2: small body (gap down ideal), Day 3: large green
    if (!this._isBearish(a)) return null;
    
    const aBody = this._bodySize(a);
    const bBody = this._bodySize(b);
    const cBody = this._bodySize(curr);

    if (bBody < aBody * ConfigLoader.getInternalsFileValue('candlePatterns.star.middleBodyRatio') && this._isBullish(curr) && cBody > aBody * ConfigLoader.getInternalsFileValue('candlePatterns.star.lastBodyRatio')) {
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.star.baseConfidence') + (cBody / aBody) * ConfigLoader.getInternalsFileValue('candlePatterns.star.bodyConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.star.confidenceCap'));
      return {
        name: 'morning_star',
        confidence: conf,
        direction: 'buy',
        description: 'Morning star — 3-candle bullish reversal forming'
      };
    }
    return null;
  }

  _detectEveningStar(a, b, curr) {
    if (!this._isBullish(a)) return null;

    const aBody = this._bodySize(a);
    const bBody = this._bodySize(b);
    const cBody = this._bodySize(curr);

    if (bBody < aBody * ConfigLoader.getInternalsFileValue('candlePatterns.star.middleBodyRatio') && this._isBearish(curr) && cBody > aBody * ConfigLoader.getInternalsFileValue('candlePatterns.star.lastBodyRatio')) {
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.star.baseConfidence') + (cBody / aBody) * ConfigLoader.getInternalsFileValue('candlePatterns.star.bodyConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.star.confidenceCap'));
      return {
        name: 'evening_star',
        confidence: conf,
        direction: 'sell',
        description: 'Evening star — 3-candle bearish reversal forming'
      };
    }
    return null;
  }

  // ─── STRUCTURE PATTERNS ────────────────────────────

  _detectDoubleBottom(candles) {
    const lows = candles.map(candle => l(candle));
    const highs = candles.map(candle => h(candle));
    const avgRange = (Math.max(...highs) - Math.min(...lows)) || 1;
    const tolerance = avgRange * ConfigLoader.getInternalsFileValue('candlePatterns.double.priceTolerance'); // 2% of range

    // Find two lowest points that are near each other in price but separated in time
    let minIdx1 = -1, minIdx2 = -1;
    let minVal = Infinity;
    
    // First trough
    for (let i = 2; i < candles.length - ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumSeparation'); i++) {
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        if (lows[i] < minVal) { minVal = lows[i]; minIdx1 = i; }
      }
    }
    if (minIdx1 < 0) return null;

    // Second trough (at least 5 candles apart)
    let min2Val = Infinity;
    for (let i = minIdx1 + ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumSeparation'); i < candles.length - 2; i++) {
      if (lows[i] < lows[i-1] && lows[i] < lows[i+1]) {
        if (Math.abs(lows[i] - minVal) < tolerance && lows[i] < min2Val) {
          min2Val = lows[i]; minIdx2 = i;
        }
      }
    }
    if (minIdx2 < 0) return null;

    // Check there's a peak between them
    const midHigh = Math.max(...highs.slice(minIdx1, minIdx2 + 1));
    const necklineDistance = midHigh - minVal;
    if (necklineDistance < avgRange * ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumNeckline')) return null;

    // Last candle should be recovering (above midpoint)
    const lastClose = c(candles[candles.length - 1]);
    if (lastClose < minVal + necklineDistance * ConfigLoader.getInternalsFileValue('candlePatterns.double.recoveryFraction')) return null;

    const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.double.baseConfidence') + (necklineDistance / avgRange) * ConfigLoader.getInternalsFileValue('candlePatterns.double.necklineConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.double.confidenceCap'));
    return {
      name: 'double_bottom',
      confidence: conf,
      direction: 'buy',
      description: `Double bottom at $${minVal.toFixed(2)} — support tested twice, recovery underway`
    };
  }

  _detectDoubleTop(candles) {
    const highs = candles.map(candle => h(candle));
    const lows = candles.map(candle => l(candle));
    const avgRange = (Math.max(...highs) - Math.min(...lows)) || 1;
    const tolerance = avgRange * ConfigLoader.getInternalsFileValue('candlePatterns.double.priceTolerance');

    let maxIdx1 = -1, maxIdx2 = -1;
    let maxVal = -Infinity;

    for (let i = 2; i < candles.length - ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumSeparation'); i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        if (highs[i] > maxVal) { maxVal = highs[i]; maxIdx1 = i; }
      }
    }
    if (maxIdx1 < 0) return null;

    let max2Val = -Infinity;
    for (let i = maxIdx1 + ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumSeparation'); i < candles.length - 2; i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i+1]) {
        if (Math.abs(highs[i] - maxVal) < tolerance && highs[i] > max2Val) {
          max2Val = highs[i]; maxIdx2 = i;
        }
      }
    }
    if (maxIdx2 < 0) return null;

    const midLow = Math.min(...lows.slice(maxIdx1, maxIdx2 + 1));
    const necklineDistance = maxVal - midLow;
    if (necklineDistance < avgRange * ConfigLoader.getInternalsFileValue('candlePatterns.double.minimumNeckline')) return null;

    const lastClose = c(candles[candles.length - 1]);
    if (lastClose > maxVal - necklineDistance * ConfigLoader.getInternalsFileValue('candlePatterns.double.recoveryFraction')) return null;

    const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.double.baseConfidence') + (necklineDistance / avgRange) * ConfigLoader.getInternalsFileValue('candlePatterns.double.necklineConfidenceScale'), ConfigLoader.getInternalsFileValue('candlePatterns.double.confidenceCap'));
    return {
      name: 'double_top',
      confidence: conf,
      direction: 'sell',
      description: `Double top at $${maxVal.toFixed(2)} — resistance rejected twice, decline likely`
    };
  }

  _detectAscendingTriangle(candles) {
    const highs = candles.map(candle => h(candle));
    const lows = candles.map(candle => l(candle));

    // Flat resistance (highs are consistent)
    const recentHighs = highs.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatLookback'));
    const highRange = Math.max(...recentHighs) - Math.min(...recentHighs);
    const avgPrice = c(candles[candles.length-1]);
    const relHighRange = highRange / avgPrice;

    // Rising lows
    const q1Lows = lows.slice(0, Math.floor(candles.length / 2));
    const q2Lows = lows.slice(Math.floor(candles.length / 2));
    const avgQ1Low = q1Lows.reduce((a,b) => a+b, 0) / q1Lows.length;
    const avgQ2Low = q2Lows.reduce((a,b) => a+b, 0) / q2Lows.length;

    // Flat top (< 1% range) + rising bottom
    if (relHighRange < ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatRange') && avgQ2Low > avgQ1Low * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.risingLowMultiplier')) {
      const slopeStrength = (avgQ2Low - avgQ1Low) / avgQ1Low;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.triangle.baseConfidence') + slopeStrength * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.slopeScale') + (ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatRange') - relHighRange) * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatnessScale'), ConfigLoader.getInternalsFileValue('candlePatterns.triangle.confidenceCap'));
      return {
        name: 'ascending_triangle',
        confidence: conf,
        direction: 'buy',
        description: `Ascending triangle — flat resistance, higher lows building pressure`
      };
    }
    return null;
  }

  _detectDescendingTriangle(candles) {
    const highs = candles.map(candle => h(candle));
    const lows = candles.map(candle => l(candle));

    const recentLows = lows.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatLookback'));
    const lowRange = Math.max(...recentLows) - Math.min(...recentLows);
    const avgPrice = c(candles[candles.length-1]);
    const relLowRange = lowRange / avgPrice;

    const q1Highs = highs.slice(0, Math.floor(candles.length / 2));
    const q2Highs = highs.slice(Math.floor(candles.length / 2));
    const avgQ1High = q1Highs.reduce((a,b) => a+b, 0) / q1Highs.length;
    const avgQ2High = q2Highs.reduce((a,b) => a+b, 0) / q2Highs.length;

    if (relLowRange < ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatRange') && avgQ2High < avgQ1High * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.fallingHighMultiplier')) {
      const slopeStrength = (avgQ1High - avgQ2High) / avgQ1High;
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.triangle.baseConfidence') + slopeStrength * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.slopeScale') + (ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatRange') - relLowRange) * ConfigLoader.getInternalsFileValue('candlePatterns.triangle.flatnessScale'), ConfigLoader.getInternalsFileValue('candlePatterns.triangle.confidenceCap'));
      return {
        name: 'descending_triangle',
        confidence: conf,
        direction: 'sell',
        description: `Descending triangle — flat support, lower highs increasing sell pressure`
      };
    }
    return null;
  }

  _detectHeadShoulders(candles) {
    // Find 3 peaks: left shoulder, head (highest), right shoulder
    const highs = candles.map(candle => h(candle));
    const peaks = this._findPeaks(highs, 3);
    
    if (peaks.length < 3) return null;

    // Head must be highest, shoulders roughly equal
    const sorted = [...peaks].sort((a, b) => highs[b] - highs[a]);
    const headIdx = sorted[0];
    const shoulders = sorted.slice(1, 3).sort((a, b) => a - b);
    
    // Head in middle, shoulders on sides
    if (headIdx <= shoulders[0] || headIdx >= shoulders[1]) return null;

    const headHeight = highs[headIdx];
    const lShoulder = highs[shoulders[0]];
    const rShoulder = highs[shoulders[1]];
    
    // Shoulders within 3% of each other
    const shoulderDiff = Math.abs(lShoulder - rShoulder) / ((lShoulder + rShoulder) / 2);
    if (shoulderDiff > ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.shoulderDifferenceMax')) return null;

    // Head meaningfully higher than shoulders
    const headProminence = (headHeight - (lShoulder + rShoulder) / 2) / headHeight;
    if (headProminence < ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.headProminenceMin')) return null;

    const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.baseConfidence') + (1 - shoulderDiff) * ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.shoulderScale') + headProminence * ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.headScale'), ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.confidenceCap'));
    return {
      name: 'head_shoulders',
      confidence: conf,
      direction: 'sell',
      description: `Head & Shoulders top at $${headHeight.toFixed(2)} — classic reversal forming`
    };
  }

  _detectInverseHeadShoulders(candles) {
    const lows = candles.map(candle => l(candle));
    const troughs = this._findTroughs(lows, 3);
    
    if (troughs.length < 3) return null;

    const sorted = [...troughs].sort((a, b) => lows[a] - lows[b]);
    const headIdx = sorted[0]; // Lowest
    const shoulders = sorted.slice(1, 3).sort((a, b) => a - b);

    if (headIdx <= shoulders[0] || headIdx >= shoulders[1]) return null;

    const headLow = lows[headIdx];
    const lShoulder = lows[shoulders[0]];
    const rShoulder = lows[shoulders[1]];

    const shoulderDiff = Math.abs(lShoulder - rShoulder) / ((lShoulder + rShoulder) / 2);
    if (shoulderDiff > ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.shoulderDifferenceMax')) return null;

    const headProminence = ((lShoulder + rShoulder) / 2 - headLow) / headLow;
    if (headProminence < ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.headProminenceMin')) return null;

    const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.baseConfidence') + (1 - shoulderDiff) * ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.shoulderScale') + headProminence * ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.headScale'), ConfigLoader.getInternalsFileValue('candlePatterns.headShoulders.confidenceCap'));
    return {
      name: 'inverse_head_shoulders',
      confidence: conf,
      direction: 'buy',
      description: `Inverse H&S bottom at $${headLow.toFixed(2)} — bullish reversal forming`
    };
  }

  _detectFlag(candles) {
    // Strong move (pole) followed by small counter-trend consolidation (flag)
    const pole = candles.slice(0, Math.floor(candles.length * ConfigLoader.getInternalsFileValue('candlePatterns.flag.poleFraction')));
    const flag = candles.slice(Math.floor(candles.length * ConfigLoader.getInternalsFileValue('candlePatterns.flag.poleFraction')));

    const poleMove = c(pole[pole.length-1]) - c(pole[0]);
    const poleRange = Math.abs(poleMove);
    const avgPrice = c(candles[candles.length-1]);
    const relPole = poleRange / avgPrice;
    
    if (relPole < ConfigLoader.getInternalsFileValue('candlePatterns.flag.poleMin')) return null; // Need meaningful pole

    // Flag should be tight consolidation
    const flagHighs = flag.map(candle => h(candle));
    const flagLows = flag.map(candle => l(candle));
    const flagRange = Math.max(...flagHighs) - Math.min(...flagLows);
    const relFlag = flagRange / avgPrice;

    // Flag range should be < 50% of pole
    if (flagRange > poleRange * ConfigLoader.getInternalsFileValue('candlePatterns.flag.flagPoleRatioMax')) return null;
    // Flag should be at least somewhat tight
    if (relFlag > ConfigLoader.getInternalsFileValue('candlePatterns.flag.flagPriceRatioMax')) return null;

    const direction = poleMove > 0 ? 'buy' : 'sell';
    const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.flag.baseConfidence') + (1 - flagRange / poleRange) * ConfigLoader.getInternalsFileValue('candlePatterns.flag.compressionScale'), ConfigLoader.getInternalsFileValue('candlePatterns.flag.confidenceCap'));

    return {
      name: 'flag',
      confidence: conf,
      direction,
      description: `${direction === 'buy' ? 'Bull' : 'Bear'} flag — consolidation after ${(relPole*100).toFixed(1)}% move`
    };
  }

  _detectWedge(candles) {
    const highs = candles.map(candle => h(candle));
    const lows = candles.map(candle => l(candle));

    // Linear regression on highs and lows
    const n = candles.length;
    const highSlope = this._linearSlope(highs);
    const lowSlope = this._linearSlope(lows);

    // Converging: slopes have opposite signs or both pointing same way but converging
    const converging = (highSlope < 0 && lowSlope > 0) || 
                       (Math.abs(highSlope) + Math.abs(lowSlope) > 0 && 
                        Math.abs(highSlope - lowSlope) < Math.abs(highSlope) + Math.abs(lowSlope));

    // Range is narrowing over time
    const earlyRange = highs.slice(0, ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow')).reduce((a,b)=>a+b,0)/ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow') - lows.slice(0, ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow')).reduce((a,b)=>a+b,0)/ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow');
    const lateRange = highs.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow')).reduce((a,b)=>a+b,0)/ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow') - lows.slice(-ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow')).reduce((a,b)=>a+b,0)/ConfigLoader.getInternalsFileValue('candlePatterns.wedge.edgeWindow');

    if (lateRange < earlyRange * ConfigLoader.getInternalsFileValue('candlePatterns.wedge.compressionRatioMax') && converging) {
      const compression = 1 - (lateRange / earlyRange);
      const direction = lowSlope > 0 ? 'buy' : highSlope < 0 ? 'sell' : 'neutral';
      const conf = Math.min(ConfigLoader.getInternalsFileValue('candlePatterns.wedge.baseConfidence') + compression * ConfigLoader.getInternalsFileValue('candlePatterns.wedge.compressionScale'), ConfigLoader.getInternalsFileValue('candlePatterns.wedge.confidenceCap'));

      return {
        name: 'wedge',
        confidence: conf,
        direction,
        description: `Wedge compression ${(compression*100).toFixed(0)}% — breakout imminent`
      };
    }
    return null;
  }

  // ─── UTILITIES ─────────────────────────────────────

  _findPeaks(data, minPeaks = 3) {
    const peaks = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] > data[i-1] && data[i] > data[i-2] && data[i] > data[i+1] && data[i] > data[i+2]) {
        peaks.push(i);
      }
    }
    return peaks.slice(-minPeaks - 2); // Return recent peaks
  }

  _findTroughs(data, minTroughs = 3) {
    const troughs = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (data[i] < data[i-1] && data[i] < data[i-2] && data[i] < data[i+1] && data[i] < data[i+2]) {
        troughs.push(i);
      }
    }
    return troughs.slice(-minTroughs - 2);
  }

  _linearSlope(data) {
    const n = data.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += data[i]; sumXY += i * data[i]; sumXX += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }
}

module.exports = CandlePatternDetector;
