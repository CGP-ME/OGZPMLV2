#!/usr/bin/env node
/**
 * strategy-parity.js — Dual-run harness (native vs PineRuntime module)
 * =====================================================================
 *
 * Feeds the same candle stream into two implementations and reports where
 * normalized signals diverge. No paid data required — uses your JSON candles.
 *
 * USAGE:
 *   node tools/strategy-parity.js --preset smartmoney
 *   node tools/strategy-parity.js --preset smartmoney --candles tuning/full-45k.json --end 6000
 *   node tools/strategy-parity.js --preset smartmoney --fields direction,levels --exit-on-diff
 *
 * ENV:
 *   CANDLE_FILE — default candle path relative to project root
 */

'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    preset: null,
    candles: process.env.CANDLE_FILE || 'tuning/full-45k.json',
    end: null,
    all: false,
    minBar: null,
    fields: ['direction'],
    maxReport: 25,
    exitOnDiff: false,
    sampleEvery: 1,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset' && argv[i + 1]) out.preset = argv[++i];
    else if (a.startsWith('--preset=')) out.preset = a.split('=')[1];
    else if (a === '--candles' && argv[i + 1]) out.candles = argv[++i];
    else if (a.startsWith('--candles=')) out.candles = a.split('=')[1];
    else if (a === '--end' && argv[i + 1]) out.end = parseInt(argv[++i], 10);
    else if (a.startsWith('--end=')) out.end = parseInt(a.split('=')[1], 10);
    else if (a === '--all') out.all = true;
    else if (a === '--min-bar' && argv[i + 1]) out.minBar = parseInt(argv[++i], 10);
    else if (a.startsWith('--min-bar=')) out.minBar = parseInt(a.split('=')[1], 10);
    else if (a === '--fields' && argv[i + 1]) out.fields = argv[++i].split(',').map((s) => s.trim());
    else if (a.startsWith('--fields=')) out.fields = a.split('=')[1].split(',').map((s) => s.trim());
    else if (a === '--max-report' && argv[i + 1]) out.maxReport = parseInt(argv[++i], 10);
    else if (a.startsWith('--max-report=')) out.maxReport = parseInt(a.split('=')[1], 10);
    else if (a === '--exit-on-diff') out.exitOnDiff = true;
    else if (a === '--sample-every' && argv[i + 1]) out.sampleEvery = Math.max(1, parseInt(argv[++i], 10));
    else if (a.startsWith('--sample-every=')) out.sampleEvery = Math.max(1, parseInt(a.split('=')[1], 10));
  }
  return out;
}

