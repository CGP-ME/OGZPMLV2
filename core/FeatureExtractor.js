/**
 * FeatureExtractor - Phase 4 of Modular Architecture Refactor
 *
 * PURPOSE: Pure function that extracts normalized feature vectors from indicators.
 * All features normalized to 0-1 range for consistent pattern matching.
 *
 * FEATURE VECTOR (9 elements):
 * [rsiNormalized, trendStrength, volatilityLevel, bbPosition, volumeProfile,
 *  priceAction, structureType, momentumScore, directionBias]
 *
 * @see ogz-meta/ledger/PHASES-4-14-EXTRACTION-ROADMAP.md
 */

const { c, o, h, l, v } = require('./CandleHelper');
const { ContractValidator } = require('./ContractValidator');
const { createTraceId, emitTrace } = require('./TraceSpine');
const ConfigLoader = require('../foundation/ConfigLoader');

const validator = new ContractValidator({ throwOnViolation: false, logViolations: true });
const FEATURE_VECTOR_UNAVAILABLE = 'feature_vector_unavailable';
/**
 * FeatureExtractor - Pure stateless feature extraction
 */
class FeatureExtractor {
  static unavailable(reason, details = {}) {
    const record = {
      available: false,
      status: 'unavailable',
      code: FEATURE_VECTOR_UNAVAILABLE,
      reason,
      features: null,
      labels: FeatureExtractor.labels(),
      raw: {},
      ...details,
    };
    console.error(`[FeatureExtractor] FEATURE_VECTOR_UNAVAILABLE: ${reason}`);
    emitTrace({}, 'FEATURE_VECTOR_UNAVAILABLE', {
      traceId: createTraceId('feature_vector_unavailable'),
      ...record,
    });
    return record;
  }

  static labels() {
    return [
      'rsiNormalized',
      'trendStrength',
      'volatilityLevel',
      'bbPosition',
      'volumeProfile',
      'priceAction',
      'structureType',
      'momentumScore',
      'directionBias'
    ];
  }

  /**
   * Extract normalized feature vector from market data
   *
   * @param {Object} params - Input parameters
   * @param {Object} params.indicators - Canonical indicators from IndicatorSnapshot
   * @param {Array} params.candles - Price history candles
   * @param {Object} [params.lastTrade] - Previous trade for context
   * @returns {Object} { features: number[], labels: string[], raw: Object }
   */
  static extract({ indicators, candles, lastTrade = null }) {
    // CONTRACT: Validate inputs
    if (!indicators || typeof indicators !== 'object') {
      return this.unavailable('invalid_indicators');
    }

    if (!candles || candles.length === 0) {
      return this.unavailable('missing_feature_candles');
    }

    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles.length > 1 ? candles[candles.length - 2] : latestCandle;

    // ═══════════════════════════════════════════════════════════════════
    // FEATURE EXTRACTION — All normalized to 0-1
    // ═══════════════════════════════════════════════════════════════════

    // [0] RSI Zone: 0-1 (already normalized in IndicatorSnapshot)
    // null during warmup — caller must gate on featureVector containing nulls
    const rsiNormalized = indicators.rsiNormalized ?? (indicators.rsi != null ? indicators.rsi / 100 : null);

    // [1] Trend Strength: 0-1 (1 = strong uptrend, 0 = strong downtrend, 0.5 = neutral)
    const trendStrength = this._normalizeTrend(indicators.trend ?? indicators.superTrendDirection);

    // [2] Volatility Level: 0-1 (uses atrNormalized) — null during warmup
    const volatilityLevel = indicators.atrNormalized
      ?? indicators.volatilityNormalized
      ?? this._normalizeAtrPercent(indicators.atrPercent);

    // [3] BB Position: 0-1 (percentB from IndicatorSnapshot) — null during warmup
    const bbPosition = indicators.bb?.percentB ?? indicators.bbPercentB ?? null;

    // [4] Volume Profile: 0-1 (relative volume compared to average)
    const volumeProfile = this._normalizeVolume(candles);

    // [5] Price Action: 0-1 (wick ratio — body size relative to range)
    const priceAction = this._calculateWickRatio(latestCandle);

    // [6] Structure Type: 0-1 (price change momentum)
    const structureType = this._normalizeChange(latestCandle, previousCandle);

    // [7] Momentum Score: 0-1 (MACD delta normalized)
    const momentumScore = this._normalizeMacd(indicators.macd, indicators.macdSignal);

    // [8] Direction Bias: 0-1 (0.5 = neutral, 1 = long bias, 0 = short bias)
    const directionBias = this._normalizeDirection(lastTrade);

    const features = [
      rsiNormalized,
      trendStrength,
      volatilityLevel,
      bbPosition,
      volumeProfile,
      priceAction,
      structureType,
      momentumScore,
      directionBias
    ];

    const unavailableFields = [];
    const clampedFeatures = features.map((f, i) => {
      if (f === null || f === undefined) {
        unavailableFields.push(FeatureExtractor.labels()[i]);
        return null;
      }
      if (typeof f !== 'number' || isNaN(f)) {
        unavailableFields.push(FeatureExtractor.labels()[i]);
        return null;
      }
      return Math.max(0, Math.min(1, f));
    });

    if (unavailableFields.length > 0) {
      return this.unavailable('feature_input_unavailable', {
        unavailableFields,
        raw: {
          rsi: indicators.rsi,
          trend: indicators.trend ?? indicators.superTrendDirection,
          atr: indicators.atr,
          atrPercent: indicators.atrPercent,
          bb: indicators.bb ?? { percentB: indicators.bbPercentB },
          macd: indicators.macd,
          macdSignal: indicators.macdSignal,
        },
      });
    }

    return {
      available: true,
      status: 'trusted',
      features: clampedFeatures,
      labels: FeatureExtractor.labels(),
      raw: {
        rsi: indicators.rsi,
        trend: indicators.trend ?? indicators.superTrendDirection,
        atr: indicators.atr,
        atrPercent: indicators.atrPercent,
        bb: indicators.bb ?? { percentB: indicators.bbPercentB },
        macd: indicators.macd,
        macdSignal: indicators.macdSignal,
      }
    };
  }

