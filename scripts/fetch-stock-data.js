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

function optionalText(config, key) {
  const value = String(config?.[key] || '').trim();
  return value || null;
}

function withOptionalDownloadConfig(config, env = process.env) {
  return {
    ...config,
    startDate: optionalText(config, 'startDate') || optionalText(env, 'ALPACA_STOCK_DOWNLOAD_START'),
    endDate: optionalText(config, 'endDate') || optionalText(env, 'ALPACA_STOCK_DOWNLOAD_END'),
    outputFile: optionalText(config, 'outputFile') || optionalText(env, 'ALPACA_STOCK_DOWNLOAD_OUTPUT_FILE'),
    sessionProfile: optionalText(config, 'sessionProfile') || optionalText(env, 'ALPACA_STOCK_DOWNLOAD_SESSION_PROFILE') || 'alpaca_bars_no_session_filter',
  };
}

function resolveDownloadRange(config) {
  const endDate = config.endDate ? new Date(config.endDate) : new Date();
  const startDate = config.startDate ? new Date(config.startDate) : new Date(endDate);
  if (!config.startDate) {
    startDate.setFullYear(startDate.getFullYear() - config.years);
  }
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    throw new Error(`[fetch-stock-data] Invalid download range start=${config.startDate || '(years-derived)'} end=${config.endDate || '(now)'}`);
  }
  return { startDate, endDate };
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

  const range = resolveDownloadRange(config);
  console.log(`Fetching ${symbol} (${config.timeframe}, ${range.startDate.toISOString()} to ${range.endDate.toISOString()})...`);

  const allBars = [];
  const errors = [];

  let currentStart = new Date(range.startDate);

  while (currentStart < range.endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + config.chunkMonths);
    if (chunkEnd > range.endDate) chunkEnd.setTime(range.endDate.getTime());

    const startStr = currentStart.toISOString();
    const endStr = chunkEnd.toISOString();

    try {
      const bars = await fetchBars(symbol, startStr, endStr, config);
      allBars.push(...bars);

      process.stdout.write(`\r   ${currentStart.toISOString().split('T')[0]} -> ${chunkEnd.toISOString().split('T')[0]}: +${bars.length} (total: ${allBars.length})`);

      await new Promise(r => setTimeout(r, config.rateLimitMs));
    } catch (error) {
      console.error(`\n   Error: ${error.message}`);
      errors.push(`${startStr} -> ${endStr}: ${error.message}`);
    }

    currentStart = new Date(chunkEnd);
  }

  if (errors.length > 0) {
    throw new Error(`[fetch-stock-data] ${symbol} download failed for ${errors.length} chunk(s): ${errors.join('; ')}`);
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

function buildOutputPayload(symbol, candles, config, range) {
  return {
    metadata: {
      provider: 'alpaca',
      feed: config.feed,
      feedType: config.feed === 'iex' ? 'single-exchange' : 'unknown',
      adjustment: config.adjustment,
      sessionProfile: config.sessionProfile,
      timestampConvention: 'bar_start_ms_aligned',
      symbol,
      timeframe: config.filenameTimeframe,
      alpacaTimeframe: config.timeframe,
      requestedStart: range.startDate.toISOString(),
      requestedEnd: range.endDate.toISOString(),
      firstTimestamp: candles[0]?.t ?? null,
      firstIso: candles[0] ? new Date(candles[0].t).toISOString() : null,
      lastTimestamp: candles[candles.length - 1]?.t ?? null,
      lastIso: candles[candles.length - 1] ? new Date(candles[candles.length - 1].t).toISOString() : null,
      candleCount: candles.length,
      generatedAt: new Date().toISOString(),
      source: 'scripts/fetch-stock-data.js',
    },
    candles,
  };
}

function outputFilename(symbol, config, range) {
  if (config.outputFile) return path.basename(config.outputFile);
  const rangeSuffix = config.startDate || config.endDate
    ? `${range.startDate.toISOString().slice(0, 10)}_${range.endDate.toISOString().slice(0, 10)}`
    : `${config.years}y`;
  return `alpaca-${symbol.toLowerCase()}-${config.filenameTimeframe}-${rangeSuffix}.json`;
}

async function main(config = resolveAlpacaStockDownloadConfig(process.env)) {
  const resolvedConfig = withOptionalDownloadConfig(config);
  assertDownloadConfig(resolvedConfig);

  const outputDir = path.resolve(process.cwd(), resolvedConfig.outputDir);
  const range = resolveDownloadRange(resolvedConfig);
  console.log('Alpaca Stock Data Fetcher');
  console.log('============================');
  console.log(`Symbols: ${resolvedConfig.symbols.join(', ')}`);
  console.log(`Interval: ${resolvedConfig.timeframe}, Range: ${range.startDate.toISOString()} to ${range.endDate.toISOString()}`);
  console.log(`Output: ${outputDir}\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const symbol of resolvedConfig.symbols) {
    try {
      const rawBars = await fetchAllData(symbol, resolvedConfig);

      if (rawBars.length === 0) {
        console.log(`No data for ${symbol}\n`);
        continue;
      }

      const candles = convertFormat(rawBars);

      const filename = outputFilename(symbol, resolvedConfig, range);
      const filepath = resolvedConfig.outputFile
        ? path.resolve(process.cwd(), resolvedConfig.outputFile)
        : path.join(outputDir, filename);
      const payload = buildOutputPayload(symbol, candles, resolvedConfig, range);

      fs.writeFileSync(filepath, `${JSON.stringify(payload, null, 2)}\n`);

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
  buildOutputPayload,
  convertFormat,
  fetchAllData,
  fetchBars,
  main,
  outputFilename,
  resolveDownloadRange,
  withOptionalDownloadConfig,
};
