'use strict';

const fs = require('fs');
const path = require('path');
const { TimeframeEngine } = require('../core/TimeframeEngine');

const DATA_FILE = path.join(__dirname, '..', 'tuning', 'tsla-1m-2y.json');
const SYMBOL = 'TSLA';
const START_MS = Date.parse('2024-07-15T14:00:00.000Z');
const END_MS = Date.parse('2024-07-15T15:00:00.000Z');
const FRAMES = ['1m', '5m', '15m', '1h'];
const FRAME_MS = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

function timestampOf(candle) {
  return Number(candle.t ?? candle.timestamp ?? candle.time);
}

function normalize(candle) {
  return {
    t: timestampOf(candle),
    o: Number(candle.o ?? candle.open),
    h: Number(candle.h ?? candle.high),
    l: Number(candle.l ?? candle.low),
    c: Number(candle.c ?? candle.close),
    v: Number(candle.v ?? candle.volume ?? 0),
  };
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

function lineForBar(prefix, bar) {
  return `${prefix} frame=${bar.timeframe} t=${iso(bar.t)} o=${fmt(bar.o)} h=${fmt(bar.h)} l=${fmt(bar.l)} c=${fmt(bar.c)} v=${fmt(bar.v)}`;
}

function aggregateByHand(rows, timeframe, periodStart) {
  const frameMs = FRAME_MS[timeframe];
  const slice = rows.filter(row => row.t >= periodStart && row.t < periodStart + frameMs);
  if (slice.length === 0) {
    throw new Error(`No raw rows for ${timeframe} ${iso(periodStart)}`);
  }
  return {
    timeframe,
    t: periodStart,
    o: slice[0].o,
    h: Math.max(...slice.map(row => row.h)),
    l: Math.min(...slice.map(row => row.l)),
    c: slice[slice.length - 1].c,
    v: slice.reduce((sum, row) => sum + row.v, 0),
    sourceCount: slice.length,
  };
}

function barsEqual(left, right) {
  return ['t', 'o', 'h', 'l', 'c', 'v'].every((field) => Math.abs(Number(left[field]) - Number(right[field])) < 1e-9);
}

function loadProbeRows() {
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const allRows = (Array.isArray(parsed) ? parsed : parsed.candles).map(normalize);
  return allRows.filter(row => row.t >= START_MS && row.t <= END_MS);
}

function main() {
  const rows = loadProbeRows();
  const tfe = new TimeframeEngine({
    symbol: SYMBOL,
    baseTimeframe: '1m',
    timeframes: FRAMES,
    maxCandles: {
      '1m': 500,
      '5m': 500,
      '15m': 500,
      '1h': 500,
    },
  });

  const emitted = [];
  tfe.on('bar', bar => {
    emitted.push(bar);
    console.log(lineForBar('CLOSED', bar));
  });

  console.log(`SOURCE file=${path.relative(path.join(__dirname, '..'), DATA_FILE)}`);
  console.log('SOURCE loader=BacktestRunner parsedData.candles || parsedData');
  console.log(`SOURCE symbol=${SYMBOL} base=1m frames=${FRAMES.join(',')}`);
  console.log(`SOURCE windowStart=${iso(START_MS)} windowEnd=${iso(END_MS)}`);
  console.log(`SOURCE inputCandles=${rows.length}`);

  for (const row of rows) {
    tfe.addRawCandle(row);
  }

  const counts = FRAMES.reduce((acc, frame) => {
    acc[frame] = emitted.filter(bar => bar.timeframe === frame).length;
    return acc;
  }, {});
  console.log(`COUNTS input_1m=${rows.length} closed_1m=${counts['1m']} closed_5m=${counts['5m']} closed_15m=${counts['15m']} closed_1h=${counts['1h']}`);

  const compare15mT = Date.parse('2024-07-15T14:30:00.000Z');
  const compare1hT = Date.parse('2024-07-15T14:00:00.000Z');
  const emitted15m = emitted.find(bar => bar.timeframe === '15m' && bar.t === compare15mT);
  const emitted1h = emitted.find(bar => bar.timeframe === '1h' && bar.t === compare1hT);
  const hand15m = aggregateByHand(rows, '15m', compare15mT);
  const hand1h = aggregateByHand(rows, '1h', compare1hT);

  console.log(lineForBar('VERIFY emitted', emitted15m));
  console.log(`${lineForBar('VERIFY hand', hand15m)} sourceCount=${hand15m.sourceCount} match=${barsEqual(emitted15m, hand15m)}`);
  console.log(lineForBar('VERIFY emitted', emitted1h));
  console.log(`${lineForBar('VERIFY hand', hand1h)} sourceCount=${hand1h.sourceCount} match=${barsEqual(emitted1h, hand1h)}`);

  for (const frame of ['5m', '15m', '1h']) {
    const pending = tfe.getPending(frame);
    const closedContainsPending = pending
      ? emitted.some(bar => bar.timeframe === frame && bar.t === pending.t)
      : false;
    console.log(`BOUNDARY frame=${frame} pending=${pending ? iso(pending.t) : 'none'} pendingSourceCount=${pending ? pending.sourceCount : 0} closedOutputContainsPending=${closedContainsPending}`);
  }

  const pass = rows.length === 61
    && counts['1m'] === 61
    && counts['5m'] === 12
    && counts['15m'] === 4
    && counts['1h'] === 1
    && barsEqual(emitted15m, hand15m)
    && barsEqual(emitted1h, hand1h)
    && ['5m', '15m', '1h'].every((frame) => {
      const pending = tfe.getPending(frame);
      return pending && !emitted.some(bar => bar.timeframe === frame && bar.t === pending.t);
    });

  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) {
    process.exitCode = 1;
  }
}

main();