function loadCandles(relPath) {
  const p = path.resolve(projectRoot, relPath);
  if (!fs.existsSync(p)) {
    console.error(`Candle file not found: ${p}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(data)) {
    console.error('Candles JSON must be a top-level array');
    process.exit(1);
  }
  return data;
}

function normDir(sig) {
  if (!sig || sig.direction == null || sig.direction === '') return null;
  const d = String(sig.direction).toLowerCase();
  if (d === 'long' || d === 'buy') return 'buy';
  if (d === 'short' || d === 'sell') return 'sell';
  return d;
}

function approxEq(a, b, eps) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

function compareLevels(nativeSig, pineSig, eps) {
  const n = nativeSig && nativeSig.overrideLevels ? nativeSig.overrideLevels : {};
  const p = pineSig && pineSig.overrideLevels ? pineSig.overrideLevels : {};
  const keys = new Set([...Object.keys(n), ...Object.keys(p)]);
  for (const k of keys) {
    if (!approxEq(n[k], p[k], eps)) return { ok: false, key: k, native: n[k], pine: p[k] };
  }
  return { ok: true };
}

function clearModuleCache(absPath) {
  try {
    const resolved = require.resolve(absPath);
    delete require.cache[resolved];
  } catch (_) {
    /* module not loaded yet */
  }
}

/**
 * @param {Object} opts
 * @param {number} opts.minBar - first bar index to compare (warmup)
 * @param {string[]} opts.fields
 * @param {number} opts.maxReport
 * @param {number} opts.sampleEvery
 */
function runSmartMoneyPair(work, opts) {
  const SmartMoneySweep = require(path.join(projectRoot, 'modules/SmartMoneySweep'));
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const pinePath = path.join(projectRoot, 'pine-transpiler/modules/SmartMoneySweep-v4.js');
  clearModuleCache(pinePath);
  const PineMod = require(pinePath);

  const native = new SmartMoneySweep(ConfigLoader.get('strategies.SmartMoneySweep'));
  const minBar = opts.minBar != null ? opts.minBar : 200;
  const mismatches = [];
  let compared = 0;
  const fields = new Set(opts.fields);
  const levelEps = 1e-6;
  const confEps = 1e-9;

  for (let i = 0; i < work.length; i++) {
    const slice = work.slice(0, i + 1);
    const candle = work[i];
    const nSig = native.update(candle, slice);
    const pSig = PineMod.evaluate({ priceHistory: slice });

    if (i < minBar) continue;
    if (opts.sampleEvery > 1 && i % opts.sampleEvery !== 0) continue;

    compared++;
    const row = { bar: i, timestamp: candle.timestamp };

    if (fields.has('direction')) {
      const dn = normDir(nSig);
      const dp = normDir(pSig);
      if (dn !== dp) {
        row.diff = 'direction';
        row.native = dn;
        row.pine = dp;
        mismatches.push(row);
        if (mismatches.length >= opts.maxReport) break;
        continue;
      }
    }

    if (fields.has('confidence') && nSig && pSig) {
      const cn = nSig.confidence;
      const cp = pSig.confidence;
      if (!approxEq(cn, cp, confEps) && !(Number.isNaN(cn) && Number.isNaN(cp))) {
        row.diff = 'confidence';
        row.native = cn;
        row.pine = cp;
        mismatches.push(row);
        if (mismatches.length >= opts.maxReport) break;
        continue;
      }
    }

    if (fields.has('levels') && normDir(nSig) && normDir(pSig) && normDir(nSig) === normDir(pSig)) {
      const lc = compareLevels(nSig, pSig, levelEps);
      if (!lc.ok) {
        row.diff = 'levels';
        row.detail = lc;
        mismatches.push(row);
        if (mismatches.length >= opts.maxReport) break;
      }
    }
  }

  return {
    preset: 'smartmoney',
    compared,
    mismatches,
    totalBars: work.length,
    minBar,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.preset) {
    console.error(`Usage: node tools/strategy-parity.js --preset smartmoney [options]

Options:
  --candles <path>     Relative to project root (default: tuning/full-45k.json or CANDLE_FILE)
  --end <n>            Use first n candles only
  --all                Use entire candle file (can be very slow)
  --min-bar <n>        First bar index to compare (default: 200)
  --fields <list>      direction | confidence | levels (comma-separated, default: direction)
  --sample-every <n>   Only compare every n bars after warmup (default: 1)
  --max-report <n>     Stop after n mismatches logged (default: 25)
  --exit-on-diff       Exit code 1 if any mismatch
`);
    process.exit(1);
  }

  const candles = loadCandles(args.candles);
  let end = args.all ? candles.length : args.end;
  if (end == null || end > candles.length) {
    const cap = 8000;
    end = Math.min(cap, candles.length);
    if (!args.all && candles.length > end) {
      console.warn(
        `[strategy-parity] Using first ${end} candles (file has ${candles.length}). ` +
          `Pass --end N or --all for more (full file can be slow).`
      );
    }
  }
  const work = candles.slice(0, end);

  let result;
  if (args.preset === 'smartmoney') {
    result = runSmartMoneyPair(work, {
      minBar: args.minBar,
      fields: args.fields,
      maxReport: args.maxReport,
      sampleEvery: args.sampleEvery,
    });
  } else {
    console.error(`Unknown preset: ${args.preset}`);
    process.exit(1);
  }

  console.log('\n--- Strategy parity ---');
  console.log(JSON.stringify(result, null, 2));

  if (result.mismatches.length && args.exitOnDiff) {
    process.exit(1);
  }
}

main();
