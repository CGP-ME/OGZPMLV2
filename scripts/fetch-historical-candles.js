#!/usr/bin/env node
/**
 * Fetch Historical Candles from Kraken REST API
 * Paginates to get more than the ~720 limit per call
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KRAKEN_BASE = 'https://api.kraken.com';

async function fetchHistoricalCandles(options = {}) {
  const {
    pair = 'XBTUSD',
    interval = 5,           // 5-minute candles
    totalCandles = 60000,   // How many we want
    outputFile = path.join(__dirname, '../data/kraken-fresh-candles.json')
  } = options;

  console.log('='.repeat(60));
  console.log('  KRAKEN HISTORICAL CANDLE FETCHER');
  console.log('='.repeat(60));
  console.log(`  Pair: ${pair}`);
  console.log(`  Interval: ${interval}m`);
  console.log(`  Target candles: ${totalCandles.toLocaleString()}`);
  console.log('='.repeat(60));

  const allCandles = [];
  const intervalMs = interval * 60 * 1000;
  const candlesPerCall = 720;
  const callsNeeded = Math.ceil(totalCandles / candlesPerCall);

  // Start from current time and work backwards
  let endTime = Date.now();
  let callsMade = 0;

  while (allCandles.length < totalCandles && callsMade < callsNeeded + 5) {
    callsMade++;

    // Calculate 'since' for this batch (going backwards in time)
    const since = Math.floor((endTime - (candlesPerCall * intervalMs)) / 1000);

    try {
      const url = `${KRAKEN_BASE}/0/public/OHLC?pair=${pair}&interval=${interval}&since=${since}`;
      process.stdout.write(`\r  Fetching batch ${callsMade}/${callsNeeded}... (${allCandles.length.toLocaleString()} candles so far)`);

      const response = await axios.get(url, { timeout: 30000 });

      if (response.data.error && response.data.error.length > 0) {
        console.error(`\n  Error: ${response.data.error.join(', ')}`);
        break;
      }

      const result = response.data.result;
      const pairKey = Object.keys(result).find(k => k !== 'last');

      if (!pairKey || !result[pairKey] || result[pairKey].length === 0) {
        console.log('\n  No more data available');
        break;
      }

      const candles = result[pairKey];

      // Convert to our format
      const formatted = candles.map(c => ({
        timestamp: parseFloat(c[0]) * 1000,
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[6])
      }));

      // Filter out duplicates and add to collection
      const existingTimes = new Set(allCandles.map(c => c.timestamp));
      const newCandles = formatted.filter(c => !existingTimes.has(c.timestamp));
      allCandles.push(...newCandles);

      // Move endTime back for next batch
      if (formatted.length > 0) {
        endTime = formatted[0].timestamp;
      } else {
        break;
      }

      // Rate limit - Kraken allows ~1 req/sec
      await new Promise(r => setTimeout(r, 1100));

    } catch (error) {
      console.error(`\n  Fetch error: ${error.message}`);
      if (error.message.includes('429') || error.message.includes('rate')) {
        console.log('  Rate limited, waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));
      } else {
        break;
      }
    }
  }

  // Sort by timestamp (oldest first)
  allCandles.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\n\n  Total candles fetched: ${allCandles.length.toLocaleString()}`);

  if (allCandles.length > 0) {
    const startDate = new Date(allCandles[0].timestamp).toISOString().split('T')[0];
    const endDate = new Date(allCandles[allCandles.length - 1].timestamp).toISOString().split('T')[0];
    console.log(`  Date range: ${startDate} to ${endDate}`);

    // Save to file
    fs.writeFileSync(outputFile, JSON.stringify(allCandles, null, 2));
    console.log(`  Saved to: ${outputFile}`);

    // Calculate stats
    const totalDays = (allCandles[allCandles.length - 1].timestamp - allCandles[0].timestamp) / (24 * 60 * 60 * 1000);
    console.log(`  Time span: ${totalDays.toFixed(1)} days`);
  }

  return allCandles;
}

// Run if called directly
if (require.main === module) {
  const totalCandles = parseInt(process.argv[2]) || 60000;
  const interval = parseInt(process.argv[3]) || 5;

  fetchHistoricalCandles({
    totalCandles,
    interval,
    pair: 'XBTUSD'
  }).then(() => {
    console.log('\n  Done!');
  }).catch(err => {
    console.error('  Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { fetchHistoricalCandles };
