/**
 * ============================================================================
 * OptimizedIndicators.js - High-Performance Technical Analysis Engine
 * ============================================================================
 *
 * PURPOSE: Centralized technical indicator calculations with caching and optimization
 *
 * ARCHITECTURAL ROLE:
 * - Provides RSI, MACD, EMA, and volatility calculations
 * - Implements scalper-optimized caching for high-frequency trading
 * - Handles edge cases with named unavailable records
 * - Supports both standalone and batch calculations
 *
 * PERFORMANCE FEATURES:
 * - Scalper caching: Avoids redundant calculations in fast markets
 * - Memory-efficient: Bounded cache with FIFO eviction
 * - Error-resilient: Loud unavailable records for invalid data
 *
 * BUSINESS VALUE:
 * - Accurate technical signals drive profitable trading decisions
 * - Fast calculations enable real-time market analysis
 * - Reliable indicators reduce false signals and improve win rates
 *
 * @author OGZ Prime Development Team
 * @version 1.0.0
 * @since 2025-10-27
 * ============================================================================
 */

const { c: _c, o: _o, h: _h, l: _l, v: _v } = require('./CandleHelper');
const { IndicatorCalculator } = require('./IndicatorCalculator');
const { createTraceId, emitTrace } = require('./TraceSpine');

const INDICATORS_UNAVAILABLE = 'indicators_unavailable';
const OPTIMIZED_INDICATOR_CONFIG_QUESTIONS = Object.freeze({
  rsiPeriod: 'indicator.rsiPeriod',
  macdFastPeriod: 'indicator.macdFast',
  macdSlowPeriod: 'indicator.macdSlow',
  macdSignalPeriod: 'indicator.macdSignal',
  volatilityPeriod: 'indicator.volatilityPeriod',
  bollingerPeriod: 'indicator.bbPeriod',
  bollingerStdDev: 'indicator.bbStdDev',
  atrPeriod: 'indicator.atrPeriod',
  trendShortPeriod: 'indicator.trendShortPeriod',
  trendLongPeriod: 'indicator.trendLongPeriod',
  cacheSize: 'indicator.cacheSize',
  macdHistorySize: 'indicator.macdHistorySize',
  twoPoleSmaLength: 'indicator.twoPoleSmaLength',
  twoPoleFilterLength: 'indicator.twoPoleFilterLength',
  twoPoleUpperThreshold: 'indicator.twoPoleUpperThreshold',
  twoPoleLowerThreshold: 'indicator.twoPoleLowerThreshold',
});
const RSI_PERIOD_QUESTION_DEFAULT = 14;
const MACD_FAST_PERIOD_QUESTION_DEFAULT = 12;
const MACD_SLOW_PERIOD_QUESTION_DEFAULT = 26;
const MACD_SIGNAL_PERIOD_QUESTION_DEFAULT = 9;
const VOLATILITY_PERIOD_QUESTION_DEFAULT = 20;
const BOLLINGER_PERIOD_QUESTION_DEFAULT = 20;
const BOLLINGER_STD_DEV_QUESTION_DEFAULT = 2;
const ATR_PERIOD_QUESTION_DEFAULT = 14;
const TREND_SHORT_PERIOD_QUESTION_DEFAULT = 20;
const TREND_LONG_PERIOD_QUESTION_DEFAULT = 50;
const CACHE_SIZE_QUESTION_DEFAULT = 1000;
const MACD_HISTORY_SIZE_QUESTION_DEFAULT = 50;
const TWO_POLE_SMA_LENGTH_QUESTION_DEFAULT = 25;
const TWO_POLE_FILTER_LENGTH_QUESTION_DEFAULT = 20;
const TWO_POLE_UPPER_THRESHOLD_QUESTION_DEFAULT = 0.5;
const TWO_POLE_LOWER_THRESHOLD_QUESTION_DEFAULT = -0.5;

function finiteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

class OptimizedIndicators {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = CACHE_SIZE_QUESTION_DEFAULT; // Question key: indicator.cacheSize

    // MACD signal line history for proper EMA calculation
    this.macdHistory = [];
    this.maxMacdHistory = MACD_HISTORY_SIZE_QUESTION_DEFAULT; // Question key: indicator.macdHistorySize

