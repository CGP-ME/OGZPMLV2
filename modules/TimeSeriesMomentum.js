'use strict';

const { c } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const TradingConfig = require('../core/TradingConfig');

const REQUIRED_NUMERIC_KEYS = [
  'lookback',
  'trendPeriod',
  'minReturn',
  'stopLossPercent',
  'takeProfitPercent',
  'trailingStopPercent',
  'trailingActivation',
  'maxHoldTimeMinutes',
  'confidenceBase',
  'confidenceReturnMultiplier',
  'maxConfidence',
];

function readConfig(overrides) {
  const base = TradingConfig.get('strategies.TimeSeriesMomentum');
  const cfg = { ...(base || {}), ...(overrides || {}) };

  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[TimeSeriesMomentum] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  if (!Array.isArray(cfg.invalidationConditions)) {
    throw new Error('[TimeSeriesMomentum] invalidationConditions must be an array');
  }

  for (const key of ['lookback', 'trendPeriod']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[TimeSeriesMomentum] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.minReturn) < 0) {
    throw new Error(`[TimeSeriesMomentum] minReturn must be >= 0 (got ${cfg.minReturn})`);
  }
  if (Number(cfg.stopLossPercent) >= 0) {
    throw new Error(`[TimeSeriesMomentum] stopLossPercent must be negative (got ${cfg.stopLossPercent})`);
  }
  for (const key of ['takeProfitPercent', 'trailingStopPercent', 'trailingActivation', 'maxHoldTimeMinutes']) {
    if (Number(cfg[key]) <= 0) {
      throw new Error(`[TimeSeriesMomentum] ${key} must be positive (got ${cfg[key]})`);
    }
  }
  for (const key of ['confidenceBase', 'maxConfidence']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 1) {
      throw new Error(`[TimeSeriesMomentum] ${key} must be 0..1 (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.confidenceReturnMultiplier) <= 0) {
    throw new Error(`[TimeSeriesMomentum] confidenceReturnMultiplier must be positive (got ${cfg.confidenceReturnMultiplier})`);
  }
  if (Number(cfg.maxConfidence) < Number(cfg.confidenceBase)) {
    throw new Error('[TimeSeriesMomentum] maxConfidence must be >= confidenceBase');
  }

  return {
    ...cfg,
    lookback: Number(cfg.lookback),
    trendPeriod: Number(cfg.trendPeriod),
    minReturn: Number(cfg.minReturn),
    allowShorts: cfg.allowShorts === true,
    stopLossPercent: Number(cfg.stopLossPercent),
    takeProfitPercent: Number(cfg.takeProfitPercent),
    trailingStopPercent: Number(cfg.trailingStopPercent),
    trailingActivation: Number(cfg.trailingActivation),
    maxHoldTimeMinutes: Number(cfg.maxHoldTimeMinutes),
    confidenceBase: Number(cfg.confidenceBase),
    confidenceReturnMultiplier: Number(cfg.confidenceReturnMultiplier),
    maxConfidence: Number(cfg.maxConfidence),
    invalidationConditions: Object.freeze([...cfg.invalidationConditions]),
  };
}

class TimeSeriesMomentum {
  constructor(config = {}) {
    Object.defineProperty(this, 'cfg', {
      value: Object.freeze(readConfig(config)),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    this.minHistory = Math.max(this.cfg.trendPeriod, this.cfg.lookback) + 2;
  }

  evaluate(ctx) {
    const candles = ctx && ctx.priceHistory;
    if (!Array.isArray(candles) || candles.length < this.minHistory) return null;

    const latestIndex = candles.length - 1;
    const price = c(candles[latestIndex]);
    const past = c(candles[latestIndex - this.cfg.lookback]);
    if (!Number.isFinite(price) || !Number.isFinite(past) || price <= 0 || past <= 0) return null;

    const trendSMA = this.cfg.trendPeriod === 200 && ctx.indicators && Number.isFinite(ctx.indicators.sma200)
      ? ctx.indicators.sma200
      : IndicatorCalculator.calculateSMA(candles, this.cfg.trendPeriod);
    if (!Number.isFinite(trendSMA) || trendSMA <= 0) return null;

    const trailingReturn = (price - past) / past;

    if (price > trendSMA && trailingReturn > this.cfg.minReturn) {
      return this._signal('buy', trailingReturn, trendSMA, this._confidence(trailingReturn));
    }

    if (this.cfg.allowShorts && price < trendSMA && trailingReturn < -this.cfg.minReturn) {
      return this._signal('sell', trailingReturn, trendSMA, this._confidence(Math.abs(trailingReturn)));
    }

    return null;
  }

  _confidence(absReturn) {
    return Math.min(
      this.cfg.maxConfidence,
      this.cfg.confidenceBase + Math.max(0, absReturn) * this.cfg.confidenceReturnMultiplier
    );
  }

  _signal(direction, trailingReturn, trendSMA, confidence) {
    return {
      strategy: 'TimeSeriesMomentum',
      direction,
      confidence,
      reason: `return(${this.cfg.lookback})=${(trailingReturn * 100).toFixed(2)}% momentum ${direction} versus SMA${this.cfg.trendPeriod}`,
      signalData: {
        trailingReturn,
        trendSMA,
        lookback: this.cfg.lookback,
        trendPeriod: this.cfg.trendPeriod,
      },
      exitContractHint: {
        stopLossPercent: this.cfg.stopLossPercent,
        takeProfitPercent: this.cfg.takeProfitPercent,
        trailingStopPercent: this.cfg.trailingStopPercent,
        trailingActivation: this.cfg.trailingActivation,
        maxHoldTimeMinutes: this.cfg.maxHoldTimeMinutes,
        invalidationConditions: [...this.cfg.invalidationConditions],
      },
    };
  }

  getState() {
    return {
      strategy: 'TimeSeriesMomentum',
      lookback: this.cfg.lookback,
      trendPeriod: this.cfg.trendPeriod,
      minReturn: this.cfg.minReturn,
      allowShorts: this.cfg.allowShorts,
    };
  }
}

module.exports = TimeSeriesMomentum;
