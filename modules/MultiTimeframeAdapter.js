'use strict';

/**
 * MultiTimeframeAdapter.js — V2-Compatible Rebuild
 * =================================================
 * Stores TFE-delivered candles in their born timeframe.
 * Calculates indicators per timeframe. Returns confluence score only.
 *
 * TREY LAW: MTF is a confluence service, not a strategy. It must not birth
 * trades, own an exit contract, or emit standalone trade intent. If
 * confluence-boosted rows fail to beat flat twins in Pass-1, delete this
 * module whole instead of preserving decorative complexity.
 *
 * V2 FIXES:
 *   • All candles use V2 format: { c, o, h, l, v, t } (Kraken OHLCV)
 *   • No external indicator dependencies — self-contained math
 *   • Bounded arrays (maxCandles per timeframe)
 *   • Clean API: ingestCandle(candle) + crossFrameScore()
 *   • EventEmitter for dashboard integration
 *   • Optional Polygon backfill kept but normalized to V2 format
 *
 * Integration:
 *   const mtf = new MultiTimeframeAdapter({ baseTimeframe: '15m', activeTimeframes: ['15m','1h','4h','1d'], minReadyTimeframes: 2, weights: {...} });
 *   mtf.ingestCandle(candle, '15m');  // candle = { c, o, h, l, v, t }
 *   const confluence = mtf.crossFrameScore();
 */

const EventEmitter = require('events');

// FIX 2026-02-16: Use centralized candle helper for format compatibility
const { c, o, h, l, v, t } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');

const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const TIMEFRAME_RANK = new Map(SUPPORTED_TIMEFRAMES.map((timeframe, index) => [timeframe, index]));
const DEFAULT_WEIGHTS = Object.freeze({
  '1m': 0.05,
  '5m': 0.08,
  '15m': 0.10,
  '30m': 0.10,
  '1h': 0.15,
  '4h': 0.17,
  '1d': 0.15,
});
const DEFAULT_MAX_CANDLES = Object.freeze({
  '1m': 1440,
  '5m': 576,
  '15m': 384,
  '30m': 336,
  '1h': 720,
  '4h': 360,
  '1d': 365,
});

function cleanTimeframe(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function uniqueTimeframes(timeframes) {
  return Array.from(new Set(timeframes.filter(Boolean)));
}

function normalizeWeights(weights, activeTimeframes) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new Error('[MultiTimeframeAdapter] weights must be an object keyed by timeframe');
  }
  const normalized = {};
  for (const timeframe of activeTimeframes) {
    const value = Number(weights[timeframe]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`[MultiTimeframeAdapter] weights.${timeframe} must be a finite positive number`);
    }
    normalized[timeframe] = value;
  }
  return Object.freeze(normalized);
}

function normalizeMinReadyTimeframes(value, activeCount) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`[MultiTimeframeAdapter] minReadyTimeframes must be a positive integer (got ${value})`);
  }
  if (parsed > activeCount) {
    throw new Error(`[MultiTimeframeAdapter] minReadyTimeframes ${parsed} exceeds activeTimeframes count ${activeCount}`);
  }
  return parsed;
}

