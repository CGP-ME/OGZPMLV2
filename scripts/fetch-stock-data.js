#!/usr/bin/env node
/**
 * Fetch historical stock data from Alpaca
 * Downloads 15-minute candles for 2 years
 * Uses paper/sandbox API keys
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { resolveAlpacaStockDownloadConfig } = require('../server/dashboard-stock-stream-config');

function missingDownloadConfigFields(config) {
  const missing = [];
  if (!String(config?.apiKey || '').trim()) missing.push('ALPACA_API_KEY');
  if (!String(config?.apiSecret || '').trim()) missing.push('ALPACA_API_SECRET');
  if (!String(config?.dataUrl || '').trim()) missing.push('ALPACA_STOCK_DATA_URL');
  if (!String(config?.feed || '').trim()) missing.push('ALPACA_STOCK_DATA_FEED');
  if (!String(config?.adjustment || '').trim()) missing.push('ALPACA_STOCK_DATA_ADJUSTMENT');
  if (!Array.isArray(config?.symbols) || config.symbols.length === 0) missing.push('ALPACA_STOCK_DOWNLOAD_SYMBOLS');
  if (!String(config?.outputDir || '').trim()) missing.push('ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR');
  if (!Number.isInteger(config?.years) || config.years <= 0) missing.push('ALPACA_STOCK_DOWNLOAD_YEARS');
  if (!String(config?.timeframe || '').trim()) missing.push('ALPACA_STOCK_DOWNLOAD_TIMEFRAME');
  if (!String(config?.filenameTimeframe || '').trim()) missing.push('ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME');
  if (!Number.isInteger(config?.limit) || config.limit <= 0) missing.push('ALPACA_STOCK_DOWNLOAD_LIMIT');
  if (!Number.isInteger(config?.chunkMonths) || config.chunkMonths <= 0) missing.push('ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS');
  if (!Number.isInteger(config?.rateLimitMs) || config.rateLimitMs <= 0) missing.push('ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS');
  return missing;
}

function assertDownloadConfig(config) {
  const missing = missingDownloadConfigFields(config);
  if (missing.length > 0) {
    throw new Error(`[fetch-stock-data] Missing required Alpaca stock download config: ${missing.join(', ')}`);
  }
}

async function fetchBars(symbol, start, end, config) {
  assertDownloadConfig(config);

  const params = new URLSearchParams({
    start: start,
    end: end,
    timeframe: config.timeframe,
    limit: String(config.limit),
    adjustment: config.adjustment,
    feed: config.feed
  });

  const url = `${config.dataUrl}/${symbol}/bars?${params}`;

  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': config.apiKey,
      'APCA-API-SECRET-KEY': config.apiSecret
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.bars || [];
}

async function fetchAllData(symbol, config) {
  assertDownloadConfig(config);

  console.log(`Fetching ${symbol} (${config.timeframe}, ${config.years} years)...`);

  const allBars = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - config.years);

  let currentStart = new Date(startDate);

  while (currentStart < endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + config.chunkMonths);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const startStr = currentStart.toISOString();
    const endStr = chunkEnd.toISOString();

    try {
      const bars = await fetchBars(symbol, startStr, endStr, config);
      allBars.push(...bars);

      process.stdout.write(`\r   ${currentStart.toISOString().split('T')[0]} -> ${chunkEnd.toISOString().split('T')[0]}: +${bars.length} (total: ${allBars.length})`);

      await new Promise(r => setTimeout(r, config.rateLimitMs));
    } catch (error) {
      console.error(`\n   Error: ${error.message}`);
    }

    currentStart = new Date(chunkEnd);
  }

  console.log();
  return allBars;
}

function convertFormat(bars) {
  // Alpaca: { t, o, h, l, c, v, n, vw }
  // Our format: { t, o, h, l, c, v }
  return bars.map(b => ({
    t: new Date(b.t).getTime(),
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v
  }));
}

async function main(config = resolveAlpacaStockDownloadConfig(process.env)) {
  assertDownloadConfig(config);

  const outputDir = path.resolve(process.cwd(), config.outputDir);
  console.log('Alpaca Stock Data Fetcher');
  console.log('============================');
  console.log(`Symbols: ${config.symbols.join(', ')}`);
  console.log(`Interval: ${config.timeframe}, Range: ${config.years} years`);
  console.log(`Output: ${outputDir}\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const symbol of config.symbols) {
    try {
      const rawBars = await fetchAllData(symbol, config);

      if (rawBars.length === 0) {
        console.log(`No data for ${symbol}\n`);
        continue;
      }

      const candles = convertFormat(rawBars);

      const filename = `${symbol.toLowerCase()}-${config.filenameTimeframe}-${config.years}y.json`;
      const filepath = path.join(outputDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(candles));

      const firstDate = new Date(candles[0].t).toISOString().split('T')[0];
      const lastDate = new Date(candles[candles.length - 1].t).toISOString().split('T')[0];
      const priceChange = ((candles[candles.length - 1].c / candles[0].o - 1) * 100).toFixed(2);

      console.log(`${symbol}: ${candles.length} candles (${firstDate} to ${lastDate})`);
      console.log(`   $${candles[0].o.toFixed(2)} -> $${candles[candles.length - 1].c.toFixed(2)} (${priceChange}%)`);
      console.log(`   ${filepath}\n`);

    } catch (error) {
      console.error(`Failed ${symbol}: ${error.message}\n`);
    }
  }

  console.log('Done!');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  convertFormat,
  fetchAllData,
  fetchBars,
  main,
};
