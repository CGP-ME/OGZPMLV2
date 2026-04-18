#!/usr/bin/env node
/**
 * Download TSLA 15m walkback data from Polygon.io
 * Date range: Mar 19 2023 - Mar 18 2024 (1 year immediately BEFORE the training window)
 * Purpose: Out-of-sample pre-training validation
 * Training window was: Mar 19 2024 - Feb 3 2026 (tsla-15m-2y.json)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.POLYGON_API_KEY;
const SYMBOL = 'TSLA';
const MULTIPLIER = 15;
const TIMESPAN = 'minute';
const START_DATE = '2023-03-19';
const END_DATE = '2024-03-18';
const OUTPUT_FILE = path.join(__dirname, '../tuning/15m-tsla-1yr-walkback.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCandles(from, to) {
  const url = `https://api.polygon.io/v2/aggs/ticker/${SYMBOL}/range/${MULTIPLIER}/${TIMESPAN}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${API_KEY}`;

  console.log(`Fetching ${from} to ${to}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(`Polygon API error: ${data.error}`);
  }

  return data.results || [];
}

async function downloadAll() {
  console.log(`Downloading ${SYMBOL} ${MULTIPLIER}m candles from ${START_DATE} to ${END_DATE}`);
  console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'MISSING!'}`);

  if (!API_KEY) {
    console.error('ERROR: POLYGON_API_KEY not found in .env');
    process.exit(1);
  }

  const allCandles = [];

  const startDate = new Date(START_DATE);
  const endDate = new Date(END_DATE);

  let currentStart = new Date(startDate);

  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setMonth(currentEnd.getMonth() + 1);
    if (currentEnd > endDate) {
      currentEnd.setTime(endDate.getTime());
    }

    const fromStr = currentStart.toISOString().split('T')[0];
    const toStr = currentEnd.toISOString().split('T')[0];

    try {
      const candles = await fetchCandles(fromStr, toStr);
      console.log(`  Got ${candles.length} candles`);

      for (const c of candles) {
        allCandles.push({
          t: c.t,
          o: c.o,
          h: c.h,
          l: c.l,
          c: c.c,
          v: c.v
        });
      }

      await sleep(300);

    } catch (err) {
      console.error(`Error fetching ${fromStr} to ${toStr}:`, err.message);
    }

    currentStart = currentEnd;
  }

  allCandles.sort((a, b) => a.t - b.t);
  const uniqueCandles = [];
  let lastT = 0;
  for (const c of allCandles) {
    if (c.t !== lastT) {
      uniqueCandles.push(c);
      lastT = c.t;
    }
  }

  console.log(`\nTotal unique candles: ${uniqueCandles.length}`);

  if (uniqueCandles.length > 0) {
    const firstDate = new Date(uniqueCandles[0].t);
    const lastDate = new Date(uniqueCandles[uniqueCandles.length - 1].t);
    console.log(`Date range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueCandles));
  console.log(`Saved to ${OUTPUT_FILE}`);

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

downloadAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
