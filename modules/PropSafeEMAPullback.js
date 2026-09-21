'use strict';

const { c, o, h, l } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'fastEmaPeriod',
  'pullbackEmaPeriod',
  'trendEmaPeriod',
  'atrPeriod',
  'crossLookbackBars',
  'pullbackLookbackBars',
  'pullbackMinAtr',
  'pullbackMaxAtr',
  'atrStopMult',
  'targetRR',
  'trailActivationR',
  'trailDistanceR',
  'maxHoldTimeMinutes',
  'confidenceBase',
  'confidenceTrendBonus',
  'confidencePullbackBonus',
  'confidenceConfirmationBonus',
  'confidenceFreshCrossBonus',
  'maxConfidence',
];

const REQUIRED_TEXT_KEYS = [
  'rthStartET',
  'rthEndET',
  'sessionTimeZone',
];

function parseEtMinute(value, label) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`[PropSafeEMAPullback] ${label} must use HH:mm ET format (got ${value})`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`[PropSafeEMAPullback] ${label} has invalid time ${value}`);
  }
  return hour * 60 + minute;
}

function assertValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(Date.UTC(2026, 0, 1)));
  } catch (error) {
    throw new Error(`[PropSafeEMAPullback] sessionTimeZone must be a valid IANA timezone (got ${timeZone})`);
  }
}

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.PropSafeEMAPullback');
  const cfg = { ...(base || {}), ...(overrides || {}) };

  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[PropSafeEMAPullback] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  const missingText = REQUIRED_TEXT_KEYS.filter(key => typeof cfg[key] !== 'string' || cfg[key].trim() === '');
  if (missingText.length > 0) {
    throw new Error(`[PropSafeEMAPullback] missing non-empty config key(s): ${missingText.join(', ')}`);
  }

  for (const key of ['fastEmaPeriod', 'pullbackEmaPeriod', 'trendEmaPeriod', 'atrPeriod', 'crossLookbackBars', 'pullbackLookbackBars']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[PropSafeEMAPullback] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  if (!(Number(cfg.fastEmaPeriod) < Number(cfg.pullbackEmaPeriod) && Number(cfg.pullbackEmaPeriod) < Number(cfg.trendEmaPeriod))) {
    throw new Error('[PropSafeEMAPullback] EMA periods must satisfy fast < pullback < trend');
  }
  if (Number(cfg.pullbackMinAtr) < 0 || Number(cfg.pullbackMaxAtr) <= Number(cfg.pullbackMinAtr)) {
    throw new Error('[PropSafeEMAPullback] pullback ATR band must satisfy 0 <= min < max');
  }
  for (const key of ['atrStopMult', 'targetRR', 'trailActivationR', 'trailDistanceR', 'maxHoldTimeMinutes']) {
    if (Number(cfg[key]) <= 0) {
      throw new Error(`[PropSafeEMAPullback] ${key} must be positive (got ${cfg[key]})`);
    }
  }
  for (const key of ['confidenceBase', 'confidenceTrendBonus', 'confidencePullbackBonus', 'confidenceConfirmationBonus', 'confidenceFreshCrossBonus', 'maxConfidence']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 1) {
      throw new Error(`[PropSafeEMAPullback] ${key} must be 0..1 (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.maxConfidence) < Number(cfg.confidenceBase)) {
    throw new Error('[PropSafeEMAPullback] maxConfidence must be >= confidenceBase');
  }
  assertValidTimeZone(cfg.sessionTimeZone);

  return {
    ...cfg,
    fastEmaPeriod: Number(cfg.fastEmaPeriod),
    pullbackEmaPeriod: Number(cfg.pullbackEmaPeriod),
    trendEmaPeriod: Number(cfg.trendEmaPeriod),
    atrPeriod: Number(cfg.atrPeriod),
    crossLookbackBars: Number(cfg.crossLookbackBars),
    pullbackLookbackBars: Number(cfg.pullbackLookbackBars),
    pullbackMinAtr: Number(cfg.pullbackMinAtr),
    pullbackMaxAtr: Number(cfg.pullbackMaxAtr),
    atrStopMult: Number(cfg.atrStopMult),
    targetRR: Number(cfg.targetRR),
    trailActivationR: Number(cfg.trailActivationR),
    trailDistanceR: Number(cfg.trailDistanceR),
    maxHoldTimeMinutes: Number(cfg.maxHoldTimeMinutes),
    confidenceBase: Number(cfg.confidenceBase),
    confidenceTrendBonus: Number(cfg.confidenceTrendBonus),
    confidencePullbackBonus: Number(cfg.confidencePullbackBonus),
    confidenceConfirmationBonus: Number(cfg.confidenceConfirmationBonus),
    confidenceFreshCrossBonus: Number(cfg.confidenceFreshCrossBonus),
    maxConfidence: Number(cfg.maxConfidence),
    requireRth: cfg.requireRth !== false,
    allowShorts: cfg.allowShorts === true,
    rthStartMinute: parseEtMinute(cfg.rthStartET, 'rthStartET'),
    rthEndMinute: parseEtMinute(cfg.rthEndET, 'rthEndET'),
  };
}

function toDate(timestamp) {
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp > 100000000000 ? timestamp : timestamp * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof timestamp === 'string' && timestamp.trim()) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function etMinuteFor(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

class PropSafeEMAPullback {
  constructor(config = {}) {
    Object.defineProperty(this, 'cfg', {
      value: Object.freeze(readConfig(config)),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    this.minHistory = Math.max(
      this.cfg.trendEmaPeriod + this.cfg.crossLookbackBars + 2,
      this.cfg.atrPeriod + 2
    );
  }

  evaluate(ctx) {
    const candles = ctx && ctx.priceHistory;
    if (!Array.isArray(candles) || candles.length < this.minHistory) return null;

    const latest = candles[candles.length - 1];
    const price = c(latest);
    if (!Number.isFinite(price) || price <= 0) return null;

    if (this.cfg.requireRth && !this._isRth(latest)) return null;

    const fast = IndicatorCalculator.calculateEMA(candles, this.cfg.fastEmaPeriod);
    const pullback = IndicatorCalculator.calculateEMA(candles, this.cfg.pullbackEmaPeriod);
    const trend = IndicatorCalculator.calculateEMA(candles, this.cfg.trendEmaPeriod);
    const atr = (ctx.indicators && Number.isFinite(ctx.indicators.atr))
      ? ctx.indicators.atr
      : IndicatorCalculator.calculateATR(candles, this.cfg.atrPeriod);

    if (![fast, pullback, trend, atr].every(value => Number.isFinite(value) && value > 0)) return null;

    const longSignal = this._longSignal({ candles, latest, price, fast, pullback, trend, atr });
    if (longSignal) return longSignal;

    if (this.cfg.allowShorts) {
      return this._shortSignal({ candles, latest, price, fast, pullback, trend, atr });
    }

    return null;
  }

  _isRth(candle) {
    const date = toDate(candle.t ?? candle.timestamp ?? candle.time);
    if (!date) return false;
    const minute = etMinuteFor(date, this.cfg.sessionTimeZone);
    if (!Number.isFinite(minute)) return false;
    return minute >= this.cfg.rthStartMinute && minute < this.cfg.rthEndMinute;
  }

  _crossed(direction, candles) {
    const start = Math.max(1, candles.length - this.cfg.crossLookbackBars);
    for (let index = start; index < candles.length; index += 1) {
      const previous = candles.slice(0, index);
      const current = candles.slice(0, index + 1);
      const prevFast = IndicatorCalculator.calculateEMA(previous, this.cfg.fastEmaPeriod);
      const prevPullback = IndicatorCalculator.calculateEMA(previous, this.cfg.pullbackEmaPeriod);
      const currFast = IndicatorCalculator.calculateEMA(current, this.cfg.fastEmaPeriod);
      const currPullback = IndicatorCalculator.calculateEMA(current, this.cfg.pullbackEmaPeriod);
      if (![prevFast, prevPullback, currFast, currPullback].every(Number.isFinite)) continue;
      if (direction === 'buy' && prevFast <= prevPullback && currFast > currPullback) {
        return candles.length - 1 - index;
      }
      if (direction === 'sell' && prevFast >= prevPullback && currFast < currPullback) {
        return candles.length - 1 - index;
      }
    }
    return null;
  }

  _emaSlope(direction, candles, period) {
    const current = IndicatorCalculator.calculateEMA(candles, period);
    const previous = IndicatorCalculator.calculateEMA(
      candles.slice(0, Math.max(0, candles.length - this.cfg.pullbackLookbackBars)),
      period
    );
    if (![current, previous].every(value => Number.isFinite(value) && value > 0)) return false;
    return direction === 'buy' ? current > previous : current < previous;
  }

  _pullbackDistance(candles, pullback, atr) {
    const recent = candles.slice(-this.cfg.pullbackLookbackBars);
    let best = null;
    for (const candle of recent) {
      const candleLow = l(candle);
      const candleHigh = h(candle);
      const distances = candleLow <= pullback && candleHigh >= pullback
        ? [0]
        : [
          Math.abs(candleLow - pullback) / atr,
          Math.abs(candleHigh - pullback) / atr,
        ];
      for (const distance of distances) {
        if (!Number.isFinite(distance)) continue;
        if (best === null || distance < best) best = distance;
      }
    }
    return best;
  }

  _longSignal({ candles, latest, price, fast, pullback, trend, atr }) {
    if (!(price > trend && fast > pullback)) return null;
    if (!this._emaSlope('buy', candles, this.cfg.pullbackEmaPeriod)) return null;
    if (!this._emaSlope('buy', candles, this.cfg.trendEmaPeriod)) return null;
    const pullbackDistance = this._pullbackDistance(candles, pullback, atr);
    if (
      pullbackDistance === null ||
      pullbackDistance < this.cfg.pullbackMinAtr ||
      pullbackDistance > this.cfg.pullbackMaxAtr
    ) {
      return null;
    }
    if (!(price > pullback && c(latest) > o(latest))) return null;
    const crossBarsAgo = this._crossed('buy', candles);

    return this._signal('buy', {
      price,
      atr,
      crossBarsAgo,
      pullbackDistance,
      reason: `PropSafe EMA pullback buy: EMA${this.cfg.fastEmaPeriod}>EMA${this.cfg.pullbackEmaPeriod}, price above EMA${this.cfg.trendEmaPeriod}, pullback ${pullbackDistance.toFixed(2)} ATR`,
    });
  }

  _shortSignal({ candles, latest, price, fast, pullback, trend, atr }) {
    if (!(price < trend && fast < pullback)) return null;
    if (!this._emaSlope('sell', candles, this.cfg.pullbackEmaPeriod)) return null;
    if (!this._emaSlope('sell', candles, this.cfg.trendEmaPeriod)) return null;
    const pullbackDistance = this._pullbackDistance(candles, pullback, atr);
    if (
      pullbackDistance === null ||
      pullbackDistance < this.cfg.pullbackMinAtr ||
      pullbackDistance > this.cfg.pullbackMaxAtr
    ) {
      return null;
    }
    if (!(price < pullback && c(latest) < o(latest))) return null;
    const crossBarsAgo = this._crossed('sell', candles);

    return this._signal('sell', {
      price,
      atr,
      crossBarsAgo,
      pullbackDistance,
      reason: `PropSafe EMA pullback sell: EMA${this.cfg.fastEmaPeriod}<EMA${this.cfg.pullbackEmaPeriod}, price below EMA${this.cfg.trendEmaPeriod}, pullback ${pullbackDistance.toFixed(2)} ATR`,
    });
  }

  _signal(direction, context) {
    const stopPct = (this.cfg.atrStopMult * context.atr) / context.price * 100;
    const freshCrossBonus = Number.isFinite(context.crossBarsAgo)
      ? (this.cfg.crossLookbackBars - context.crossBarsAgo) / this.cfg.crossLookbackBars * this.cfg.confidenceFreshCrossBonus
      : 0;
    const confidence = Math.min(
      this.cfg.maxConfidence,
      this.cfg.confidenceBase
        + this.cfg.confidenceTrendBonus
        + this.cfg.confidencePullbackBonus
        + this.cfg.confidenceConfirmationBonus
        + freshCrossBonus
    );

    return {
      strategy: 'PropSafeEMAPullback',
      direction,
      confidence,
      reason: context.reason,
      signalData: {
        crossBarsAgo: context.crossBarsAgo,
        pullbackDistanceAtr: context.pullbackDistance,
        atrStopMult: this.cfg.atrStopMult,
        targetRR: this.cfg.targetRR,
      },
      exitContractHint: {
        stopLossPercent: -Math.abs(stopPct),
        takeProfitPercent: Math.abs(stopPct) * this.cfg.targetRR,
        trailingStopPercent: Math.abs(stopPct) * this.cfg.trailDistanceR,
        trailingActivation: Math.abs(stopPct) * this.cfg.trailActivationR,
        maxHoldTimeMinutes: this.cfg.maxHoldTimeMinutes,
        invalidationConditions: ['ema_pullback_invalidated'],
      },
    };
  }

  getState() {
    return {
      strategy: 'PropSafeEMAPullback',
      fastEmaPeriod: this.cfg.fastEmaPeriod,
      pullbackEmaPeriod: this.cfg.pullbackEmaPeriod,
      trendEmaPeriod: this.cfg.trendEmaPeriod,
      requireRth: this.cfg.requireRth,
      allowShorts: this.cfg.allowShorts,
    };
  }
}

module.exports = PropSafeEMAPullback;
