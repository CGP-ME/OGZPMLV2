'use strict';

const { c, o, h, l } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'atrPeriod',
  'slopeLookbackBars',
  'minSlopePct',
  'retestLookbackBars',
  'touchZoneAtr',
  'closeAwayAtr',
  'maxExtensionAtr',
  'confidenceBase',
  'confidenceSlopeBonus',
  'confidenceRetestBonus',
  'confidenceConfirmationBonus',
  'maxConfidence',
  'atrStopMult',
  'targetRR',
  'trailActivationR',
  'trailDistanceR',
  'maxHoldTimeMinutes',
];

const REQUIRED_TEXT_KEYS = [
  'rthStartET',
  'rthEndET',
  'sessionTimeZone',
];

function parseEtMinute(value, label) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`[EMATrendRetest] ${label} must use HH:mm ET format (got ${value})`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`[EMATrendRetest] ${label} has invalid time ${value}`);
  }
  return hour * 60 + minute;
}

function assertValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(Date.UTC(2026, 0, 1)));
  } catch (error) {
    throw new Error(`[EMATrendRetest] sessionTimeZone must be a valid IANA timezone (got ${timeZone})`);
  }
}

function parseEmaPeriods(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const periods = raw
    .map(item => Number(String(item).trim()))
    .filter(Number.isFinite);
  if (periods.length === 0) {
    throw new Error('[EMATrendRetest] emaPeriods must contain at least one finite period');
  }
  const unique = [...new Set(periods)];
  for (const period of unique) {
    if (!Number.isInteger(period) || period <= 1) {
      throw new Error(`[EMATrendRetest] emaPeriods entries must be integers > 1 (got ${period})`);
    }
  }
  return Object.freeze(unique.sort((a, b) => a - b));
}

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.EMATrendRetest');
  const cfg = { ...(base || {}), ...(overrides || {}) };

  if (cfg.emaPeriods === undefined || cfg.emaPeriods === null || cfg.emaPeriods === '') {
    throw new Error('[EMATrendRetest] missing config key: emaPeriods');
  }
  const missingNumeric = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missingNumeric.length > 0) {
    throw new Error(`[EMATrendRetest] missing finite config key(s): ${missingNumeric.join(', ')}`);
  }
  const missingText = REQUIRED_TEXT_KEYS.filter(key => typeof cfg[key] !== 'string' || cfg[key].trim() === '');
  if (missingText.length > 0) {
    throw new Error(`[EMATrendRetest] missing non-empty config key(s): ${missingText.join(', ')}`);
  }

  for (const key of ['atrPeriod', 'slopeLookbackBars', 'retestLookbackBars']) {
    if (!Number.isInteger(Number(cfg[key])) || Number(cfg[key]) <= 0) {
      throw new Error(`[EMATrendRetest] ${key} must be a positive integer (got ${cfg[key]})`);
    }
  }
  for (const key of ['minSlopePct', 'touchZoneAtr', 'closeAwayAtr', 'maxExtensionAtr', 'atrStopMult', 'targetRR', 'trailActivationR', 'trailDistanceR', 'maxHoldTimeMinutes']) {
    if (Number(cfg[key]) <= 0) {
      throw new Error(`[EMATrendRetest] ${key} must be positive (got ${cfg[key]})`);
    }
  }
  for (const key of ['confidenceBase', 'confidenceSlopeBonus', 'confidenceRetestBonus', 'confidenceConfirmationBonus', 'maxConfidence']) {
    const value = Number(cfg[key]);
    if (value < 0 || value > 1) {
      throw new Error(`[EMATrendRetest] ${key} must be 0..1 (got ${cfg[key]})`);
    }
  }
  if (Number(cfg.maxConfidence) < Number(cfg.confidenceBase)) {
    throw new Error('[EMATrendRetest] maxConfidence must be >= confidenceBase');
  }
  assertValidTimeZone(cfg.sessionTimeZone);

  return {
    ...cfg,
    emaPeriods: parseEmaPeriods(cfg.emaPeriods),
    atrPeriod: Number(cfg.atrPeriod),
    slopeLookbackBars: Number(cfg.slopeLookbackBars),
    minSlopePct: Number(cfg.minSlopePct),
    retestLookbackBars: Number(cfg.retestLookbackBars),
    touchZoneAtr: Number(cfg.touchZoneAtr),
    closeAwayAtr: Number(cfg.closeAwayAtr),
    maxExtensionAtr: Number(cfg.maxExtensionAtr),
    confidenceBase: Number(cfg.confidenceBase),
    confidenceSlopeBonus: Number(cfg.confidenceSlopeBonus),
    confidenceRetestBonus: Number(cfg.confidenceRetestBonus),
    confidenceConfirmationBonus: Number(cfg.confidenceConfirmationBonus),
    maxConfidence: Number(cfg.maxConfidence),
    atrStopMult: Number(cfg.atrStopMult),
    targetRR: Number(cfg.targetRR),
    trailActivationR: Number(cfg.trailActivationR),
    trailDistanceR: Number(cfg.trailDistanceR),
    maxHoldTimeMinutes: Number(cfg.maxHoldTimeMinutes),
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

class EMATrendRetest {
  constructor(config = {}) {
    Object.defineProperty(this, 'cfg', {
      value: Object.freeze(readConfig(config)),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    this.minHistory = Math.max(
      Math.max(...this.cfg.emaPeriods) + this.cfg.slopeLookbackBars + 2,
      this.cfg.atrPeriod + 2,
      this.cfg.retestLookbackBars + 2
    );
  }

  evaluate(ctx) {
    const candles = ctx && ctx.priceHistory;
    if (!Array.isArray(candles) || candles.length < this.minHistory) return null;

    const latest = candles[candles.length - 1];
    const price = c(latest);
    if (!Number.isFinite(price) || price <= 0) return null;

    if (this.cfg.requireRth && !this._isRth(latest)) return null;

    const atr = (ctx.indicators && Number.isFinite(ctx.indicators.atr))
      ? ctx.indicators.atr
      : IndicatorCalculator.calculateATR(candles, this.cfg.atrPeriod);
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const candidates = [];
    for (const period of this.cfg.emaPeriods) {
      const candidate = this._evaluatePeriod(candles, latest, price, atr, period);
      if (candidate) candidates.push(candidate);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.confidence - a.confidence || a.signalData.retestBarsAgo - b.signalData.retestBarsAgo);
    return candidates[0];
  }

  _isRth(candle) {
    const date = toDate(candle.t ?? candle.timestamp ?? candle.time);
    if (!date) return false;
    const minute = etMinuteFor(date, this.cfg.sessionTimeZone);
    if (!Number.isFinite(minute)) return false;
    return minute >= this.cfg.rthStartMinute && minute < this.cfg.rthEndMinute;
  }

  _evaluatePeriod(candles, latest, price, atr, period) {
    const ema = IndicatorCalculator.calculateEMA(candles, period);
    const olderCandles = candles.slice(0, candles.length - this.cfg.slopeLookbackBars);
    const olderEma = IndicatorCalculator.calculateEMA(olderCandles, period);
    if (![ema, olderEma].every(value => Number.isFinite(value) && value > 0)) return null;

    const slopePct = ((ema - olderEma) / olderEma) * 100;
    const extensionAtr = Math.abs(price - ema) / atr;
    if (extensionAtr > this.cfg.maxExtensionAtr) return null;

    const retest = this._findRetest(candles, period, atr);
    if (!retest) return null;

    const longSignal = slopePct >= this.cfg.minSlopePct && this._confirmsLong(latest, price, ema, atr);
    if (longSignal) {
      return this._signal('buy', { price, atr, period, ema, slopePct, extensionAtr, retest });
    }

    const shortSignal = this.cfg.allowShorts && slopePct <= -this.cfg.minSlopePct && this._confirmsShort(latest, price, ema, atr);
    if (shortSignal) {
      return this._signal('sell', { price, atr, period, ema, slopePct, extensionAtr, retest });
    }

    return null;
  }

  _findRetest(candles, period, atr) {
    const zone = this.cfg.touchZoneAtr * atr;
    const start = Math.max(0, candles.length - this.cfg.retestLookbackBars);
    let best = null;

    for (let index = start; index < candles.length; index += 1) {
      const slice = candles.slice(0, index + 1);
      const ema = IndicatorCalculator.calculateEMA(slice, period);
      if (!Number.isFinite(ema) || ema <= 0) continue;

      const candle = candles[index];
      const candleHigh = h(candle);
      const candleLow = l(candle);
      const spansEma = candleLow <= ema && candleHigh >= ema;
      const distance = spansEma
        ? 0
        : Math.min(Math.abs(candleLow - ema), Math.abs(candleHigh - ema));
      if (distance > zone) continue;

      const quality = 1 - Math.min(1, distance / zone);
      const retest = {
        barsAgo: candles.length - 1 - index,
        quality,
        emaAtRetest: ema,
      };
      if (!best || retest.quality > best.quality || (retest.quality === best.quality && retest.barsAgo < best.barsAgo)) {
        best = retest;
      }
    }

    return best;
  }

  _confirmsLong(latest, price, ema, atr) {
    return price > ema + this.cfg.closeAwayAtr * atr && c(latest) > o(latest);
  }

  _confirmsShort(latest, price, ema, atr) {
    return price < ema - this.cfg.closeAwayAtr * atr && c(latest) < o(latest);
  }

  _signal(direction, context) {
    const stopPct = (this.cfg.atrStopMult * context.atr) / context.price * 100;
    const slopeScore = Math.min(1, Math.abs(context.slopePct) / this.cfg.minSlopePct);
    const confidence = Math.min(
      this.cfg.maxConfidence,
      this.cfg.confidenceBase
        + slopeScore * this.cfg.confidenceSlopeBonus
        + context.retest.quality * this.cfg.confidenceRetestBonus
        + this.cfg.confidenceConfirmationBonus
    );
    const period = context.period;

    return {
      strategy: 'EMATrendRetest',
      direction,
      confidence,
      reason: `EMA${period} trend retest ${direction}: slope ${context.slopePct.toFixed(3)}%, retest ${context.retest.barsAgo} bars ago, extension ${context.extensionAtr.toFixed(2)} ATR`,
      signalData: {
        emaPeriod: period,
        ema: context.ema,
        slopePct: context.slopePct,
        retestBarsAgo: context.retest.barsAgo,
        retestQuality: context.retest.quality,
        extensionAtr: context.extensionAtr,
        atrStopMult: this.cfg.atrStopMult,
        targetRR: this.cfg.targetRR,
      },
      exitContractHint: {
        stopLossPercent: -Math.abs(stopPct),
        takeProfitPercent: Math.abs(stopPct) * this.cfg.targetRR,
        trailingStopPercent: Math.abs(stopPct) * this.cfg.trailDistanceR,
        trailingActivation: Math.abs(stopPct) * this.cfg.trailActivationR,
        maxHoldTimeMinutes: this.cfg.maxHoldTimeMinutes,
        invalidationConditions: ['ema_retest_failed'],
      },
    };
  }

  getState() {
    return {
      strategy: 'EMATrendRetest',
      emaPeriods: [...this.cfg.emaPeriods],
      requireRth: this.cfg.requireRth,
      allowShorts: this.cfg.allowShorts,
    };
  }
}

module.exports = EMATrendRetest;
