#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(REPO_ROOT, '.env') });
const config = require('../trai_brain/mercury-bridge/config');
const { accountProviderAttempt, sumAttemptAccounting } = require('../trai_brain/mercury-bridge/cost-accounting');

function parseArgs(argv) {
  const args = { days: [], output: null, headSha: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--day=')) args.days.push(arg.slice('--day='.length));
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg.startsWith('--head-sha=')) args.headSha = arg.slice('--head-sha='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.days.length === 0) throw new Error('At least one --day=YYYY-MM-DD is required');
  if (args.days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day))) {
    throw new Error('--day must use YYYY-MM-DD');
  }
  if (!/^[a-f0-9]{40}$/.test(String(args.headSha || ''))) {
    throw new Error('--head-sha must be the 40-character source commit');
  }
  return args;
}

function jsonValues(rawText) {
  const values = [];
  try {
    const parsed = JSON.parse(rawText);
    values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    return values;
  } catch (_error) {
    // Claude Code emits one JSON frame per line.
  }
  for (const line of rawText.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (_error) {
      // Invalid/raw error bodies remain named as unaccounted below.
    }
  }
  return values;
}

function receiptFromRaw(absPath, attempt) {
  const base = path.basename(absPath);
  const frames = jsonValues(fs.readFileSync(absPath, 'utf8'));
  const usageFrame = [...frames].reverse().find(frame => frame && frame.usage && typeof frame.usage === 'object');
  let provider = null;
  let requestedModel = null;
  if (/^mercury(?:-|_)/.test(base)) {
    provider = 'mercury';
    requestedModel = 'mercury-2';
  } else if (/^kimi_tie_breaker-/.test(base)) {
    provider = 'openai';
    requestedModel = 'kimi-k3';
  } else if (/^fable_challenger-/.test(base)) {
    provider = 'claude-code';
    requestedModel = 'fable';
  } else if (/^opus_challenger-/.test(base)) {
    provider = 'claude-code';
    requestedModel = 'opus';
  }
  const metadata = {
    provider,
    requestedModel,
    appliedModel: usageFrame && usageFrame.model || null,
    usage: usageFrame && usageFrame.usage || null,
    providerReportedCost: usageFrame && Number.isFinite(usageFrame.total_cost_usd)
      ? usageFrame.total_cost_usd
      : null,
    providerReportedCurrency: 'USD',
  };
  return {
    attempt,
    raw_file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
    requested_provider: provider,
    requested_model: requestedModel,
    ...accountProviderAttempt(metadata, {
      provider,
      model: requestedModel,
      pricingCatalog: config.PROVIDER_PRICING,
    }),
  };
}

function runRows(days) {
  const rows = [];
  for (const day of days) {
    const dayDir = path.join(REPO_ROOT, 'ogz-meta', 'cognition-history', 'mercury-runs', 'raw', day);
    if (!fs.existsSync(dayDir)) {
      rows.push({ day, run: '<raw directory absent>', attempts: [] });
      continue;
    }
    for (const run of fs.readdirSync(dayDir).sort()) {
      const runDir = path.join(dayDir, run);
      if (!fs.statSync(runDir).isDirectory()) continue;
      const rawFiles = fs.readdirSync(runDir)
        .filter(name => name.endsWith('.raw') && !name.includes('-stderr-'))
        .sort();
      rows.push({
        day,
        run,
        attempts: rawFiles.map((name, index) => receiptFromRaw(path.join(runDir, name), index + 1)),
      });
    }
  }
  return rows;
}

function numberCell(value) {
  return Number.isFinite(value) ? String(value) : 'unknown';
}

function costCell(cost) {
  if (!cost || !Number.isFinite(cost.amount)) return 'unknown';
  return `${cost.amount.toFixed(6)}${cost.complete === false ? ' partial' : ''}`;
}

function renderReport(days, rows, headSha) {
  const lines = [
    '# Mercury bridge cost backfill — 2026-09-07 and 2026-09-08',
    '',
    `Built from commit: \`${headSha}\``,
    `Raw source: \`ogz-meta/cognition-history/mercury-runs/raw/{${days.join(',')}}/**/*.raw\``,
    'Pricing: Inception Mercury-2 from the operator-supplied Jul 1 invoice; Kimi K3 from Moonshot’s 2026-07-22 announcement; Claude Code/Fable uses the terminal frame’s provider-reported `total_cost_usd`.',
    'Unknown usage or pricing is named as incomplete and is never counted as zero.',
    '',
    '| Day | Raw run | Attempts | Input | Uncached input | Cached input | Output | Total tokens | Known USD cost | Complete | Cost absences |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|',
  ];
  const dayTotals = new Map();
  for (const row of rows) {
    const summary = sumAttemptAccounting(row.attempts);
    const tokens = summary.seat_tokens;
    const cost = summary.seat_cost;
    lines.push(`| ${row.day} | \`${row.run}\` | ${row.attempts.length} | ${numberCell(tokens.input)} | ${numberCell(tokens.uncached_input)} | ${numberCell(tokens.cached_input)} | ${numberCell(tokens.output)} | ${numberCell(tokens.total)} | ${costCell(cost)} | ${cost.complete ? 'yes' : 'no'} | ${cost.cost_absences.join('; ') || 'none'} |`);
    const prior = dayTotals.get(row.day) || { knownCost: 0, complete: true, attempts: 0 };
    prior.attempts += row.attempts.length;
    if (Number.isFinite(cost.amount)) prior.knownCost += cost.amount;
    if (!cost.complete) prior.complete = false;
    dayTotals.set(row.day, prior);
  }
  lines.push('', '## Day totals', '');
  for (const day of days) {
    const total = dayTotals.get(day) || { knownCost: 0, complete: false, attempts: 0 };
    lines.push(`- ${day}: ${total.attempts} raw attempts; USD ${total.knownCost.toFixed(6)} known cost; ${total.complete ? 'complete' : 'incomplete (see row absences)'}.`);
  }
  lines.push('', '## WHAT I DID', '', 'Read existing raw response bodies only and calculated a one-off table with the same usage/pricing logic used by the bridge ledger.', '', '## WHAT I DID NOT DO', '', 'Made no provider calls and did not alter the historical raw bodies or JSONL ledgers.', '', '## WHAT I ASSUMED', '', 'A raw directory is one bridge run; `*-stderr-*.raw` files are error text rather than billable response bodies; provider-reported Claude Code cost is authoritative for its attempt.', '');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const report = renderReport(args.days, runRows(args.days), args.headSha);
  if (args.output) {
    const outputPath = path.resolve(REPO_ROOT, args.output);
    const allowedRoot = path.join(REPO_ROOT, 'ogz-meta', 'inbox', 'codex');
    if (!(outputPath === allowedRoot || outputPath.startsWith(`${allowedRoot}${path.sep}`))) {
      throw new Error('--output must stay under ogz-meta/inbox/codex/');
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${report}\n`, 'utf8');
    console.log(path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/'));
    return;
  }
  process.stdout.write(`${report}\n`);
}

if (require.main === module) main();

module.exports = { jsonValues, receiptFromRaw, renderReport, runRows };
