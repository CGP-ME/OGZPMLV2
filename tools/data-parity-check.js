#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const PROJECT_ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const DEFAULT_SAME_WINDOW_START = '2026-06-01T13:30:00.000Z';
const DEFAULT_SAME_WINDOW_END = '2026-06-30T20:00:00.000Z';
const DEFAULT_SPOT_START = '2026-07-01T00:00:00.000Z';
const DEFAULT_SPOT_END = '2026-07-03T00:00:00.000Z';
const PROVIDER_PREFIXES = new Set(['alpaca', 'polygon', 'iex', 'sip']);
const TIMEFRAME_MS = Object.freeze({
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      options[arg.slice(2)] = true;
    } else {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return options;
}

function numericTime(value) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function candleTimestamp(candle) {
  return numericTime(candle?.t ?? candle?.timestamp ?? candle?.time ?? candle?.start);
}

function candleValue(candle, keys) {
  for (const key of keys) {
    const value = Number(candle?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function normalizeCandle(candle) {
  return {
    t: candleTimestamp(candle),
    o: candleValue(candle, ['o', 'open']),
    h: candleValue(candle, ['h', 'high']),
    l: candleValue(candle, ['l', 'low']),
    c: candleValue(candle, ['c', 'close']),
    v: candleValue(candle, ['v', 'volume']),
  };
}

function loadCandles(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
  const parsed = readJson(absolute);
  const rawCandles = Array.isArray(parsed) ? parsed : parsed.candles;
  if (!Array.isArray(rawCandles)) {
    throw new Error(`No candle array found in ${absolute}`);
  }
  const candles = rawCandles
    .map(normalizeCandle)
    .filter(candle => Number.isFinite(candle.t))
    .sort((a, b) => a.t - b.t);
  return {
    absolute,
    raw: parsed,
    metadata: Array.isArray(parsed) ? {} : (parsed.metadata || parsed.provenance || {}),
    candles,
  };
}

function nyParts(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function isRth(timestamp) {
  const parts = nyParts(timestamp);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 570 && minutes < 960;
}

function sessionProfile(candles) {
  let rth = 0;
  let extended = 0;
  for (const candle of candles) {
    if (isRth(candle.t)) rth += 1;
    else extended += 1;
  }
  return {
    rthBars: rth,
    extendedBars: extended,
    inferred: extended > 0 ? 'includes_pre_post_or_overnight' : 'rth_only_or_missing_extended',
  };
}

function inferProviderFromPath(filePath) {
  const tokens = path.basename(filePath, '.json').toLowerCase().split(/[-_]/).filter(Boolean);
  return tokens.find(token => PROVIDER_PREFIXES.has(token)) || null;
}

function inferTimestampConvention(candles, timeframe) {
  const interval = TIMEFRAME_MS[timeframe];
  if (!interval || candles.length === 0) return 'unknown';
  const aligned = candles.every(candle => candle.t % interval === 0);
  return aligned ? 'bar_start_ms_aligned' : 'unknown';
}

function summarizeDataFile(filePath, symbol, timeframe) {
  const loaded = loadCandles(filePath);
  const meta = loaded.metadata || {};
  const provider = meta.provider || meta.source || inferProviderFromPath(loaded.absolute);
  const feed = meta.feed || meta.alpacaFeed || (provider === 'iex' ? 'iex' : null);
  const session = meta.session || meta.sessionProfile || sessionProfile(loaded.candles).inferred;
  const timestampConvention = meta.timestampConvention || inferTimestampConvention(loaded.candles, timeframe);
  const sessionStats = sessionProfile(loaded.candles);
  const provenanceErrors = [];
  if (!provider) provenanceErrors.push('campaign data provider unknown');
  if (!feed) provenanceErrors.push('campaign feed/consolidation source unknown');
  if (!meta.session && !meta.sessionProfile) provenanceErrors.push(`campaign session handling inferred only (${session})`);
  if (!meta.timestampConvention) provenanceErrors.push(`campaign timestamp convention inferred only (${timestampConvention})`);

  return {
    ok: provenanceErrors.length === 0,
    filePath: loaded.absolute,
    symbol,
    timeframe,
    candleCount: loaded.candles.length,
    firstTimestamp: loaded.candles[0]?.t ?? null,
    firstIso: loaded.candles[0] ? new Date(loaded.candles[0].t).toISOString() : null,
    lastTimestamp: loaded.candles[loaded.candles.length - 1]?.t ?? null,
    lastIso: loaded.candles[loaded.candles.length - 1] ? new Date(loaded.candles[loaded.candles.length - 1].t).toISOString() : null,
    provider: provider || 'unknown',
    feed: feed || 'unknown',
    session,
    timestampConvention,
    sessionStats,
    errors: provenanceErrors,
    candles: loaded.candles,
  };
}

function liveSourceProvenance(symbol, timeframe) {
  return {
    provider: 'alpaca',
    feed: 'iex',
    feedType: 'single-exchange',
    adjustment: 'raw',
    restEndpoint: '/v2/stocks/{symbol}/bars',
    websocketUrl: 'wss://stream.data.alpaca.markets/v2/iex',
    sessionHandling: 'adapter requests bars without a session filter; trading availability is RTH-gated by AlpacaAdapter.isTradeableNow',
    timestampConvention: 'Alpaca bar start time converted to epoch ms',
    symbol,
    timeframe,
    codeEvidence: [
      'brokers/AlpacaAdapter.js:48',
      'brokers/AlpacaAdapter.js:513',
      'brokers/AlpacaAdapter.js:519-526',
      'brokers/AlpacaAdapter.js:723-732',
    ],
  };
}

function filterWindow(candles, start, end) {
  return candles.filter(candle => candle.t >= start && candle.t <= end);
}

function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index];
}

function summarizeDiffValues(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    max: values.length ? Math.max(...values) : null,
  };
}

function compareCandles(campaignCandles, referenceCandles, { start, end, maxCloseBps = 5 }) {
  const campaignWindow = filterWindow(campaignCandles, start, end);
  const referenceWindow = filterWindow(referenceCandles, start, end);
  const errors = [];
  if (campaignWindow.length === 0) {
    errors.push('campaign data has zero candles in same-window diff range');
  }
  if (referenceWindow.length === 0) {
    errors.push('reference/live data has zero candles in same-window diff range');
  }
  const campaignByTime = new Map(campaignWindow.map(candle => [candle.t, candle]));
  const referenceByTime = new Map(referenceWindow.map(candle => [candle.t, candle]));
  const missingInCampaign = [];
  const missingInReference = [];
  const closeBps = [];
  const volumeRatios = [];

  for (const [timestamp, reference] of referenceByTime) {
    const campaign = campaignByTime.get(timestamp);
    if (!campaign) {
      missingInCampaign.push(timestamp);
      continue;
    }
    if (Number.isFinite(reference.c) && reference.c !== 0 && Number.isFinite(campaign.c)) {
      closeBps.push(Math.abs((campaign.c - reference.c) / reference.c) * 10000);
    }
    if (Number.isFinite(reference.v) && reference.v > 0 && Number.isFinite(campaign.v)) {
      volumeRatios.push(campaign.v / reference.v);
    }
  }
  for (const timestamp of campaignByTime.keys()) {
    if (!referenceByTime.has(timestamp)) missingInReference.push(timestamp);
  }
  const closeStats = summarizeDiffValues(closeBps);
  if (closeStats.max !== null && closeStats.max > maxCloseBps) {
    errors.push(`close delta max ${closeStats.max.toFixed(4)} bps exceeds ${maxCloseBps}`);
  }
  if (missingInCampaign.length > 0) errors.push(`missing ${missingInCampaign.length} reference bars in campaign data`);
  if (missingInReference.length > 0) errors.push(`campaign has ${missingInReference.length} bars absent from reference/live data`);

  return {
    ok: errors.length === 0,
    range: {
      start,
      startIso: new Date(start).toISOString(),
      end,
      endIso: new Date(end).toISOString(),
    },
    campaignBars: campaignWindow.length,
    referenceBars: referenceWindow.length,
    matchedBars: closeBps.length,
    closeDeltaBps: closeStats,
    volumeRatio: summarizeDiffValues(volumeRatios),
    missingInCampaign: missingInCampaign.slice(0, 25).map(ts => new Date(ts).toISOString()),
    missingInReference: missingInReference.slice(0, 25).map(ts => new Date(ts).toISOString()),
    errors,
  };
}

function loadJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function floorToTimeframe(timestamp, timeframe) {
  const interval = TIMEFRAME_MS[timeframe];
  return interval ? Math.floor(timestamp / interval) * interval : timestamp;
}

function journalFillRows(journalPath, symbol, start, end) {
  return loadJsonl(journalPath)
    .filter(row => row.symbol === symbol && row.timestamp >= start && row.timestamp <= end)
    .map(row => ({
      event: row.event,
      orderId: row.orderId,
      timestamp: row.timestamp,
      timestampIso: new Date(row.timestamp).toISOString(),
      price: Number(row.event === 'EXIT' ? (row.exitPrice ?? row.entryPrice) : (row.entryPrice ?? row.exitPrice)),
      field: row.event === 'EXIT' && row.exitPrice !== undefined ? 'exitPrice' : 'entryPrice',
      source: journalPath,
    }))
    .filter(row => Number.isFinite(row.price));
}

function compareJournalFills(campaignCandles, { symbol, timeframe, journalPath, start, end, requireSpotCheck = true }) {
  const errors = [];
  const candleByTime = new Map(campaignCandles.map(candle => [candle.t, candle]));
  const fills = journalFillRows(journalPath, symbol, start, end);
  if (fills.length === 0 && requireSpotCheck) {
    errors.push('no live journal fill rows found for ground-truth spot-check window');
  }
  const rows = fills.map(fill => {
    const candleTime = floorToTimeframe(fill.timestamp, timeframe);
    const candle = candleByTime.get(candleTime);
    const inRange = candle && Number.isFinite(candle.h) && Number.isFinite(candle.l)
      ? fill.price >= candle.l && fill.price <= candle.h
      : false;
    if (!candle) errors.push(`missing campaign candle for ${fill.orderId || 'fill'} ${fill.timestampIso}`);
    else if (!inRange) errors.push(`fill ${fill.orderId || 'unknown'} ${fill.price} outside campaign candle range ${candle.l}-${candle.h}`);
    return {
      ...fill,
      candleTime,
      candleIso: new Date(candleTime).toISOString(),
      campaignLow: candle?.l ?? null,
      campaignHigh: candle?.h ?? null,
      inRange,
    };
  });
  return {
    ok: errors.length === 0,
    range: {
      start,
      startIso: new Date(start).toISOString(),
      end,
      endIso: new Date(end).toISOString(),
    },
    journalPath,
    fillsChecked: rows.length,
    samples: rows.slice(0, 25),
    errors,
  };
}

async function fetchAlpacaBars({ symbol, timeframe, start, end }) {
  const key = process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET || process.env.APCA_API_SECRET_KEY;
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY/APCA_API_KEY_ID and ALPACA_API_SECRET/APCA_API_SECRET_KEY are required for live parity fetch');
  }
  const timeframeMap = {
    '1m': '1Min',
    '5m': '5Min',
    '15m': '15Min',
    '30m': '30Min',
    '1h': '1Hour',
    '4h': '4Hour',
    '1d': '1Day',
  };
  const response = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/bars`, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
    params: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      timeframe: timeframeMap[timeframe] || '15Min',
      adjustment: 'raw',
      feed: 'iex',
      limit: 10000,
      sort: 'asc',
    },
  });
  return (response.data.bars || []).map(normalizeCandle).filter(candle => Number.isFinite(candle.t));
}

async function resolveReferenceCandles(options, start, end) {
  if (options.referenceFile) {
    return {
      source: path.resolve(PROJECT_ROOT, options.referenceFile),
      candles: loadCandles(options.referenceFile).candles,
      errors: [],
    };
  }
  if (options.liveReference === 'alpaca') {
    try {
      return {
        source: 'alpaca_iex_live_fetch',
        candles: await fetchAlpacaBars({
          symbol: options.symbol,
          timeframe: options.timeframe,
          start,
          end,
        }),
        errors: [],
      };
    } catch (error) {
      return { source: 'alpaca_iex_live_fetch', candles: [], errors: [error.message] };
    }
  }
  return { source: null, candles: [], errors: ['no reference file or live-reference source provided'] };
}

async function runDataParityCheck(options) {
  const symbol = options.symbol || 'TSLA';
  const timeframe = options.timeframe || '15m';
  const sameStart = numericTime(options.sameWindowStart || DEFAULT_SAME_WINDOW_START);
  const sameEnd = numericTime(options.sameWindowEnd || DEFAULT_SAME_WINDOW_END);
  const spotStart = numericTime(options.spotStart || DEFAULT_SPOT_START);
  const spotEnd = numericTime(options.spotEnd || DEFAULT_SPOT_END);
  if (!options.dataFile) throw new Error('dataFile is required');
  if (![sameStart, sameEnd, spotStart, spotEnd].every(Number.isFinite)) {
    throw new Error('invalid parity window timestamp');
  }

  const campaign = summarizeDataFile(options.dataFile, symbol, timeframe);
  const reference = await resolveReferenceCandles(options, sameStart, sameEnd);
  const sameWindow = compareCandles(campaign.candles, reference.candles, {
    start: sameStart,
    end: sameEnd,
    maxCloseBps: Number(options.maxCloseBps ?? 5),
  });
  sameWindow.referenceSource = reference.source;
  sameWindow.errors.push(...reference.errors);
  sameWindow.ok = sameWindow.ok && reference.errors.length === 0;

  const groundTruth = compareJournalFills(campaign.candles, {
    symbol,
    timeframe,
    journalPath: options.journalPath || path.join(PROJECT_ROOT, 'data', 'journal', 'trade-ledger.jsonl'),
    start: spotStart,
    end: spotEnd,
    requireSpotCheck: options.requireSpotCheck !== false,
  });

  const checks = {
    provenance: campaign.ok,
    sameWindow: sameWindow.ok,
    groundTruth: groundTruth.ok,
  };
  const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAILED-DATA-PARITY';
  const stamp = {
    version: 1,
    status,
    stampedAt: new Date().toISOString(),
    symbol,
    timeframe,
    dataFile: campaign.filePath,
    dataFileSha256: sha256File(campaign.filePath),
    checks,
    campaignProvenance: {
      ok: campaign.ok,
      filePath: campaign.filePath,
      candleCount: campaign.candleCount,
      firstIso: campaign.firstIso,
      lastIso: campaign.lastIso,
      provider: campaign.provider,
      feed: campaign.feed,
      session: campaign.session,
      timestampConvention: campaign.timestampConvention,
      sessionStats: campaign.sessionStats,
      errors: campaign.errors,
    },
    liveProvenance: liveSourceProvenance(symbol, timeframe),
    sameWindow,
    groundTruth,
    requiredAction: status === 'PASS'
      ? null
      : 'Regenerate campaign data from the same Alpaca IEX/session/timestamp profile the bot trades before launching the campaign.',
  };
  if (options.output) {
    writeJson(path.resolve(PROJECT_ROOT, options.output), stamp);
  }
  return stamp;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.data) {
    process.stderr.write('Usage: node tools/data-parity-check.js --data=<file> --symbol=TSLA --timeframe=15m [--reference=<file>|--live-reference=alpaca] [--journal=<file>] [--output=<file>]\n');
    process.exit(1);
  }
  const stamp = await runDataParityCheck({
    dataFile: options.data,
    symbol: options.symbol || 'TSLA',
    timeframe: options.timeframe || '15m',
    referenceFile: options.reference,
    liveReference: options['live-reference'],
    journalPath: options.journal,
    output: options.output,
    sameWindowStart: options['same-window-start'],
    sameWindowEnd: options['same-window-end'],
    spotStart: options['spot-start'],
    spotEnd: options['spot-end'],
    maxCloseBps: options['max-close-bps'],
  });
  process.stdout.write(`${stamp.status} ${stamp.symbol} ${stamp.timeframe} data=${stamp.dataFile}\n`);
  process.stdout.write(`provenance=${stamp.checks.provenance ? 'PASS' : 'FAIL'} sameWindow=${stamp.checks.sameWindow ? 'PASS' : 'FAIL'} groundTruth=${stamp.checks.groundTruth ? 'PASS' : 'FAIL'}\n`);
  if (options.output) process.stdout.write(`dataParity=${path.resolve(PROJECT_ROOT, options.output)}\n`);
  process.exit(stamp.status === 'PASS' ? 0 : 2);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  compareCandles,
  compareJournalFills,
  runDataParityCheck,
  summarizeDataFile,
};
