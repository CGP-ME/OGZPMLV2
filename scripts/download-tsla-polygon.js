#!/usr/bin/env node
/**
 * Download TSLA 15m candle data from Polygon.io
 * Date range: Sep 3 2024 - Mar 27 2026 (18 months for TradingView cross-verification)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.POLYGON_API_KEY;
const SYMBOL = 'TSLA';
const MULTIPLIER = 15;
const TIMESPAN = 'minute';
const START_DATE = '2024-09-03';
const END_DATE = '2026-03-27';
const OUTPUT_FILE = path.join(__dirname, '../tuning/tsla-15m-18mo.json');

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

  // Split into monthly chunks to avoid API limits
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

      // Transform to our format
      for (const c of candles) {
        allCandles.push({
          t: c.t,  // timestamp in ms
          o: c.o,  // open
          h: c.h,  // high
          l: c.l,  // low
          c: c.c,  // close
          v: c.v   // volume
        });
      }

      // Rate limit: 5 calls/min for free tier
      await sleep(300);

    } catch (err) {
      console.error(`Error fetching ${fromStr} to ${toStr}:`, err.message);
    }

    currentStart = currentEnd;
  }

  // Sort by timestamp and dedupe
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

  // Show date range
  if (uniqueCandles.length > 0) {
    const firstDate = new Date(uniqueCandles[0].t);
    const lastDate = new Date(uniqueCandles[uniqueCandles.length - 1].t);
    console.log(`Date range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`);
  }

  // Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueCandles));
  console.log(`Saved to ${OUTPUT_FILE}`);

  // File size
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

downloadAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
