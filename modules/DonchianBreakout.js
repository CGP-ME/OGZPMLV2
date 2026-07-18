'use strict';

const { c } = require('../core/CandleHelper');
const { IndicatorCalculator } = require('../core/IndicatorCalculator');
const ConfigLoader = require('../foundation/ConfigLoader');

const REQUIRED_NUMERIC_KEYS = [
  'entryPeriod',
  'atrPeriod',
  'atrStopMult',
  'trailChannelBars',
];

const REQUIRED_STRING_KEYS = [
  'stopType',
  'trailType',
  'tpMode',
  'maxHoldMode',
];

function readConfig(overrides) {
  const base = ConfigLoader.get('strategies.DonchianBreakout');
  const cfg = { ...(base || {}), ...(overrides || {}) };
  const missing = REQUIRED_NUMERIC_KEYS.filter(key => !Number.isFinite(Number(cfg[key])));
  if (missing.length > 0) {
    throw new Error(`[DonchianBreakout] missing finite config key(s): ${missing.join(', ')}`);
  }
  const missingStrings = REQUIRED_STRING_KEYS.filter(key => typeof cfg[key] !== 'string' || cfg[key].trim() === '');
  if (missingStrings.length > 0) {
    throw new Error(`[DonchianBreakout] missing string config key(s): ${missingStrings.join(', ')}`);
  }
  if (!Number.isInteger(Number(cfg.entryPeriod)) || Number(cfg.entryPeriod) <= 0) {
    throw new Error(`[DonchianBreakout] entryPeriod must be a positive integer (got ${cfg.entryPeriod})`);
  }
  if (!Number.isInteger(Number(cfg.atrPeriod)) || Number(cfg.atrPeriod) <= 0) {
    throw new Error(`[DonchianBreakout] atrPeriod must be a positive integer (got ${cfg.atrPeriod})`);
  }
  for (const key of ['atrStopMult', 'trailChannelBars']) {
    if (Number(cfg[key]) <= 0) {
      throw new Error(`[DonchianBreakout] ${key} must be positive (got ${cfg[key]})`);
    }
  }
  if (cfg.stopType !== 'structural') {
    throw new Error(`[DonchianBreakout] stopType must be structural (got ${cfg.stopType})`);
  }
  if (cfg.trailType !== 'channel') {
    throw new Error(`[DonchianBreakout] trailType must be channel (got ${cfg.trailType})`);
  }
  if (cfg.tpMode !== 'off') {
    throw new Error(`[DonchianBreakout] tpMode must be off (got ${cfg.tpMode})`);
  }
  if (cfg.maxHoldMode !== 'off') {
    throw new Error(`[DonchianBreakout] maxHoldMode must be off (got ${cfg.maxHoldMode})`);
  }
  if (cfg.invalidationConditions !== undefined && !Array.isArray(cfg.invalidationConditions)) {
    throw new Error('[DonchianBreakout] invalidationConditions must be an array when provided');
  }
  return cfg;
}

class DonchianBreakout {
  constructor(config = {}) {
    const cfg = readConfig(config);

    this.entryPeriod = Number(cfg.entryPeriod);
    this.atrPeriod = Number(cfg.atrPeriod);
    this.atrStopMult = Number(cfg.atrStopMult);
    this.allowShorts = cfg.allowShorts === true;
    this.minHistory = Math.max(this.entryPeriod + 2, this.atrPeriod + 2);

    this.exit = {
      stopType: cfg.stopType,
      trailType: cfg.trailType,
      trailChannelBars: Number(cfg.trailChannelBars),
      tpMode: cfg.tpMode,
      maxHoldMode: cfg.maxHoldMode,
      partialExit: cfg.partialExit && typeof cfg.partialExit === 'object'
        ? { ...cfg.partialExit }
        : { enabled: false, triggerR: 1, fraction: 0.5, remainderTrail: 'terrain' },
      invalidationConditions: [...(cfg.invalidationConditions || ['donchian_channel_reentry'])],
    };
  }

  evaluate(ctx) {
    const candles = ctx && ctx.priceHistory;
    if (!Array.isArray(candles) || candles.length < this.minHistory) return null;

    const price = c(candles[candles.length - 1]);
    if (!Number.isFinite(price) || price <= 0) return null;

    const channel = IndicatorCalculator.calculateDonchian(candles.slice(0, -1), this.entryPeriod);
    if (!channel) return null;

    const atr = (ctx.indicators && Number.isFinite(ctx.indicators.atr))
      ? ctx.indicators.atr
      : IndicatorCalculator.calculateATR(candles, this.atrPeriod);
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const stopPct = (this.atrStopMult * atr) / price * 100;

    if (price > channel.upper) {
      const extensionAtr = (price - channel.upper) / atr;
      return this._signal(
        'buy',
        this._confidence(extensionAtr),
        stopPct,
        channel,
        `Donchian breakout buy: close ${price.toFixed(2)} > prior ${this.entryPeriod}-bar high ${channel.upper.toFixed(2)}`
      );
    }

    if (this.allowShorts && price < channel.lower) {
      const extensionAtr = (channel.lower - price) / atr;
      return this._signal(
        'sell',
        this._confidence(extensionAtr),
        stopPct,
        channel,
        `Donchian breakout sell: close ${price.toFixed(2)} < prior ${this.entryPeriod}-bar low ${channel.lower.toFixed(2)}`
      );
    }

    return null;
  }

  _signal(direction, confidence, stopPct, channel, reason) {
    return {
      strategy: 'DonchianBreakout',
      direction,
      confidence,
      reason,
      exitContractHint: {
        stopLossPercent: -Math.abs(stopPct),
        stopType: this.exit.stopType,
        atrStopMult: this.atrStopMult,
        takeProfitPercent: null,
        tpMode: this.exit.tpMode,
        trailingStopPercent: null,
        trailingActivation: null,
        trailType: this.exit.trailType,
        trailChannelBars: this.exit.trailChannelBars,
        maxHoldTimeMinutes: null,
        maxHoldMode: this.exit.maxHoldMode,
        partialExit: { ...this.exit.partialExit },
        donchianChannelUpper: channel.upper,
        donchianChannelLower: channel.lower,
        invalidationConditions: [...this.exit.invalidationConditions],
      },
    };
  }

  _confidence(extensionAtr) {
    return Math.max(0, Math.min(1, 0.55 + Math.min(0.30, extensionAtr * 0.15)));
  }

  getState() {
    return {
      strategy: 'DonchianBreakout',
      entryPeriod: this.entryPeriod,
      atrPeriod: this.atrPeriod,
      atrStopMult: this.atrStopMult,
      allowShorts: this.allowShorts,
    };
  }
}

module.exports = DonchianBreakout;