  /**
   * Extract features for pattern matching (backwards compatible)
   * Returns just the array for existing code compatibility
   */
  static extractArray({ indicators, candles, lastTrade = null }) {
    const result = this.extract({ indicators, candles, lastTrade });
    if (result && result.status === 'unavailable') {
      return null;
    }
    return result.features;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALIZATION HELPERS — All outputs 0-1
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalize trend to 0-1 (0=strong down, 0.5=neutral, 1=strong up)
   */
  static _normalizeTrend(trend) {
    if (!trend || typeof trend !== 'string') return null;

    const lower = trend.toLowerCase();
    const config = ConfigLoader.get('featureExtraction');
    if (lower === 'uptrend' || lower === 'bullish') return config.trendBullishValue;
    if (lower === 'downtrend' || lower === 'bearish') return config.trendBearishValue;
    if (lower === 'sideways' || lower === 'neutral' || lower === 'ranging') return config.neutralValue;
    return null;
  }

  /**
   * Normalize volume relative to recent average
   */
  static _normalizeVolume(candles) {
    const config = ConfigLoader.get('featureExtraction');
    if (!candles || candles.length < config.volumeMinimumCandles) return null;

    const volumes = candles.slice(-config.volumeLookback).map(c => v(c) ?? 0).filter(vol => vol > 0);
    if (volumes.length === 0) return null;

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const latestVolume = v(candles[candles.length - 1]);
    if (latestVolume == null || latestVolume <= 0) return null;

    // Normalize: 0.5 = average, 0 = very low, 1 = very high (2x average)
    const ratio = latestVolume / avgVolume;
    return Math.min(1, Math.max(0, ratio / config.volumeRatioCeiling));
  }

  static _normalizeAtrPercent(atrPercent) {
    if (atrPercent == null || typeof atrPercent !== 'number' || !Number.isFinite(atrPercent)) return null;
    return Math.min(
      1,
      Math.max(0, atrPercent / ConfigLoader.get('featureExtraction.volatilityPercentCeiling'))
    );
  }

  /**
   * Calculate wick ratio (body size vs total range)
   */
  static _calculateWickRatio(candle) {
    const high = h(candle);
    const low = l(candle);
    const open = o(candle);
    const close = c(candle);

    const range = high - low;
    if (range <= 0) return null;

    const bodySize = Math.abs(close - open);
    return bodySize / range;
  }

  /**
   * Normalize price change to 0-1
   */
  static _normalizeChange(currentCandle, previousCandle) {
    const prevClose = c(previousCandle);
    const currClose = c(currentCandle);

    if (!prevClose || prevClose <= 0) return null;

    const changePercent = (currClose - prevClose) / prevClose;
    // Map -5% to +5% range to 0-1 (0.5 = no change)
    const config = ConfigLoader.get('featureExtraction');
    return Math.min(
      1,
      Math.max(0, config.neutralValue + (changePercent * config.changeMultiplier))
    );
  }

  /**
   * Normalize MACD delta to 0-1
   */
  static _normalizeMacd(macd, flatSignal = null) {
    if (!macd) return null;

    const macdLine = typeof macd === 'number' ? macd : (macd.macd ?? macd.macdLine);
    const signalLine = typeof macd === 'number' ? flatSignal : (macd.signal ?? macd.signalLine);
    if (macdLine == null || signalLine == null) return null;
    const delta = macdLine - signalLine;

    // Typical MACD delta range is -500 to +500 for BTC
    // Normalize to 0-1 (0.5 = neutral)
    const config = ConfigLoader.get('featureExtraction');
    const normalized = config.neutralValue + (delta / config.macdDeltaRange);
    return Math.min(1, Math.max(0, normalized));
  }

  /**
   * Normalize last trade direction to 0-1
   */
  static _normalizeDirection(lastTrade) {
    const config = ConfigLoader.get('featureExtraction');
    if (!lastTrade?.direction) return config.neutralValue;

    const dir = lastTrade.direction.toLowerCase();
    if (dir === 'buy' || dir === 'long') return config.longDirectionValue;
    if (dir === 'sell' || dir === 'short') return config.shortDirectionValue;
    return config.neutralValue;
  }

  /**
   * Return unavailable features when input is invalid
   */
  static _defaultFeatures() {
    return this.unavailable('invalid_feature_input');
  }

  /**
   * Compute feature signature hash for pattern matching
   * Quantizes features to reduce noise
   */
  static computeSignature(features) {
    if (!Array.isArray(features) || features.length !== 9) {
      console.warn('[FeatureExtractor] Invalid features for signature');
      return 'INVALID';
    }

    // Quantize each feature to reduce noise (10 levels = 0.0 - 0.9)
    const steps = ConfigLoader.get('featureExtraction.signatureQuantizationSteps');
    const quantized = features.map(f => Math.floor(f * steps) / steps);
    return quantized.join('-');
  }
}

module.exports = FeatureExtractor;
