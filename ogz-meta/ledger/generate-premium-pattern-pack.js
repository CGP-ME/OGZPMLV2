#!/usr/bin/env node
/**
 * OGZPrime PREMIUM PATTERN PACK GENERATOR
 * =========================================
 *
 * Reads REAL pattern data from UnifiedPatternMemory's disk format
 * and optionally cross-references sweep results to build sellable packs.
 *
 * WHAT THIS ACTUALLY READS:
 *   data/unified-patterns.{mode}.json — Version 2 format:
 *     { version: 2, patterns: { [signature]: { features, wins, losses, winRate, ... } } }
 *   Pattern objects have: signature, features[], status, wins, losses, totalPnL,
 *                         winRate, avgPnL, timesSeen, outcomes[]
 *
 *   backtest-results/sweep-*.json (optional) — from parallel-backtest.js
 *     Used only for metadata (which configs were profitable)
 *
 * USAGE:
 *   node tools/generate-premium-pattern-pack.js                    # Default: backtest mode
 *   node tools/generate-premium-pattern-pack.js --mode paper       # Paper trading patterns
 *   node tools/generate-premium-pattern-pack.js --ticker TSLA      # Label the pack
 *   node tools/generate-premium-pattern-pack.js --min-wr 60        # Custom win rate threshold
 *   node tools/generate-premium-pattern-pack.js --min-trades 10    # Custom trade minimum
 *
 * OUTPUT:
 *   packs/premium-{ticker}-{timestamp}.json
 *   Ready for customers to load via UnifiedPatternMemory._load() or a future loadPack() method
 *
 * @author Claude Opus (Architect) for Trey / OGZPrime
 * @date 2026-03-21
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'backtest-results');
const PACKS_DIR = path.join(PROJECT_ROOT, 'packs');

if (!fs.existsSync(PACKS_DIR)) fs.mkdirSync(PACKS_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════
// CLI PARSING
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const opts = {
  mode: 'backtest',
  ticker: 'multi-asset',
  minWinRate: 60,       // Minimum win rate % to include
  minTrades: 10,        // Minimum total trades (wins + losses)
  minPnL: 0,            // Minimum total P&L (>0 = profitable only)
  includePromoted: true, // Always include promoted patterns
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--mode' && args[i + 1]) opts.mode = args[++i];
  else if (arg === '--ticker' && args[i + 1]) opts.ticker = args[++i];
  else if (arg === '--min-wr' && args[i + 1]) opts.minWinRate = parseFloat(args[++i]);
  else if (arg === '--min-trades' && args[i + 1]) opts.minTrades = parseInt(args[++i]);
  else if (arg === '--min-pnl' && args[i + 1]) opts.minPnL = parseFloat(args[++i]);
  else if (arg === '--verbose' || arg === '-v') opts.verbose = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`
OGZPrime Premium Pattern Pack Generator

Usage: node tools/generate-premium-pattern-pack.js [options]

Options:
  --mode <mode>        Pattern source: backtest, paper, live (default: backtest)
  --ticker <symbol>    Label for the pack (default: multi-asset)
  --min-wr <percent>   Minimum win rate to include (default: 60)
  --min-trades <n>     Minimum trades to qualify (default: 10)
  --min-pnl <dollars>  Minimum total P&L (default: 0)
  --verbose            Show each pattern included
  --help               Show this message
`);
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOAD PATTERN STORE — The REAL format from UnifiedPatternMemory.save()
// ═══════════════════════════════════════════════════════════════

const dataDir = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const patternFile = path.join(dataDir, `unified-patterns.${opts.mode}.json`);

if (!fs.existsSync(patternFile)) {
  console.error(`\n  ❌ Pattern file not found: ${patternFile}`);
  console.error(`\n  Available pattern files:`);
  try {
    fs.readdirSync(dataDir)
      .filter(f => f.startsWith('unified-patterns'))
      .forEach(f => console.error(`     ${f}`));
  } catch (e) {}
  console.error(`\n  To generate backtest patterns, run:`);
  console.error(`     BACKTEST_NO_PATTERN_SAVE=false node tools/parallel-backtest.js --quick`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(patternFile, 'utf8'));

// Version 2 format: { version: 2, patterns: { sig1: {...}, sig2: {...} }, stats: {...} }
if (raw.version !== 2 || !raw.patterns || typeof raw.patterns !== 'object') {
  console.error(`  ❌ Unexpected pattern file format (version=${raw.version}). Expected version 2.`);
  process.exit(1);
}

const allPatterns = raw.patterns;
const totalPatternCount = Object.keys(allPatterns).length;
console.log(`\n  ✅ Loaded ${totalPatternCount} patterns from ${path.basename(patternFile)}`);
console.log(`     Saved at: ${raw.savedAt || 'unknown'}`);

// ═══════════════════════════════════════════════════════════════
// FILTER PREMIUM PATTERNS — Only proven winners make the pack
// ═══════════════════════════════════════════════════════════════

const premium = [];
const rejected = { lowWR: 0, lowTrades: 0, negativePnL: 0 };

for (const [sig, pattern] of Object.entries(allPatterns)) {
  const totalTrades = (pattern.wins || 0) + (pattern.losses || 0);
  const winRate = pattern.winRate || 0;
  const totalPnL = pattern.totalPnL || 0;

  // Always include promoted patterns (the system already validated them)
  if (opts.includePromoted && pattern.status === 'promoted') {
    premium.push({ ...pattern, _reason: 'promoted' });
    continue;
  }

  // Skip quarantined (known losers)
  if (pattern.status === 'quarantined') continue;

  // Apply filters
  if (totalTrades < opts.minTrades) { rejected.lowTrades++; continue; }

  // winRate in the pattern store is 0-1, our threshold is percentage
  const wrPercent = winRate * 100;
  if (wrPercent < opts.minWinRate) { rejected.lowWR++; continue; }

  if (totalPnL < opts.minPnL) { rejected.negativePnL++; continue; }

  premium.push({ ...pattern, _reason: `wr=${wrPercent.toFixed(1)}%,trades=${totalTrades}` });
}

console.log(`\n  📊 Filter results:`);
console.log(`     Qualified:      ${premium.length} patterns`);
console.log(`     Rejected (WR):  ${rejected.lowWR}`);
console.log(`     Rejected (trades): ${rejected.lowTrades}`);
console.log(`     Rejected (P&L): ${rejected.negativePnL}`);

if (premium.length === 0) {
  console.error(`\n  ⚠️  No patterns passed the filter. Try lowering thresholds:`);
  console.error(`     --min-wr 50 --min-trades 5`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// OPTIONALLY ATTACH SWEEP METADATA
// ═══════════════════════════════════════════════════════════════

let sweepMeta = null;
try {
  const sweepFiles = fs.readdirSync(RESULTS_DIR)
    .filter(f => (f.startsWith('sweep-') || f.startsWith('matrix-sweep-')) && f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(RESULTS_DIR, f),
      time: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (sweepFiles.length > 0) {
    const sweep = JSON.parse(fs.readFileSync(sweepFiles[0].path, 'utf8'));
    const results = sweep.results || [];
    const profitable = results.filter(r => (r.netPnl || 0) > 0);

    sweepMeta = {
      sweepFile: sweepFiles[0].name,
      totalConfigs: results.length,
      profitableConfigs: profitable.length,
      bestPnL: profitable.length > 0 ? Math.max(...profitable.map(r => r.netPnl || 0)) : 0,
      avgWinRate: profitable.length > 0
        ? (profitable.reduce((a, c) => a + (c.winRate || 0), 0) / profitable.length).toFixed(1) + '%'
        : 'N/A',
    };
    console.log(`\n  📈 Sweep metadata attached from: ${sweepFiles[0].name}`);
  }
} catch (e) {
  // No sweep data available — that's fine
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIZE PATTERNS — Same logic as existing generate-pattern-pack.js
// ═══════════════════════════════════════════════════════════════

function categorize(features) {
  if (!features || features.length < 5) return 'unknown';
  const [rsi, macd, trend, bbWidth, volatility] = features;

  if (rsi < 0.3 && trend > 0) return 'oversold_uptrend';
  if (rsi > 0.7 && trend < 0) return 'overbought_downtrend';
  if (rsi < 0.3) return 'oversold';
  if (rsi > 0.7) return 'overbought';
  if (Math.abs(trend) > 0.5) return 'strong_trend';
  if (bbWidth < 0.02) return 'compression';
  if (volatility > 0.04) return 'high_volatility';
  return 'neutral';
}

// ═══════════════════════════════════════════════════════════════
// BUILD THE PACK
// ═══════════════════════════════════════════════════════════════

// Clean patterns for export — remove internal fields customers don't need
const exportPatterns = premium.map(p => ({
  signature: p.signature,
  features: p.features,
  status: p.status,
  wins: p.wins,
  losses: p.losses,
  winRate: p.winRate,
  totalPnL: p.totalPnL,
  avgPnL: p.avgPnL,
  timesSeen: p.timesSeen,
  category: categorize(p.features),
  // Strip outcomes array (too large, contains per-trade detail)
  // Customers get the learned knowledge, not the raw training data
}));

// Sort by win rate descending, then by trade count
exportPatterns.sort((a, b) => {
  const wrDiff = (b.winRate || 0) - (a.winRate || 0);
  if (Math.abs(wrDiff) > 0.01) return wrDiff;
  return ((b.wins + b.losses) || 0) - ((a.wins + a.losses) || 0);
});

const pack = {
  // Pack metadata
  packVersion: 1,
  format: 'ogzprime-pattern-pack-v1',
  ticker: opts.ticker,
  generatedAt: new Date().toISOString(),
  sourceMode: opts.mode,
  filters: {
    minWinRate: opts.minWinRate + '%',
    minTrades: opts.minTrades,
    minPnL: opts.minPnL,
  },

  // Summary stats
  summary: {
    totalPatterns: exportPatterns.length,
    promoted: exportPatterns.filter(p => p.status === 'promoted').length,
    avgWinRate: (exportPatterns.reduce((a, p) => a + (p.winRate || 0), 0) / exportPatterns.length * 100).toFixed(1) + '%',
    totalTrades: exportPatterns.reduce((a, p) => a + (p.wins || 0) + (p.losses || 0), 0),
    categories: {},
  },

  // Sweep context (if available)
  sweepMeta,

  // The actual patterns — ready to merge into UnifiedPatternMemory
  patterns: exportPatterns,
};

// Count categories
for (const p of exportPatterns) {
  pack.summary.categories[p.category] = (pack.summary.categories[p.category] || 0) + 1;
}

// ═══════════════════════════════════════════════════════════════
// WRITE THE PACK
// ═══════════════════════════════════════════════════════════════

const packFileName = `premium-${opts.ticker.toLowerCase()}-${Date.now()}.json`;
const packPath = path.join(PACKS_DIR, packFileName);
fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`  PREMIUM PATTERN PACK CREATED`);
console.log(`${'═'.repeat(60)}`);
console.log(`  File:       ${packPath}`);
console.log(`  Ticker:     ${opts.ticker}`);
console.log(`  Patterns:   ${pack.summary.totalPatterns}`);
console.log(`  Promoted:   ${pack.summary.promoted}`);
console.log(`  Avg WR:     ${pack.summary.avgWinRate}`);
console.log(`  Total Trades: ${pack.summary.totalTrades}`);
console.log(`  Categories:`);
for (const [cat, count] of Object.entries(pack.summary.categories).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${cat}: ${count}`);
}

if (opts.verbose && exportPatterns.length > 0) {
  console.log(`\n  Top 5 patterns:`);
  exportPatterns.slice(0, 5).forEach((p, i) => {
    const trades = (p.wins || 0) + (p.losses || 0);
    console.log(`    ${i + 1}. ${p.signature.substring(0, 20)}... | WR: ${(p.winRate * 100).toFixed(1)}% | Trades: ${trades} | P&L: $${(p.totalPnL || 0).toFixed(2)} | ${p.category}`);
  });
}

console.log(`\n  To load this pack into a customer's bot:`);
console.log(`    const pack = require('./packs/${packFileName}');`);
console.log(`    // Merge pack.patterns into UnifiedPatternMemory.patterns`);
console.log(`    // (loadPack method coming next)`);
console.log(`${'═'.repeat(60)}\n`);
