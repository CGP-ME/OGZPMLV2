'use strict';

const { c } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'rsiPeriod',
  'rsiEntry',
  'rsiEntryOB',
  'trendPeriod',
  'stopLossPercent',
  'takeProfitPercent',
  'trailingStopPercent',
  'trailingActivation',
  'maxHoldTimeMinutes',
  'confidenceBase',
  'confidenceDepthMultiplier',
  'maxConfidence',
];

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.RSI2MeanReversion');
  const cfg = { ...(base || {}), ...(overrides || {}) };

  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[RSI2MeanReversion] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  if (!Array.isArray(cfg.invalidationConditions)) {
    throw new Error('[RSI2MeanReversion] invalidationConditions must be an array');
  }

  for (const key of ['rsiPeriod', 'trendPeriod']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[RSI2MeanReversion] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.rsiEntry) <= 0 || Number(cfg.rsiEntry) >= 50) {
    throw new Error(`[RSI2MeanReversion] rsiEntry must be between 0 and 50 (got ${cfg.rsiEntry})`);
  }
  if (Number(cfg.rsiEntryOB) <= 50 || Number(cfg.rsiEntryOB) >= 100) {
    throw new Error(`[RSI2MeanReversion] rsiEntryOB must be between 50 and 100 (got ${cfg.rsiEntryOB})`);
  }
  if (Number(cfg.stopLossPercent) >= 0) {
    throw new Error(`[RSI2MeanReversion] stopLossPercent must be negative (got ${cfg.stopLossPercent})`);
  }
  for (const key of ['takeProfitPercent', 'trailingStopPercent', 'trailingActivation', 'maxHoldTimeMinutes']) {
    if (Number(cfg[key]) <= 0) {
      throw new Error(`[RSI2MeanReversion] ${key} must be positive (got ${cfg[key]})`);
    }
  }
  for (const key of ['confidenceBase', 'confidenceDepthMultiplier', 'maxConfidence']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 1) {
      throw new Error(`[RSI2MeanReversion] ${key} must be 0..1 (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.maxConfidence) < Number(cfg.confidenceBase)) {
    throw new Error('[RSI2MeanReversion] maxConfidence must be >= confidenceBase');
  }

  return {
    ...cfg,
    rsiPeriod: Number(cfg.rsiPeriod),
    rsiEntry: Number(cfg.rsiEntry),
    rsiEntryOB: Number(cfg.rsiEntryOB),
    trendPeriod: Number(cfg.trendPeriod),
    allowShorts: cfg.allowShorts === true,
    stopLossPercent: Number(cfg.stopLossPercent),
    takeProfitPercent: Number(cfg.takeProfitPercent),
    trailingStopPercent: Number(cfg.trailingStopPercent),
    trailingActivation: Number(cfg.trailingActivation),
    maxHoldTimeMinutes: Number(cfg.maxHoldTimeMinutes),
    confidenceBase: Number(cfg.confidenceBase),
    confidenceDepthMultiplier: Number(cfg.confidenceDepthMultiplier),
    maxConfidence: Number(cfg.maxConfidence),
    invalidationConditions: Object.freeze([...cfg.invalidationConditions]),
  };
}

class RSI2MeanReversion {
  constructor(config = {}) {
    Object.defineProperty(this, 'cfg', {
      value: Object.freeze(readConfig(config)),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    this.minHistory = Math.max(this.cfg.trendPeriod + 2, this.cfg.rsiPeriod + 2);
  }

  evaluate(ctx) {
    const candles = ctx && ctx.priceHistory;
    if (!Array.isArray(candles) || candles.length < this.minHistory) return null;

    const price = c(candles[candles.length - 1]);
    if (!Number.isFinite(price) || price <= 0) return null;

    const trendSMA = this.cfg.trendPeriod === 200 && ctx.indicators && Number.isFinite(ctx.indicators.sma200)
      ? ctx.indicators.sma200
      : IndicatorCalculator.calculateSMA(candles, this.cfg.trendPeriod);
    if (!Number.isFinite(trendSMA) || trendSMA <= 0) return null;

    const rsi = IndicatorCalculator.calculateRSI(candles, this.cfg.rsiPeriod);
    if (!Number.isFinite(rsi)) return null;

    if (price > trendSMA && rsi < this.cfg.rsiEntry) {
      const depth = (this.cfg.rsiEntry - rsi) / this.cfg.rsiEntry;
      return this._signal('buy', rsi, trendSMA, this._confidence(depth));
    }

    if (this.cfg.allowShorts && price < trendSMA && rsi > this.cfg.rsiEntryOB) {
      const depth = (rsi - this.cfg.rsiEntryOB) / (100 - this.cfg.rsiEntryOB);
      return this._signal('sell', rsi, trendSMA, this._confidence(depth));
    }

    return null;
  }

  _confidence(depth) {
    return Math.min(
      this.cfg.maxConfidence,
      this.cfg.confidenceBase + Math.max(0, Math.min(1, depth)) * this.cfg.confidenceDepthMultiplier
    );
  }

  _signal(direction, rsi, trendSMA, confidence) {
    return {
      strategy: 'RSI2MeanReversion',
      direction,
      confidence,
      reason: `RSI(${this.cfg.rsiPeriod})=${rsi.toFixed(1)} mean reversion ${direction} versus SMA${this.cfg.trendPeriod}`,
      signalData: {
        rsi,
        trendSMA,
        rsiPeriod: this.cfg.rsiPeriod,
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
      strategy: 'RSI2MeanReversion',
      rsiPeriod: this.cfg.rsiPeriod,
      rsiEntry: this.cfg.rsiEntry,
      rsiEntryOB: this.cfg.rsiEntryOB,
      trendPeriod: this.cfg.trendPeriod,
      allowShorts: this.cfg.allowShorts,
    };
  }
}

module.exports = RSI2MeanReversion;
