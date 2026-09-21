'use strict';

const { c } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'lookback',
  'trendPeriod',
  'atrPeriod',
  'minReturn',
  'atrStopMult',
  'trailAtrMult',
  'confidenceBase',
  'confidenceReturnMultiplier',
  'maxConfidence',
];

const REQUIRED_STRING_KEYS = [
  'stopType',
  'trailType',
  'tpMode',
  'maxHoldMode',
];

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.TimeSeriesMomentum');
  const cfg = { ...(base || {}), ...(overrides || {}) };

  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[TimeSeriesMomentum] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  const missingStrings = REQUIRED_STRING_KEYS.filter(key => typeof cfg[key] !== 'string' || cfg[key].trim() === '');
  if (missingStrings.length > 0) {
    throw new Error(`[TimeSeriesMomentum] missing string config key(s): ${missingStrings.join(', ')}`);
  }
  if (!Array.isArray(cfg.invalidationConditions)) {
    throw new Error('[TimeSeriesMomentum] invalidationConditions must be an array');
  }

  for (const key of ['lookback', 'trendPeriod', 'atrPeriod']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[TimeSeriesMomentum] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.minReturn) < 0) {
    throw new Error(`[TimeSeriesMomentum] minReturn must be >= 0 (got ${cfg.minReturn})`);
  }
  if (cfg.stopType !== 'atr' && cfg.stopType !== 'structural' && cfg.stopType !== 'percent') {
    throw new Error(`[TimeSeriesMomentum] stopType must be atr, structural, or percent (got ${cfg.stopType})`);
  }
  if (cfg.trailType !== 'atr') {
    throw new Error(`[TimeSeriesMomentum] trailType must be atr (got ${cfg.trailType})`);
  }
  if (cfg.tpMode !== 'off') {
    throw new Error(`[TimeSeriesMomentum] tpMode must be off (got ${cfg.tpMode})`);
  }
  if (cfg.maxHoldMode !== 'off') {
    throw new Error(`[TimeSeriesMomentum] maxHoldMode must be off (got ${cfg.maxHoldMode})`);
  }
  for (const key of ['atrStopMult', 'trailAtrMult']) {
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
    atrPeriod: Number(cfg.atrPeriod),
    minReturn: Number(cfg.minReturn),
    allowShorts: cfg.allowShorts === true,
    stopType: cfg.stopType,
    atrStopMult: Number(cfg.atrStopMult),
    trailType: cfg.trailType,
    trailAtrMult: Number(cfg.trailAtrMult),
    tpMode: cfg.tpMode,
    maxHoldMode: cfg.maxHoldMode,
    partialExit: Object.freeze({ ...(cfg.partialExit || { enabled: false, triggerR: 1, fraction: 0.5, remainderTrail: 'atr' }) }),
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
    this.minHistory = Math.max(this.cfg.trendPeriod, this.cfg.lookback, this.cfg.atrPeriod) + 2;
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
    const atr = ctx.indicators && Number.isFinite(ctx.indicators.atr)
      ? ctx.indicators.atr
      : IndicatorCalculator.calculateATR(candles, this.cfg.atrPeriod);
    if (!Number.isFinite(atr) || atr <= 0) return null;

    if (price > trendSMA && trailingReturn > this.cfg.minReturn) {
      return this._signal('buy', trailingReturn, trendSMA, atr, price, this._confidence(trailingReturn));
    }

    if (this.cfg.allowShorts && price < trendSMA && trailingReturn < -this.cfg.minReturn) {
      return this._signal('sell', trailingReturn, trendSMA, atr, price, this._confidence(Math.abs(trailingReturn)));
    }

    return null;
  }

  _confidence(absReturn) {
    return Math.min(
      this.cfg.maxConfidence,
      this.cfg.confidenceBase + Math.max(0, absReturn) * this.cfg.confidenceReturnMultiplier
    );
  }

  _signal(direction, trailingReturn, trendSMA, atr, price, confidence) {
    const stopPct = (this.cfg.atrStopMult * atr) / price * 100;
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
        stopLossPercent: -Math.abs(stopPct),
        stopType: this.cfg.stopType,
        atrStopMult: this.cfg.atrStopMult,
        takeProfitPercent: null,
        tpMode: this.cfg.tpMode,
        trailingStopPercent: null,
        trailingActivation: null,
        trailType: this.cfg.trailType,
        trailAtrMult: this.cfg.trailAtrMult,
        maxHoldTimeMinutes: null,
        maxHoldMode: this.cfg.maxHoldMode,
        partialExit: { ...this.cfg.partialExit },
        tsmLookback: this.cfg.lookback,
        tsmEntryTrailingReturn: trailingReturn,
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
