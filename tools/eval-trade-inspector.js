#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function usage() {
  return [
    'Usage:',
    '  node tools/eval-trade-inspector.js --account MAX58356 --start 2026-06-25T19:40:00.000Z --end 2026-06-25T20:10:00.000Z [--cutoff 2026-06-25T19:50:00.000Z]',
    '',
    'Reads repo-local proof recent_trades plus scoped data/journal trade-ledger.jsonl files.',
    'All output timestamps include explicit UTC and ET labels.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function parseIso(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`${label} must be an ISO timestamp; got ${JSON.stringify(value)}`);
  }
  return ms;
}

const ET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

function formatUtc(ms) {
  return `${new Date(ms).toISOString()} UTC`;
}

function formatEt(ms) {
  return `${ET_FORMATTER.format(new Date(ms))} ET`;
}

function timestampFields(ms) {
  return {
    time_utc: formatUtc(ms),
    time_et: formatEt(ms),
  };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === 'trade-ledger.jsonl') out.push(p);
  }
  return out;
}

function readJsonLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  const lines = text.split(/\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${file}:${index + 1} invalid JSON: ${error.message}`);
    }
  });
  return rows;
}

function normalizeJournalEvent(row, file) {
  const timestamp = Number(row.timestamp);
  if (!Number.isFinite(timestamp)) return null;
  if (row.event !== 'ENTRY' && row.event !== 'EXIT') return null;
  return {
    source: 'journal',
    event: row.event,
    iso: new Date(timestamp).toISOString(),
    ...timestampFields(timestamp),
    timestamp,
    symbol: row.symbol || null,
    orderId: row.orderId || null,
    direction: row.direction || null,
    entryPrice: row.entryPrice ?? null,
    exitPrice: row.exitPrice ?? null,
    netPnl: row.netPnl ?? null,
    exitReason: row.exitReason || null,
    strategy: row.entryStrategy || row.winnerStrategy || row.strategy || null,
    signalBasis: row.signalBasis || row.decisionLedger?.orchestratorDecision?.signalBasis || null,
    crossoverCount: row.crossoverCount ?? row.decisionLedger?.orchestratorDecision?.crossoverCount ?? null,
    file,
  };
}

function readProofRecentTrades(account) {
  const file = path.join('public', 'proof', 'track-record', 'data', 'accounts', `${account}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Proof account file not found: ${file}`);
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(json.recent_trades)) {
    throw new Error(`${file} missing required recent_trades array`);
  }
  return json.recent_trades.map((row) => {
    const timestamp = parseIso(row.t, 'proof recent_trades[].t');
    return {
      source: 'proof',
      event: 'RECENT_TRADE',
      iso: new Date(timestamp).toISOString(),
      ...timestampFields(timestamp),
      timestamp,
      symbol: row.symbol || null,
      orderId: row.order_id || row.trade_id || null,
      side: row.side || null,
      entryPrice: row.entry ?? null,
      exitPrice: row.exit ?? null,
      pnl: row.pnl ?? null,
      pct: row.pct ?? null,
      exitReason: row.exit_reason || null,
      legType: row.leg_type || null,
      confidence: row.confidence ?? null,
      file,
    };
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  for (const required of ['account', 'start', 'end']) {
    if (!args[required]) throw new Error(`Missing --${required}\n${usage()}`);
  }

  const start = parseIso(args.start, '--start');
  const end = parseIso(args.end, '--end');
  if (end < start) throw new Error('--end must be >= --start');
  const cutoff = args.cutoff ? parseIso(args.cutoff, '--cutoff') : null;

  const proofRows = readProofRecentTrades(args.account)
    .filter((row) => row.timestamp >= start && row.timestamp <= end);

  const journalRows = walk('data/journal')
    .flatMap((file) => readJsonLines(file).map((row) => normalizeJournalEvent(row, file)).filter(Boolean))
    .filter((row) => row.timestamp >= start && row.timestamp <= end);

  const all = [...journalRows, ...proofRows].sort((a, b) => a.timestamp - b.timestamp);
  const afterCutoffEntries = cutoff === null
    ? []
    : journalRows.filter((row) => row.event === 'ENTRY' && row.timestamp >= cutoff);

  const report = {
    account: args.account,
    window: {
      start: new Date(start).toISOString(),
      start_utc: formatUtc(start),
      start_et: formatEt(start),
      end: new Date(end).toISOString(),
      end_utc: formatUtc(end),
      end_et: formatEt(end),
      cutoff: cutoff === null ? null : new Date(cutoff).toISOString(),
      cutoff_utc: cutoff === null ? null : formatUtc(cutoff),
      cutoff_et: cutoff === null ? null : formatEt(cutoff),
    },
    counts: {
      journalEvents: journalRows.length,
      proofRecentTrades: proofRows.length,
      afterCutoffEntries: afterCutoffEntries.length,
    },
    afterCutoffEntries,
    events: all,
  };

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[eval-trade-inspector] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  formatUtc,
  formatEt,
  timestampFields,
};
