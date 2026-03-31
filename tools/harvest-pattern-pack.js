#!/usr/bin/env node
/**
 * Pattern Harvester for TRAI
 * ══════════════════════════════════════════════════════════════
 *
 * Analyzes historical trades to discover winning/losing patterns
 * by dimension (direction, dayOfWeek, session, holdEstimate, etc.)
 *
 * Outputs pattern-pack.json in format expected by TRAIPatternIntegration
 *
 * Usage:
 *   node tools/harvest-pattern-pack.js
 *   node tools/harvest-pattern-pack.js --input data/backtest/results.json
 *   node tools/harvest-pattern-pack.js --min-trades 10 --boost-threshold 0.6
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────
const CONFIG = {
  minTradesForPattern: 5,       // Minimum trades to consider a pattern significant
  boostThreshold: 0.55,         // Win rate above this = boost pattern (55%+)
  penaltyThreshold: 0.45,       // Win rate below this = anti-pattern (<45%)
  maxBoost: 2.0,                // Maximum confidence multiplier
  minPenalty: 0.3,              // Minimum penalty multiplier
  outputPath: './data/pattern-pack.json',
};

// ─── Dimension Extractors ───────────────────────────────────────

function extractDimensions(trade) {
  const dims = {};

  // Direction
  dims.direction = (trade.direction || '').toLowerCase();
  if (dims.direction === 'buy') dims.direction = 'long';
  if (dims.direction === 'sell') dims.direction = 'short';

  // Day of week from timestamp
  if (trade.timestamp || trade.entryTime) {
    const d = new Date(trade.timestamp || trade.entryTime);
    dims.dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

    // Session (ET hours)
    const utcHour = d.getUTCHours();
    const etHour = ((utcHour - 4) + 24) % 24;
    if (etHour >= 4 && etHour < 9.5) dims.session = 'premarket';
    else if (etHour >= 9.5 && etHour < 10) dims.session = 'opening';
    else if (etHour >= 10 && etHour < 12) dims.session = 'morning';
    else if (etHour >= 12 && etHour < 14) dims.session = 'midday';
    else if (etHour >= 14 && etHour < 15.5) dims.session = 'afternoon';
    else if (etHour >= 15.5 && etHour < 16) dims.session = 'closingHour';
    else dims.session = 'afterHours';
  }

  // Hold estimate category
  if (trade.holdTimeMs !== undefined) {
    const mins = trade.holdTimeMs / 60000;
    if (mins < 5) dims.holdEstimate = 'scalp';
    else if (mins < 30) dims.holdEstimate = 'short';
    else if (mins < 120) dims.holdEstimate = 'medium';
    else dims.holdEstimate = 'swing';
  }

  // Confidence tier
  if (trade.confidence !== undefined) {
    if (trade.confidence < 50) dims.confidenceTier = 'low';
    else if (trade.confidence < 70) dims.confidenceTier = 'medium';
    else if (trade.confidence < 85) dims.confidenceTier = 'high';
    else dims.confidenceTier = 'very_high';
  }

  // Regime
  if (trade.regime) {
    dims.regime = trade.regime;
  }

  return dims;
}

// ─── Pattern Discovery ──────────────────────────────────────────

function discoverPatterns(trades) {
  // Group trades by dimension combinations
  const groups = {};

  for (const trade of trades) {
    const dims = extractDimensions(trade);
    const isWin = trade.netPnl > 0 || trade.pnl > 0 || trade.result === 'win';

    // Generate all 1-2 dimension combinations
    const dimKeys = Object.keys(dims);
    const combos = [];

    // Single dimensions
    for (const key of dimKeys) {
      if (dims[key]) combos.push({ [key]: dims[key] });
    }

    // Two-dimension combos (most common patterns)
    for (let i = 0; i < dimKeys.length; i++) {
      for (let j = i + 1; j < dimKeys.length; j++) {
        if (dims[dimKeys[i]] && dims[dimKeys[j]]) {
          combos.push({
            [dimKeys[i]]: dims[dimKeys[i]],
            [dimKeys[j]]: dims[dimKeys[j]],
          });
        }
      }
    }

    // Record each combo
    for (const combo of combos) {
      const key = JSON.stringify(combo);
      if (!groups[key]) {
        groups[key] = { dimensions: combo, wins: 0, losses: 0, totalPnl: 0, trades: [] };
      }
      groups[key].trades.push(trade);
      if (isWin) {
        groups[key].wins++;
      } else {
        groups[key].losses++;
      }
      groups[key].totalPnl += trade.netPnl || trade.pnl || 0;
    }
  }

  // Analyze groups for patterns
  const patterns = [];
  const antiPatterns = [];
  let patternId = 1;

  for (const [key, group] of Object.entries(groups)) {
    const total = group.wins + group.losses;
    if (total < CONFIG.minTradesForPattern) continue;

    const winRate = group.wins / total;
    const avgPnl = group.totalPnl / total;

    // Calculate boost/penalty based on how far from 50% win rate
    if (winRate >= CONFIG.boostThreshold) {
      // Winning pattern
      const boost = 1 + ((winRate - 0.5) * 2); // 55% = 1.1, 65% = 1.3, 75% = 1.5
      patterns.push({
        id: `PAT-${patternId++}`,
        dimensions: group.dimensions,
        confidenceBoost: Math.min(Number(boost.toFixed(2)), CONFIG.maxBoost),
        stats: {
          trades: total,
          winRate: Number((winRate * 100).toFixed(1)),
          avgPnl: Number(avgPnl.toFixed(2)),
        },
      });
    } else if (winRate <= CONFIG.penaltyThreshold) {
      // Losing pattern (anti-pattern)
      const penalty = 0.5 + (winRate); // 45% = 0.95, 35% = 0.85, 25% = 0.75
      antiPatterns.push({
        id: `ANTI-${patternId++}`,
        dimensions: group.dimensions,
        confidencePenalty: Math.max(Number(penalty.toFixed(2)), CONFIG.minPenalty),
        stats: {
          trades: total,
          winRate: Number((winRate * 100).toFixed(1)),
          avgPnl: Number(avgPnl.toFixed(2)),
        },
      });
    }
  }

  // Sort by significance (trade count * deviation from 50%)
  patterns.sort((a, b) => {
    const sigA = a.stats.trades * Math.abs(a.stats.winRate - 50);
    const sigB = b.stats.trades * Math.abs(b.stats.winRate - 50);
    return sigB - sigA;
  });

  antiPatterns.sort((a, b) => {
    const sigA = a.stats.trades * Math.abs(50 - a.stats.winRate);
    const sigB = b.stats.trades * Math.abs(50 - b.stats.winRate);
    return sigB - sigA;
  });

  return { patterns: patterns.slice(0, 20), antiPatterns: antiPatterns.slice(0, 20) };
}

// ─── Data Loaders ───────────────────────────────────────────────

function loadTradeLedger(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(line => line.includes('"event":"EXIT"'))
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

function loadBacktestResults(filepath) {
  if (!fs.existsSync(filepath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return data.trades || data.results || [];
  } catch {
    return [];
  }
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  console.log('🔬 TRAI Pattern Harvester');
  console.log('═════════════════════════════════════════\n');

  // Collect trades from all sources
  let trades = [];

  // Trade ledger
  const ledgerPath = './data/journal/trade-ledger.jsonl';
  const ledgerTrades = loadTradeLedger(ledgerPath);
  console.log(`📁 Trade ledger: ${ledgerTrades.length} trades`);
  trades = trades.concat(ledgerTrades);

  // Backtest results (if specified or default locations)
  const backtestPaths = [
    './data/backtest/results.json',
    './backtest-output.json',
  ];
  for (const bp of backtestPaths) {
    const bt = loadBacktestResults(bp);
    if (bt.length > 0) {
      console.log(`📁 Backtest (${bp}): ${bt.length} trades`);
      trades = trades.concat(bt);
    }
  }

  console.log(`\n📊 Total trades to analyze: ${trades.length}\n`);

  if (trades.length < CONFIG.minTradesForPattern) {
    console.log('⚠️  Not enough trade data for pattern discovery.');
    console.log('   Creating seed pattern pack with reasonable defaults...\n');

    // Create seed patterns based on market wisdom
    const seedPack = {
      version: '1.0-seed',
      generated: new Date().toISOString(),
      source: 'seed-defaults',
      totalTrades: 0,
      filters: { minTrades: CONFIG.minTradesForPattern, boostThreshold: CONFIG.boostThreshold },
      patterns: [
        { id: 'PAT-SEED-1', dimensions: { direction: 'long', dayOfWeek: 'Fri' }, confidenceBoost: 1.15, stats: { note: 'Friday trend continuation' } },
        { id: 'PAT-SEED-2', dimensions: { direction: 'long', session: 'morning' }, confidenceBoost: 1.12, stats: { note: 'Morning momentum' } },
        { id: 'PAT-SEED-3', dimensions: { confidenceTier: 'very_high' }, confidenceBoost: 1.20, stats: { note: 'High conviction signals' } },
      ],
      antiPatterns: [
        { id: 'ANTI-SEED-1', dimensions: { holdEstimate: 'scalp' }, confidencePenalty: 0.85, stats: { note: 'Scalps have high slippage' } },
        { id: 'ANTI-SEED-2', dimensions: { session: 'midday' }, confidencePenalty: 0.90, stats: { note: 'Midday chop zone' } },
        { id: 'ANTI-SEED-3', dimensions: { dayOfWeek: 'Mon', session: 'opening' }, confidencePenalty: 0.80, stats: { note: 'Monday gap fills' } },
      ],
    };

    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(seedPack, null, 2));
    console.log(`✅ Seed pattern pack written to: ${CONFIG.outputPath}`);
    console.log('   Run more trades/backtests, then re-run harvester to discover real patterns.\n');
    return;
  }

  // Discover patterns
  const { patterns, antiPatterns } = discoverPatterns(trades);

  console.log(`🎯 Discovered ${patterns.length} boost patterns`);
  console.log(`⚠️  Discovered ${antiPatterns.length} anti-patterns\n`);

  // Output top patterns
  if (patterns.length > 0) {
    console.log('Top Boost Patterns:');
    patterns.slice(0, 5).forEach(p => {
      console.log(`  ${p.id}: ${JSON.stringify(p.dimensions)} → ${p.confidenceBoost}x (${p.stats.winRate}% win, ${p.stats.trades} trades)`);
    });
    console.log('');
  }

  if (antiPatterns.length > 0) {
    console.log('Top Anti-Patterns:');
    antiPatterns.slice(0, 5).forEach(p => {
      console.log(`  ${p.id}: ${JSON.stringify(p.dimensions)} → ${p.confidencePenalty}x (${p.stats.winRate}% win, ${p.stats.trades} trades)`);
    });
    console.log('');
  }

  // Write pattern pack
  const pack = {
    version: '1.0',
    generated: new Date().toISOString(),
    source: 'harvest-pattern-pack.js',
    totalTrades: trades.length,
    filters: {
      minTrades: CONFIG.minTradesForPattern,
      boostThreshold: CONFIG.boostThreshold,
      penaltyThreshold: CONFIG.penaltyThreshold,
    },
    patterns,
    antiPatterns,
  };

  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(pack, null, 2));
  console.log(`✅ Pattern pack written to: ${CONFIG.outputPath}`);
}

main();