class MultiTimeframeAdapter extends EventEmitter {
  constructor(config = {}) {
    super();

    const baseTimeframe = cleanTimeframe(config.baseTimeframe) || '1m';
    if (!TIMEFRAME_RANK.has(baseTimeframe)) {
      throw new Error(`[MultiTimeframeAdapter] unsupported baseTimeframe '${baseTimeframe}'`);
    }
    const requestedTimeframes = uniqueTimeframes([
      baseTimeframe,
      ...(config.activeTimeframes || ['1m', '5m', '15m', '1h', '4h', '1d']),
    ]);
    const activeTimeframes = requestedTimeframes.filter((timeframe) => {
      const cleaned = cleanTimeframe(timeframe);
      return TIMEFRAME_RANK.has(cleaned) && TIMEFRAME_RANK.get(cleaned) >= TIMEFRAME_RANK.get(baseTimeframe);
    });
    if (config.weights == null) {
      throw new Error('[MultiTimeframeAdapter] weights are required; pass ConfigLoader orchestrator.mtfConfluenceService.weights');
    }
    if (config.minReadyTimeframes == null) {
      throw new Error('[MultiTimeframeAdapter] minReadyTimeframes is required; pass ConfigLoader orchestrator.mtfConfluenceService.minReadyTimeframes');
    }

    this.config = {
      baseTimeframe,
      activeTimeframes,
      maxCandlesByTimeframe: {
        ...DEFAULT_MAX_CANDLES,
        ...(config.maxCandlesByTimeframe || {}),
      },
      indicatorPeriods: {
        rsi: 14,
        smaFast: 10,
        smaSlow: 50,
        ema: 21,
        macdFast: 12,
        macdSlow: 26,
        atr: 14,
        bollingerPeriod: 20,
        bollingerStd: 2,
        ...(config.indicatorPeriods || {}),
      },
      minCandlesForAnalysis: config.minCandlesForAnalysis || 30,
    };
    this.config.weights = normalizeWeights(config.weights, this.config.activeTimeframes);
    this.config.minReadyTimeframes = normalizeMinReadyTimeframes(
      config.minReadyTimeframes,
      this.config.activeTimeframes.length
    );

    // Storage
    this.candles = new Map();
    this.indicators = new Map();
    this.readyTimeframes = new Set();
    this.lastUpdate = new Map();
    this.timeframeDiagnostics = {
      rejectedDeliveredBars: 0,
    };

    this.stats = {
      candlesProcessed: 0,
      indicatorCalculations: 0,
      confluenceChecks: 0,
      errors: 0,
    };

    for (const tf of this.config.activeTimeframes) {
      this.candles.set(tf, []);
      this.indicators.set(tf, null);
      this.lastUpdate.set(tf, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 1: TFE-DELIVERED CANDLE INGESTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Feed a TFE-delivered candle in its born timeframe.
   * @param {Object} candle — { c, o, h, l, v, t } (V2 Kraken)
   */
  ingestCandle(candle, sourceTimeframe = candle?.timeframe) {
    if (!candle || c(candle) == null || t(candle) == null) return;

    const normalizedSourceTimeframe = cleanTimeframe(sourceTimeframe);
    if (!normalizedSourceTimeframe) {
      this._rejectDeliveredBar('missing sourceTimeframe');
      throw new Error('[MultiTimeframeAdapter] sourceTimeframe required');
    }
    if (!TIMEFRAME_RANK.has(normalizedSourceTimeframe)) {
      this._rejectDeliveredBar(`unsupported sourceTimeframe '${normalizedSourceTimeframe}'`);
      throw new Error(`[MultiTimeframeAdapter] unsupported sourceTimeframe '${normalizedSourceTimeframe}'`);
    }
    if (TIMEFRAME_RANK.get(normalizedSourceTimeframe) < TIMEFRAME_RANK.get(this.config.baseTimeframe)) {
      this._rejectDeliveredBar(`sourceTimeframe '${normalizedSourceTimeframe}' below baseTimeframe '${this.config.baseTimeframe}'`);
      throw new Error(`[MultiTimeframeAdapter] sourceTimeframe '${normalizedSourceTimeframe}' is below baseTimeframe '${this.config.baseTimeframe}'`);
    }
    if (!this.candles.has(normalizedSourceTimeframe)) {
      this._rejectDeliveredBar(`sourceTimeframe '${normalizedSourceTimeframe}' not configured`);
      throw new Error(`[MultiTimeframeAdapter] sourceTimeframe '${normalizedSourceTimeframe}' is not configured as a TFE-delivered timeframe`);
    }

    this.stats.candlesProcessed++;
    const stampedCandle = { ...candle, timeframe: normalizedSourceTimeframe };

    this._storeDeliveredBar(normalizedSourceTimeframe, stampedCandle);

    // Recalc indicators on ready timeframes
    this._recalculateIndicators();

    this.emit('timeframes_updated', {
      timestamp: t(stampedCandle),
      price: c(stampedCandle),
      sourceTimeframe: normalizedSourceTimeframe,
      readyTimeframes: Array.from(this.readyTimeframes),
    });
  }

  _rejectDeliveredBar(reason) {
    this.timeframeDiagnostics.rejectedDeliveredBars += 1;
    console.error(`[MTF][TIMEFRAME-REJECTED] refused delivered bar reason=${reason} count=${this.timeframeDiagnostics.rejectedDeliveredBars}`);
  }

  /**
   * Store a TFE-delivered bar with max-size enforcement.
   * @private
   */
  _storeDeliveredBar(timeframe, candle) {
    const arr = this.candles.get(timeframe);
    if (!arr) return;

    const max = this.config.maxCandlesByTimeframe[timeframe];

    arr.push(candle);
    if (arr.length > max) arr.splice(0, arr.length - max);

    this.lastUpdate.set(timeframe, t(candle));

    if (arr.length >= this.config.minCandlesForAnalysis) {
      this.readyTimeframes.add(timeframe);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: INDICATORS PER TIMEFRAME
  // ═══════════════════════════════════════════════════════════

  /** @private */
  _recalculateIndicators() {
    for (const tf of this.readyTimeframes) {
      const candleArr = this.candles.get(tf);
      if (!candleArr || candleArr.length < this.config.minCandlesForAnalysis) continue;

      const closes = candleArr.map(candle => c(candle));
      const highs = candleArr.map(candle => h(candle));
      const lows = candleArr.map(candle => l(candle));
      const volumes = candleArr.map(candle => v(candle));

      try {
        const p = this.config.indicatorPeriods;
        const snapshot = {
          timeframe: tf,
          timestamp: Date.now(),
          candleCount: candleArr.length,
          price: closes[closes.length - 1],
          rsi: IndicatorCalculator.calculateRSI(candleArr, p.rsi),
          smaFast: this._calcSMA(closes, p.smaFast),
          smaSlow: this._calcSMA(closes, p.smaSlow),
          ema: this._calcEMA(closes, p.ema),
          macd: this._calcMACD(closes, p.macdFast, p.macdSlow),
          atr: this._calcATR(highs, lows, closes, p.atr),
          bollinger: this._calcBollinger(closes, p.bollingerPeriod, p.bollingerStd),
          trend: null,
          trendStrength: 0,
          volumeSMA: this._calcSMA(volumes, 20),
          volumeRatio: 0,
        };

        // Derive trend
        if (snapshot.smaFast && snapshot.smaSlow) {
          if (snapshot.smaFast > snapshot.smaSlow) {
            snapshot.trend = 'bullish';
            snapshot.trendStrength = Math.min(1, (snapshot.smaFast - snapshot.smaSlow) / snapshot.smaSlow * 100);
          } else {
            snapshot.trend = 'bearish';
            snapshot.trendStrength = Math.min(1, (snapshot.smaSlow - snapshot.smaFast) / snapshot.smaFast * 100);
          }
        }

        if (snapshot.volumeSMA && snapshot.volumeSMA > 0) {
          snapshot.volumeRatio = volumes[volumes.length - 1] / snapshot.volumeSMA;
        }

        this.indicators.set(tf, snapshot);
        this.stats.indicatorCalculations++;
      } catch (err) {
        this.stats.errors++;
      }
    }
  }

  // ── Self-contained indicator math ───────────────────────────

  _calcSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _calcEMA(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _calcMACD(closes, fast, slow) {
    const emaFast = this._calcEMA(closes, fast);
    const emaSlow = this._calcEMA(closes, slow);
    if (emaFast === null || emaSlow === null) return null;
    const macdLine = emaFast - emaSlow;
    return { macdLine, bullish: macdLine > 0 };
  }

  _calcATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return null;
    const trs = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      trs.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  }

  _calcBollinger(closes, period, stdDev) {
    const sma = this._calcSMA(closes, period);
    if (sma === null) return null;
    const slice = closes.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev),
      bandwidth: ((std * stdDev * 2) / sma),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: CONFLUENCE SCORING
  // ═══════════════════════════════════════════════════════════

  /**
   * Get weighted confluence score across all ready timeframes.
   * @returns {Object} analysis with signed score, or null score when not ready
   */
  crossFrameScore() {
    this.stats.confluenceChecks++;

    const analysis = {
      module: 'MultiTimeframe',
      source: 'MultiTimeframeAdapter.crossFrameScore',
      timestamp: Date.now(),
      readyTimeframes: Array.from(this.readyTimeframes),
      totalTimeframes: this.config.activeTimeframes.length,
      minReadyTimeframes: this.config.minReadyTimeframes,
      available: false,
      unavailableReason: null,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      overallBias: 'neutral',
      confluenceScore: null,
      confidence: null,
      rsiAverage: 0,
      rsiExtreme: false,
      trendAlignment: 0,
      timeframeSignals: {},
      shouldTrade: null,
      direction: 'neutral',
      reasoning: [],
    };

    if (this.readyTimeframes.size < this.config.minReadyTimeframes) {
      analysis.unavailableReason = 'insufficient_ready_timeframes';
      analysis.reasoning.push(`Ready timeframes ${this.readyTimeframes.size}/${this.config.minReadyTimeframes}`);
      return analysis;
    }

    let weightedScore = 0, totalWeight = 0;
    let rsiSum = 0, rsiCount = 0;
    let trendMatches = 0, trendTotal = 0;
    let primaryTrend = null;

    for (const tf of this.readyTimeframes) {
      const ind = this.indicators.get(tf);
      if (!ind) continue;

      const weight = this.config.weights[tf];
      let signal = 0;

      // RSI
      if (ind.rsi !== null) {
        rsiSum += ind.rsi;
        rsiCount++;
        if (ind.rsi < 30) signal += 0.4;
        else if (ind.rsi > 70) signal -= 0.4;
        else if (ind.rsi < 45) signal += 0.1;
        else if (ind.rsi > 55) signal -= 0.1;
      }

      // Trend
      if (ind.trend === 'bullish') {
        signal += 0.3 * Math.min(1, ind.trendStrength);
        analysis.bullishCount++;
      } else if (ind.trend === 'bearish') {
        signal -= 0.3 * Math.min(1, ind.trendStrength);
        analysis.bearishCount++;
      } else {
        analysis.neutralCount++;
      }

      // MACD
      if (ind.macd) signal += ind.macd.bullish ? 0.2 : -0.2;

      // Bollinger
      if (ind.bollinger && ind.price) {
        const bbRange = ind.bollinger.upper - ind.bollinger.lower;
        if (bbRange > 0) {
          const bbPos = (ind.price - ind.bollinger.lower) / bbRange;
          if (bbPos < 0.2) signal += 0.1;
          else if (bbPos > 0.8) signal -= 0.1;
        }
      }

      signal = Math.max(-1, Math.min(1, signal));

      if (!primaryTrend && ind.trend && weight >= 0.10) primaryTrend = ind.trend;
      if (ind.trend && primaryTrend) {
        trendTotal++;
        if (ind.trend === primaryTrend) trendMatches++;
      }

      weightedScore += signal * weight;
      totalWeight += weight;

      analysis.timeframeSignals[tf] = {
        signal: signal > 0.15 ? 'bullish' : signal < -0.15 ? 'bearish' : 'neutral',
        strength: Math.abs(signal),
        rsi: ind.rsi ? Math.round(ind.rsi * 10) / 10 : null,
        trend: ind.trend,
        weight,
      };
    }

    // Final scores
    if (totalWeight > 0) analysis.confluenceScore = weightedScore / totalWeight;
    if (rsiCount > 0) {
      analysis.rsiAverage = rsiSum / rsiCount;
      analysis.rsiExtreme = analysis.rsiAverage < 30 || analysis.rsiAverage > 70;
    }
    if (trendTotal > 0) analysis.trendAlignment = trendMatches / trendTotal;

    const score = analysis.confluenceScore;
    if (score > 0.4) analysis.overallBias = 'strong_bullish';
    else if (score > 0.15) analysis.overallBias = 'bullish';
    else if (score < -0.4) analysis.overallBias = 'strong_bearish';
    else if (score < -0.15) analysis.overallBias = 'bearish';

    const agreementRatio = Math.max(analysis.bullishCount, analysis.bearishCount) /
      (analysis.bullishCount + analysis.bearishCount + analysis.neutralCount || 1);
    analysis.confidence = agreementRatio * analysis.trendAlignment;

    analysis.shouldTrade = analysis.confidence > 0.5 && Math.abs(score) > 0.15;
    if (analysis.shouldTrade) {
      analysis.direction = score > 0 ? 'buy' : 'sell';
    }
    analysis.available = true;

    return analysis;
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: GETTERS + DASHBOARD
  // ═══════════════════════════════════════════════════════════

  /** Get indicator snapshot for a specific timeframe */
  getTimeframeIndicators(tf) {
    return this.indicators.get(tf) || null;
  }

  /** Get candle count per timeframe */
  getCandleCounts() {
    const counts = {};
    for (const [tf, arr] of this.candles) counts[tf] = arr.length;
    return counts;
  }

  /** Get raw candles for a timeframe (e.g., for chart rendering) */
  getCandles(tf) {
    return this.candles.get(tf) || [];
  }

  /** Dashboard snapshot */
  getSnapshot() {
    return {
      baseTimeframe: this.config.baseTimeframe,
      activeTimeframes: [...this.config.activeTimeframes],
      readyTimeframes: Array.from(this.readyTimeframes),
      candleCounts: this.getCandleCounts(),
      indicators: Object.fromEntries(this.indicators),
      stats: { ...this.stats },
    };
  }

  /** Cleanup */
  destroy() {
    this.removeAllListeners();
    this.candles.clear();
    this.indicators.clear();
    this.readyTimeframes.clear();
  }
}

module.exports = MultiTimeframeAdapter;