    // Initialize Two-Pole Oscillator
    const TwoPoleOscillator = require('./TwoPoleOscillator');
    this.twoPoleOscillator = new TwoPoleOscillator({
      smaLength: TWO_POLE_SMA_LENGTH_QUESTION_DEFAULT,
      filterLength: TWO_POLE_FILTER_LENGTH_QUESTION_DEFAULT,
      upperThreshold: TWO_POLE_UPPER_THRESHOLD_QUESTION_DEFAULT,
      lowerThreshold: TWO_POLE_LOWER_THRESHOLD_QUESTION_DEFAULT
    });

    console.log('📊 OptimizedIndicators initialized with scalper caching');
    console.log('🎯 Two-Pole Oscillator [BigBeluga] integrated');
  }

  /**
   * SCALPER CACHING SYSTEM
   * Prevents redundant calculations in high-frequency trading
   */
  getScalperCacheKey(indicator, data, ...params) {
    // Create deterministic cache key from data and parameters
    const dataHash = data.map(d => _c(d)).join(',').substring(0, 50);
    return `${indicator}_${dataHash}_${params.join('_')}`;
  }

  getScalperCached(indicator, data, calculationFn, ...params) {
    const cacheKey = this.getScalperCacheKey(indicator, data, ...params);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = calculationFn.call(this, data, ...params);

    // FIFO cache eviction
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * MAIN TECHNICAL INDICATORS CALCULATION
   * Comprehensive analysis for trading decisions
   */
  calculateTechnicalIndicators(priceData = null) {
    try {
      const data = priceData ?? this.priceHistory;

      if (!Array.isArray(data) || data.length < MACD_SLOW_PERIOD_QUESTION_DEFAULT) {
        return this._indicatorsUnavailable('insufficient_indicator_candles', {
          candleCount: Array.isArray(data) ? data.length : 0,
          requiredCandles: MACD_SLOW_PERIOD_QUESTION_DEFAULT,
          configQuestionKey: OPTIMIZED_INDICATOR_CONFIG_QUESTIONS.macdSlowPeriod,
        });
      }

      const rsi = this.calculateRSI(data.slice(-(RSI_PERIOD_QUESTION_DEFAULT + 1)));

      const macdData = this.calculateMACD(data.slice(-MACD_SLOW_PERIOD_QUESTION_DEFAULT));

      const volatility = this.calculateVolatility(data.slice(-VOLATILITY_PERIOD_QUESTION_DEFAULT));

      let twoPole = null;
      if (data.length > 0) {
        const currentPrice = _c(data[data.length - 1]) ?? data[data.length - 1];
        twoPole = this.twoPoleOscillator.update(currentPrice);
      }

      if (
        finiteNumberOrNull(rsi) === null
        || finiteNumberOrNull(macdData?.macd) === null
        || finiteNumberOrNull(macdData?.signal) === null
        || finiteNumberOrNull(volatility) === null
      ) {
        return this._indicatorsUnavailable('indicator_component_unavailable', {
          candleCount: data.length,
          rsi,
          macd: macdData?.macd ?? null,
          macdSignal: macdData?.signal ?? null,
          volatility,
        });
      }

      return {
        available: true,
        status: 'trusted',
        rsi,
        macd: macdData.macd,
        macdSignal: macdData.signal,
        volatility,
        twoPole
      };

    } catch (error) {
      return this._indicatorsUnavailable('technical_indicator_calculation_failed', {
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  _indicatorsUnavailable(reason, details = {}) {
    const record = {
      available: false,
      status: 'unavailable',
      code: INDICATORS_UNAVAILABLE,
      reason,
      rsi: null,
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      volatility: null,
      twoPole: null,
      ...details,
    };
    console.error(`[OptimizedIndicators] INDICATORS_UNAVAILABLE: ${reason}`);
    emitTrace({}, 'INDICATORS_UNAVAILABLE', {
      traceId: createTraceId('indicators_unavailable'),
      ...record,
    });
    return record;
  }

  /**
   * RSI CALCULATION
   * Relative Strength Index for momentum analysis
   */
  calculateRSI(priceData, period = RSI_PERIOD_QUESTION_DEFAULT) {
    if (!Array.isArray(priceData) || priceData.length < period + 1) {
      return null;
    }
    return this.getScalperCached('RSI', priceData, this._calculateRSICore, period);
  }

  _calculateRSICore(priceData, period = RSI_PERIOD_QUESTION_DEFAULT) {
    return IndicatorCalculator.calculateWilderRSI(priceData, period);
  }

  /**
   * MACD CALCULATION
   * Moving Average Convergence Divergence for trend analysis
   */
  calculateMACD(priceData) {
    if (!Array.isArray(priceData) || priceData.length < MACD_SLOW_PERIOD_QUESTION_DEFAULT) {
      return {
        available: false,
        status: 'unavailable',
        code: INDICATORS_UNAVAILABLE,
        reason: 'insufficient_macd_candles',
        configQuestionKey: OPTIMIZED_INDICATOR_CONFIG_QUESTIONS.macdSlowPeriod,
        macdLine: null,
        signalLine: null,
        histogram: null,
        macd: null,
        signal: null,
      };
    }
    return this.getScalperCached('MACD', priceData, this._calculateMACDCore);
  }

  _calculateMACDCore(priceData) {

    // TESTING MODE: Reduce minimum candle requirement to 1
    const minCandles = process.env.TESTING === 'true' ? 1 : MACD_SLOW_PERIOD_QUESTION_DEFAULT;

    if (priceData.length < minCandles) {
      return {
        available: false,
        status: 'unavailable',
        code: INDICATORS_UNAVAILABLE,
        reason: 'insufficient_macd_candles',
        configQuestionKey: OPTIMIZED_INDICATOR_CONFIG_QUESTIONS.macdSlowPeriod,
        macdLine: null,
        signalLine: null,
        histogram: null,
        macd: null,
        signal: null,
      };
    }

    // Validate data structure
    const firstCandle = priceData[0];
    const lastCandle = priceData[priceData.length - 1];

    // CRITICAL FIX: Use most recent data, not oldest!
    const ema12 = this.calculateEMA(priceData.slice(-MACD_FAST_PERIOD_QUESTION_DEFAULT), MACD_FAST_PERIOD_QUESTION_DEFAULT);
    const ema26 = this.calculateEMA(priceData.slice(-MACD_SLOW_PERIOD_QUESTION_DEFAULT), MACD_SLOW_PERIOD_QUESTION_DEFAULT);

    const macdLine = ema12 - ema26;

    // FIX: Properly calculate signal line as 9-period EMA of MACD
    // Maintain MACD history for accurate signal line calculation
    this.macdHistory.push(macdLine);
    if (this.macdHistory.length > this.maxMacdHistory) {
      this.macdHistory.shift(); // Remove oldest
    }

    if (this.macdHistory.length < MACD_SIGNAL_PERIOD_QUESTION_DEFAULT) {
      return {
        available: false,
        status: 'unavailable',
        code: INDICATORS_UNAVAILABLE,
        reason: 'insufficient_macd_signal_history',
        configQuestionKey: OPTIMIZED_INDICATOR_CONFIG_QUESTIONS.macdSignalPeriod,
        macdLine,
        signalLine: null,
        histogram: null,
        macd: macdLine,
        signal: null,
      };
    }

    const macdForSignal = this.macdHistory.slice(-MACD_SIGNAL_PERIOD_QUESTION_DEFAULT);
    const signalLine = this.calculateEMA(macdForSignal.map(val => ({ c: val })), MACD_SIGNAL_PERIOD_QUESTION_DEFAULT);

    const histogram = macdLine - signalLine;
    return { macdLine, signalLine, histogram, macd: macdLine, signal: signalLine };
  }

  /**
   * EMA CALCULATION
   * Exponential Moving Average for trend smoothing
   */
  calculateEMA(priceData, period) {
    if (!Array.isArray(priceData) || priceData.length === 0) {
      return null;
    }
    return this.getScalperCached('EMA', priceData, this._calculateEMACore, period);
  }

  _calculateEMACore(priceData, period) {

    if (priceData.length === 0) {
      return null;
    }

    // Validate data structure
    const lastCandle = priceData[priceData.length - 1];

    if (!_c(lastCandle)) {
      return null;
    }

    const multiplier = 2 / (period + 1);
    let ema = _c(priceData[priceData.length - 1]); // Start with most recent close

    for (let i = priceData.length - 2; i >= 0; i--) {
      if (!_c(priceData[i])) {
        continue;
      }
      ema = (_c(priceData[i]) * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  /**
   * VOLATILITY CALCULATION
   * Price volatility for risk assessment
   */
  calculateVolatility(priceData, period = VOLATILITY_PERIOD_QUESTION_DEFAULT) {
    if (!Array.isArray(priceData) || priceData.length < 2) {
      return null;
    }
    return this.getScalperCached('VOLATILITY', priceData, this._calculateVolatilityCore, period);
  }

  _calculateVolatilityCore(priceData, period = VOLATILITY_PERIOD_QUESTION_DEFAULT) {
    if (priceData.length < 2) return null;

    // Use last 'period' candles or all available
    const data = priceData.slice(-period);

    const returns = [];
    for (let i = 1; i < data.length; i++) {
      // CHANGE 613: Fix inverted volatility formula - was (prev - curr) / curr, should be (curr - prev) / prev
      const return_rate = (_c(data[i]) - _c(data[i-1])) / _c(data[i-1]);
      returns.push(return_rate);
    }

    if (returns.length === 0) return null;

    // Calculate standard deviation
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * BOLLINGER BANDS CALCULATION
   * Volatility bands for price containment analysis
   */
  calculateBollingerBands(candles, period = BOLLINGER_PERIOD_QUESTION_DEFAULT, stdDevMultiplier = BOLLINGER_STD_DEV_QUESTION_DEFAULT) {

    if (!candles || candles.length < period) {
      return {
        available: false,
        status: 'unavailable',
        code: INDICATORS_UNAVAILABLE,
        reason: 'insufficient_bollinger_candles',
        configQuestionKey: OPTIMIZED_INDICATOR_CONFIG_QUESTIONS.bollingerPeriod,
        upper: null,
        middle: null,
        lower: null,
        width: null
      };
    }

    // Validate data structure
    const firstCandle = candles[0];
    const lastCandle = candles[candles.length - 1];

    // Calculate SMA (middle band)
    const prices = candles.slice(-period).map(c => c.close ?? _c(c));

    // Check for undefined/NaN prices
    const invalidPrices = prices.filter(p => !p || isNaN(p));
    if (invalidPrices.length > 0) {
      return {
        available: false,
        status: 'unavailable',
        code: INDICATORS_UNAVAILABLE,
        reason: 'invalid_bollinger_price',
        upper: null,
        middle: null,
        lower: null,
        width: null,
      };
    }

    const sma = prices.reduce((sum, price) => sum + price, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = prices.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / period;
    const stdDev = Math.sqrt(variance);

    // Calculate bands
    const upper = sma + (stdDev * stdDevMultiplier);
    const lower = sma - (stdDev * stdDevMultiplier);
    const width = (upper - lower) / sma * 100; // Width as percentage

    return {
      upper,
      middle: sma,
      lower,
      width
    };
  }

  /**
   * TREND DETERMINATION
   * Market trend analysis for directional bias
   */
  determineTrend(priceData, shortPeriod = TREND_SHORT_PERIOD_QUESTION_DEFAULT, longPeriod = TREND_LONG_PERIOD_QUESTION_DEFAULT) {
    if (!priceData || priceData.length < longPeriod) {
      return null;
    }

    const shortEMA = this.calculateEMA(priceData.slice(-shortPeriod), shortPeriod);
    const longEMA = this.calculateEMA(priceData.slice(-longPeriod), longPeriod);
    const currentPrice = _c(priceData[priceData.length - 1]);

    // Simple trend logic based on EMA crossover and price position
    if (shortEMA > longEMA && currentPrice > shortEMA) {
      return 'uptrend';
    } else if (shortEMA < longEMA && currentPrice < shortEMA) {
      return 'downtrend';
    } else {
      return 'sideways';
    }
  }

  /**
   * VOTE-BASED INDICATOR ANALYSIS
   * Returns structured votes for ensemble decision making
   */
  getRSIVotes(rsi) {
    const votes = [];

    if (rsi >= 75) {
      votes.push({ tag: 'RSI>75', vote: -1, strength: 0.25 }); // Oversold - SELL
    } else if (rsi >= 70) {
      votes.push({ tag: 'RSI>70', vote: -1, strength: 0.20 });
    } else if (rsi <= 25) {
      votes.push({ tag: 'RSI<25', vote: 1, strength: 0.25 }); // Oversold - BUY
    } else if (rsi <= 30) {
      votes.push({ tag: 'RSI<30', vote: 1, strength: 0.20 });
    }

    return votes;
  }

  getMACDVotes(macdData) {
    const votes = [];

    if (macdData.macd > 0 && macdData.signal > 0 && (macdData.macd - macdData.signal) > 0) {
      votes.push({ tag: 'MACD:strongBullish', vote: 1, strength: 0.20 });
    } else if (macdData.macd < 0 && macdData.signal < 0 && (macdData.macd - macdData.signal) < 0) {
      votes.push({ tag: 'MACD:strongBearish', vote: -1, strength: 0.20 });
    }

    return votes;
  }

  getAllVotes(marketData) {
    const votes = [];

    // RSI votes
    if (marketData.rsi) {
      votes.push(...this.getRSIVotes(marketData.rsi));
    }

    // MACD votes
    if (marketData.macd && marketData.macdSignal) {
      votes.push(...this.getMACDVotes({
        macd: marketData.macd,
        signal: marketData.macdSignal,
        histogram: marketData.macdHistogram ?? null
      }));
    }

    return votes;
  }

  /**
   * Calculate Average True Range (ATR) for dynamic stop loss
   * ATR measures market volatility using the true range over a period
   *
   * @param {Array} priceData - Array of OHLC data: [{o, h, l, c, t}, ...]
   * @param {number} period - ATR period (question default: indicator.atrPeriod)
   * @returns {number} - ATR value as decimal (e.g., 0.02 = 2% volatility)
   */
  calculateATR(priceData, period = ATR_PERIOD_QUESTION_DEFAULT) {
    console.log(`🔍 [ATR] Entry: priceData.length=${priceData?.length || 0}, period=${period}`);

    // Need at least period + 1 candles for ATR calculation
    if (!priceData || priceData.length < period + 1) {
      console.log(`⚠️ [ATR] Insufficient data (need ${period + 1}, have ${priceData?.length || 0})`);
      return null;
    }

    // Calculate True Range for each candle
    const trueRanges = [];

    for (let i = 1; i < priceData.length; i++) {
      const candle = priceData[i];
      const prevCandle = priceData[i - 1];

      // Validate data structure
      if (!_h(candle) || !_l(candle) || !_c(candle) || !_c(prevCandle)) {
        console.log(`⚠️ [ATR] Invalid candle structure at index ${i}`);
        continue;
      }

      // True Range = MAX of:
      // 1. High - Low (current candle range)
      // 2. |High - Previous Close| (gap up)
      // 3. |Low - Previous Close| (gap down)
      const tr = Math.max(
        _h(candle) - _l(candle),
        Math.abs(_h(candle) - _c(prevCandle)),
        Math.abs(_l(candle) - _c(prevCandle))
      );

      trueRanges.push(tr);
    }

    if (trueRanges.length < period) {
      console.log(`⚠️ [ATR] Not enough true ranges calculated: ${trueRanges.length}`);
      return null;
    }

    // Calculate initial ATR as SMA of first 'period' true ranges
    const recentTR = trueRanges.slice(-period);
    const atrAbsolute = recentTR.reduce((sum, tr) => sum + tr, 0) / period;

    // Convert to percentage of current price
    const currentPrice = _c(priceData[priceData.length - 1]);
    const atrPercent = atrAbsolute / currentPrice;

    console.log(`✅ [ATR] Calculated: ${(atrPercent * 100).toFixed(2)}% (abs: $${atrAbsolute.toFixed(2)}, price: $${currentPrice.toFixed(2)})`);

    return atrPercent;
  }

  /**
   * CACHE MANAGEMENT
   * Monitor and maintain cache health
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      utilization: ((this.cache.size / this.maxCacheSize) * 100).toFixed(1) + '%'
    };
  }

  clearCache() {
    const cleared = this.cache.size;
    this.cache.clear();
    console.log(`🧹 OptimizedIndicators cache cleared: ${cleared} entries removed`);
    return cleared;
  }
}

// Export singleton instance for consistent caching across the application
module.exports = new OptimizedIndicators();
