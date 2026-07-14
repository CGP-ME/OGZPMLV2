'use strict';

const EventEmitter = require('events');
const { c, o, h, l, v, t } = require('./CandleHelper');

const TIMEFRAME_MS = Object.freeze({
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertPlainObject(value, label) {
  if (!value) {
    throw new Error(`[TimeframeEngine] ${label} must be a plain object`);
  }
  if (typeof value !== 'object') {
    throw new Error(`[TimeframeEngine] ${label} must be a plain object`);
  }
  if (Array.isArray(value)) {
    throw new Error(`[TimeframeEngine] ${label} must be a plain object`);
  }
  return value;
}

function assertText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`[TimeframeEngine] ${label} must be a non-empty string`);
  }
  if (value.trim() === '') {
    throw new Error(`[TimeframeEngine] ${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertFiniteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`[TimeframeEngine] ${label} must be finite`);
  }
  return numeric;
}

function assertSupportedTimeframe(timeframe, label) {
  const normalized = assertText(timeframe, label);
  if (!hasOwn(TIMEFRAME_MS, normalized)) {
    throw new Error(`[TimeframeEngine] ${label} unsupported timeframe '${normalized}'`);
  }
  return normalized;
}

function uniqueTimeframes(timeframes) {
  const seen = new Set();
  const result = [];
  for (const timeframe of timeframes) {
    const normalized = assertSupportedTimeframe(timeframe, 'timeframes[]');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeMaxCandles(configured, timeframes) {
  const source = assertPlainObject(configured, 'maxCandles');
  const result = {};
  for (const timeframe of timeframes) {
    if (!hasOwn(source, timeframe)) {
      throw new Error(`[TimeframeEngine] maxCandles.${timeframe} required`);
    }
    const value = Number(source[timeframe]);
    if (!Number.isInteger(value)) {
      throw new Error(`[TimeframeEngine] maxCandles.${timeframe} must be a positive integer`);
    }
    if (value <= 0) {
      throw new Error(`[TimeframeEngine] maxCandles.${timeframe} must be a positive integer`);
    }
    result[timeframe] = value;
  }
  return Object.freeze(result);
}

function normalizeConfig(config) {
  const source = assertPlainObject(config, 'config');
  for (const key of ['symbol', 'baseTimeframe', 'timeframes', 'maxCandles']) {
    if (!hasOwn(source, key)) {
      throw new Error(`[TimeframeEngine] config.${key} required`);
    }
  }

  const symbol = assertText(source.symbol, 'symbol').toUpperCase();
  const baseTimeframe = assertSupportedTimeframe(source.baseTimeframe, 'baseTimeframe');
  if (!Array.isArray(source.timeframes)) {
    throw new Error('[TimeframeEngine] timeframes must be a non-empty array');
  }
  if (source.timeframes.length === 0) {
    throw new Error('[TimeframeEngine] timeframes must be a non-empty array');
  }
  const timeframes = uniqueTimeframes(source.timeframes)
    .sort((left, right) => TIMEFRAME_MS[left] - TIMEFRAME_MS[right]);
  if (!timeframes.includes(baseTimeframe)) {
    throw new Error(`[TimeframeEngine] timeframes must include baseTimeframe '${baseTimeframe}'`);
  }
  const baseMs = TIMEFRAME_MS[baseTimeframe];
  for (const timeframe of timeframes) {
    const timeframeMs = TIMEFRAME_MS[timeframe];
    if (timeframeMs < baseMs) {
      throw new Error(`[TimeframeEngine] timeframe '${timeframe}' is below baseTimeframe '${baseTimeframe}'`);
    }
    if (timeframeMs % baseMs !== 0) {
      throw new Error(`[TimeframeEngine] timeframe '${timeframe}' is not an even multiple of baseTimeframe '${baseTimeframe}'`);
    }
  }

  return Object.freeze({
    symbol,
    baseTimeframe,
    timeframes: Object.freeze(timeframes),
    maxCandles: normalizeMaxCandles(source.maxCandles, timeframes),
  });
}

function readNumericCandle(candle, field, reader) {
  const value = assertFiniteNumber(reader(candle), `candle.${field}`);
  return value;
}

function normalizeRawBaseCandle(rawCandle, symbol, timeframe) {
  assertPlainObject(rawCandle, 'rawCandle');
  const timestamp = assertFiniteNumber(t(rawCandle), 'candle.t');
  if (!Number.isInteger(timestamp)) {
    throw new Error('[TimeframeEngine] candle.t must be a positive integer millisecond timestamp');
  }
  if (timestamp <= 0) {
    throw new Error('[TimeframeEngine] candle.t must be a positive integer millisecond timestamp');
  }
  if (timestamp < 1_000_000_000_000) {
    throw new Error('[TimeframeEngine] candle.t must be millisecond epoch, not seconds');
  }
  const open = readNumericCandle(rawCandle, 'o', o);
  const high = readNumericCandle(rawCandle, 'h', h);
  const low = readNumericCandle(rawCandle, 'l', l);
  const close = readNumericCandle(rawCandle, 'c', c);
  if (high < Math.max(open, close)) {
    throw new Error('[TimeframeEngine] candle OHLC values are internally inconsistent');
  }
  if (low > Math.min(open, close)) {
    throw new Error('[TimeframeEngine] candle OHLC values are internally inconsistent');
  }
  if (high < low) {
    throw new Error('[TimeframeEngine] candle OHLC values are internally inconsistent');
  }
  const volume = assertFiniteNumber(v(rawCandle), 'candle.v');
  const explicitTimeframe = rawCandle.timeframe;
  if (explicitTimeframe !== undefined && explicitTimeframe !== timeframe) {
    throw new Error(`[TimeframeEngine] raw base candle timeframe '${explicitTimeframe}' does not match baseTimeframe '${timeframe}'`);
  }
  return {
    ...rawCandle,
    symbol,
    timeframe,
    t: timestamp,
    etime: Number.isFinite(Number(rawCandle.etime)) ? Number(rawCandle.etime) : timestamp + TIMEFRAME_MS[timeframe],
    o: open,
    h: high,
    l: low,
    c: close,
    v: volume,
  };
}

class TimeframeEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = normalizeConfig(config);
    this.candles = new Map();
    this.pending = new Map();
    this.subscriptions = new Map();
    this.nextSubscriptionId = 1;
    this.stats = {
      rawCandles: 0,
      barsEmitted: 0,
      aggregateBarsClosed: 0,
      subscriberDeliveries: 0,
    };

    for (const timeframe of this.config.timeframes) {
      this.candles.set(timeframe, []);
      this.pending.set(timeframe, null);
    }
  }

  addRawCandle(rawCandle) {
    const base = normalizeRawBaseCandle(
      rawCandle,
      this.config.symbol,
      this.config.baseTimeframe
    );
    const baseMs = TIMEFRAME_MS[this.config.baseTimeframe];
    if (base.t % baseMs !== 0) {
      throw new Error(`[TimeframeEngine] ${this.config.baseTimeframe} candle is not aligned to its timeframe boundary`);
    }

    this.stats.rawCandles += 1;
    const closedBars = [];
    const storedBase = this._storeClosedBar(this.config.baseTimeframe, base);
    closedBars.push(storedBase);

    for (const timeframe of this.config.timeframes) {
      if (timeframe === this.config.baseTimeframe) continue;
      const closed = this._advanceAggregate(timeframe, base);
      if (closed) closedBars.push(closed);
    }
    return closedBars;
  }

  flushClosedBars(watermarkMs) {
    const watermark = assertFiniteNumber(watermarkMs, 'watermarkMs');
    const closedBars = [];
    for (const timeframe of this.config.timeframes) {
      if (timeframe === this.config.baseTimeframe) continue;
      const pending = this.pending.get(timeframe);
      if (!pending) continue;
      const timeframeMs = TIMEFRAME_MS[timeframe];
      if (pending.t + timeframeMs <= watermark) {
        this.pending.set(timeframe, null);
        closedBars.push(this._storeClosedBar(timeframe, pending));
      }
    }
    return closedBars;
  }

  subscribe(strategyName, timeframes, handler) {
    const strategy = assertText(strategyName, 'strategyName');
    if (!Array.isArray(timeframes)) {
      throw new Error('[TimeframeEngine] subscribe timeframes must be a non-empty array');
    }
    if (timeframes.length === 0) {
      throw new Error('[TimeframeEngine] subscribe timeframes must be a non-empty array');
    }
    if (typeof handler !== 'function') {
      throw new Error('[TimeframeEngine] subscribe handler must be a function');
    }
    const normalizedTimeframes = uniqueTimeframes(timeframes);
    for (const timeframe of normalizedTimeframes) {
      if (!this.candles.has(timeframe)) {
        throw new Error(`[TimeframeEngine] strategy '${strategy}' subscribed to unconfigured timeframe '${timeframe}'`);
      }
    }

    const id = this.nextSubscriptionId;
    this.nextSubscriptionId += 1;
    const subscription = Object.freeze({
      id,
      strategy,
      timeframes: Object.freeze(normalizedTimeframes),
      handler,
    });
    this.subscriptions.set(id, subscription);
    return () => {
      this.subscriptions.delete(id);
    };
  }

  getCandles(timeframe, limit = null) {
    const normalized = assertSupportedTimeframe(timeframe, 'timeframe');
    const source = this.candles.get(normalized);
    if (!source) {
      throw new Error(`[TimeframeEngine] timeframe '${normalized}' is not configured`);
    }
    if (limit === null) return source.slice();
    const numericLimit = Number(limit);
    if (!Number.isInteger(numericLimit)) {
      throw new Error('[TimeframeEngine] limit must be a positive integer when provided');
    }
    if (numericLimit <= 0) {
      throw new Error('[TimeframeEngine] limit must be a positive integer when provided');
    }
    return source.slice(-numericLimit);
  }

  getLatest(timeframe) {
    const candles = this.getCandles(timeframe);
    return candles.length > 0 ? candles[candles.length - 1] : null;
  }

  getPending(timeframe) {
    const normalized = assertSupportedTimeframe(timeframe, 'timeframe');
    if (!this.pending.has(normalized)) {
      throw new Error(`[TimeframeEngine] timeframe '${normalized}' is not configured`);
    }
    const pending = this.pending.get(normalized);
    return pending ? { ...pending } : null;
  }

  getSnapshot() {
    const counts = {};
    const pending = {};
    for (const timeframe of this.config.timeframes) {
      counts[timeframe] = this.candles.get(timeframe).length;
      const pendingBar = this.pending.get(timeframe);
      pending[timeframe] = pendingBar ? { t: pendingBar.t, c: pendingBar.c, v: pendingBar.v, timeframe } : null;
    }
    return {
      symbol: this.config.symbol,
      baseTimeframe: this.config.baseTimeframe,
      timeframes: this.config.timeframes.slice(),
      counts,
      pending,
      stats: { ...this.stats },
    };
  }

  destroy() {
    this.removeAllListeners();
    this.candles.clear();
    this.pending.clear();
    this.subscriptions.clear();
  }

  _advanceAggregate(timeframe, baseCandle) {
    const timeframeMs = TIMEFRAME_MS[timeframe];
    const periodStart = Math.floor(baseCandle.t / timeframeMs) * timeframeMs;
    let pending = this.pending.get(timeframe);
    let closed = null;

    if (!pending) {
      pending = this._bornAggregate(timeframe, periodStart, baseCandle);
    } else if (pending.t !== periodStart) {
      closed = this._storeClosedBar(timeframe, pending);
      this.stats.aggregateBarsClosed += 1;
      pending = this._bornAggregate(timeframe, periodStart, baseCandle);
    } else {
      pending = {
        ...pending,
        h: Math.max(pending.h, baseCandle.h),
        l: Math.min(pending.l, baseCandle.l),
        c: baseCandle.c,
        v: pending.v + baseCandle.v,
        etime: baseCandle.etime,
        sourceCount: pending.sourceCount + 1,
      };
    }

    this.pending.set(timeframe, pending);
    return closed;
  }

  _bornAggregate(timeframe, periodStart, baseCandle) {
    return {
      symbol: this.config.symbol,
      timeframe,
      t: periodStart,
      etime: baseCandle.etime,
      o: baseCandle.o,
      h: baseCandle.h,
      l: baseCandle.l,
      c: baseCandle.c,
      v: baseCandle.v,
      sourceTimeframe: this.config.baseTimeframe,
      sourceCount: 1,
    };
  }

  _storeClosedBar(timeframe, bar) {
    const stamped = {
      ...bar,
      symbol: this.config.symbol,
      timeframe,
    };
    const history = this.candles.get(timeframe);
    const previous = history[history.length - 1];
    if (previous && previous.t === stamped.t) {
      history[history.length - 1] = stamped;
    } else {
      history.push(stamped);
      const max = this.config.maxCandles[timeframe];
      if (history.length > max) {
        history.splice(0, history.length - max);
      }
    }
    this.stats.barsEmitted += 1;
    this._deliverBar(timeframe, stamped);
    return stamped;
  }

  _deliverBar(timeframe, bar) {
    this.emit('bar', bar);
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.timeframes.includes(timeframe)) continue;
      subscription.handler({
        strategy: subscription.strategy,
        timeframe,
        bar,
      });
      this.stats.subscriberDeliveries += 1;
    }
  }

  static getTimeframeMs(timeframe) {
    const normalized = assertSupportedTimeframe(timeframe, 'timeframe');
    return TIMEFRAME_MS[normalized];
  }

  static getSupportedTimeframes() {
    return Object.keys(TIMEFRAME_MS);
  }
}

module.exports = {
  TimeframeEngine,
  TIMEFRAME_MS,
};
