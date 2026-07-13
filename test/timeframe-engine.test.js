'use strict';

const fs = require('fs');
const path = require('path');
const { TimeframeEngine } = require('../core/TimeframeEngine');

const ALL_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const MAX_CANDLES = Object.freeze({
  '1m': 30,
  '5m': 30,
  '15m': 30,
  '30m': 30,
  '1h': 30,
  '4h': 30,
  '1d': 30,
});

function makeEngine(overrides = {}) {
  return new TimeframeEngine({
    symbol: 'TSLA',
    baseTimeframe: '1m',
    timeframes: ALL_TIMEFRAMES,
    maxCandles: MAX_CANDLES,
    ...overrides,
  });
}

function minuteCandle(t, values = {}) {
  const close = values.c ?? values.close ?? 100;
  return {
    t,
    o: values.o ?? close,
    h: values.h ?? close,
    l: values.l ?? close,
    c: close,
    v: values.v ?? 1,
  };
}

function expandKnown15mBarToMinutes(bar) {
  const perMinuteVolume = bar.v / 15;
  const minutes = [];
  for (let index = 0; index < 15; index += 1) {
    const minute = {
      t: bar.t + index * 60_000,
      o: bar.o,
      h: bar.o,
      l: bar.o,
      c: bar.o,
      v: perMinuteVolume,
    };
    if (index === 0) {
      minute.o = bar.o;
      minute.h = Math.max(bar.o, bar.h);
      minute.l = Math.min(bar.o, bar.l);
      minute.c = bar.o;
    }
    if (index === 14) {
      minute.c = bar.c;
      minute.h = Math.max(minute.h, bar.c);
      minute.l = Math.min(minute.l, bar.c);
    }
    minutes.push(minute);
  }
  return minutes;
}

function closeEnough(actual, expected) {
  expect(actual).toBeCloseTo(expected, 8);
}

describe('TimeframeEngine', () => {
  test('requires explicit config keys and refuses implicit defaults', () => {
    expect(() => new TimeframeEngine({
      symbol: 'TSLA',
      baseTimeframe: '1m',
      timeframes: ['1m', '15m'],
    })).toThrow(/config.maxCandles required/);

    expect(() => new TimeframeEngine({
      symbol: 'TSLA',
      baseTimeframe: '1m',
      timeframes: ['15m'],
      maxCandles: { '15m': 10 },
    })).toThrow(/must include baseTimeframe '1m'/);
  });

  test('stamps every born base and aggregate bar with timeframe identity', () => {
    const engine = makeEngine({ timeframes: ['1m', '5m'], maxCandles: { '1m': 10, '5m': 10 } });
    const start = Date.UTC(2026, 0, 5, 14, 30, 0);

    for (let index = 0; index < 5; index += 1) {
      engine.addRawCandle(minuteCandle(start + index * 60_000, {
        o: 100 + index,
        h: 101 + index,
        l: 99 + index,
        c: 100.5 + index,
        v: 10 + index,
      }));
    }
    engine.flushClosedBars(start + 5 * 60_000);

    expect(engine.getCandles('1m')).toHaveLength(5);
    expect(engine.getCandles('1m').every(candle => candle.timeframe === '1m')).toBe(true);
    expect(engine.getCandles('1m').every(candle => candle.symbol === 'TSLA')).toBe(true);

    const fiveMinute = engine.getLatest('5m');
    expect(fiveMinute).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      timeframe: '5m',
      sourceTimeframe: '1m',
      sourceCount: 5,
      o: 100,
      h: 105,
      l: 99,
      c: 104.5,
      v: 60,
    }));
  });

  test('routes subscribed strategy handlers only to declared timeframes', () => {
    const engine = makeEngine({ timeframes: ['1m', '5m', '15m'], maxCandles: { '1m': 20, '5m': 20, '15m': 20 } });
    const start = Date.UTC(2026, 0, 5, 14, 30, 0);
    const fastDeliveries = [];
    const slowDeliveries = [];

    engine.subscribe('FastStrategy', ['1m'], delivery => fastDeliveries.push(delivery));
    engine.subscribe('SlowStrategy', ['5m', '15m'], delivery => slowDeliveries.push(delivery));

    for (let index = 0; index < 15; index += 1) {
      engine.addRawCandle(minuteCandle(start + index * 60_000, { c: 100 + index, v: 1 }));
    }
    engine.flushClosedBars(start + 15 * 60_000);

    expect(fastDeliveries).toHaveLength(15);
    expect(fastDeliveries.every(delivery => delivery.strategy === 'FastStrategy')).toBe(true);
    expect(fastDeliveries.every(delivery => delivery.timeframe === '1m')).toBe(true);
    expect(slowDeliveries.map(delivery => delivery.timeframe)).toEqual(['5m', '5m', '5m', '15m']);
    expect(slowDeliveries.every(delivery => delivery.strategy === 'SlowStrategy')).toBe(true);
  });

  test('enforces bounded memory per configured timeframe', () => {
    const engine = makeEngine({ timeframes: ['1m', '5m'], maxCandles: { '1m': 4, '5m': 2 } });
    const start = Date.UTC(2026, 0, 5, 14, 30, 0);

    for (let index = 0; index < 15; index += 1) {
      engine.addRawCandle(minuteCandle(start + index * 60_000, { c: 100 + index, v: 1 }));
    }
    engine.flushClosedBars(start + 15 * 60_000);

    expect(engine.getCandles('1m')).toHaveLength(4);
    expect(engine.getCandles('1m')[0].t).toBe(start + 11 * 60_000);
    expect(engine.getCandles('5m')).toHaveLength(2);
    expect(engine.getCandles('5m').map(candle => candle.t)).toEqual([
      start + 5 * 60_000,
      start + 10 * 60_000,
    ]);
  });

  test('aggregates 1m to 15m to match tracked TSLA 15m bars over an overlap window', () => {
    const fixturePath = path.join(__dirname, '..', 'tuning', 'tsla-15m-18mo.json');
    const known15m = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).slice(20, 32);
    const engine = makeEngine({ timeframes: ['1m', '15m'], maxCandles: { '1m': 200, '15m': 50 } });

    for (const knownBar of known15m) {
      for (const rawMinute of expandKnown15mBarToMinutes(knownBar)) {
        engine.addRawCandle(rawMinute);
      }
    }
    const lastKnown = known15m[known15m.length - 1];
    engine.flushClosedBars(lastKnown.t + 15 * 60_000);

    const aggregated = engine.getCandles('15m');
    expect(aggregated).toHaveLength(known15m.length);
    for (let index = 0; index < known15m.length; index += 1) {
      const actual = aggregated[index];
      const expected = known15m[index];
      expect(actual.timeframe).toBe('15m');
      expect(actual.symbol).toBe('TSLA');
      expect(actual.t).toBe(expected.t);
      closeEnough(actual.o, expected.o);
      closeEnough(actual.h, expected.h);
      closeEnough(actual.l, expected.l);
      closeEnough(actual.c, expected.c);
      closeEnough(actual.v, expected.v);
      expect(actual.sourceTimeframe).toBe('1m');
      expect(actual.sourceCount).toBe(15);
    }
  });

  test('refuses unstamped non-base input masquerading as raw feed', () => {
    const engine = makeEngine({ timeframes: ['1m', '15m'], maxCandles: { '1m': 10, '15m': 10 } });
    expect(() => engine.addRawCandle({
      timeframe: '15m',
      t: Date.UTC(2026, 0, 5, 14, 30, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 10,
    })).toThrow(/does not match baseTimeframe '1m'/);
  });
});
