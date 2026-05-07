#!/usr/bin/env node
/**
 * tools/harvest-pattern-pack.js — Auto-harvest pattern-pack.json from sweep results
 *
 * Per CC-A spec addendum: when matrix-sweep finishes with TRAI_AUTO_HARVEST=true,
 * this module scans worker reports and aggregates trade dimensions into a
 * pattern-pack.json that TRAIPatternIntegration consumes for confidence
 * boost/penalty matching.
 *
 * Pure statistical aggregation — no Mercury, no LLM, no live-data dependency.
 * Reads enriched trade records (CC-A Change 1) from per-worker JSON reports,
 * preferring the dimensionAgg shape produced by matrix-sweep.js (CC-A Change 3)
 * and falling back to raw trade arrays when only the legacy shape is available.
 *
 * Usage (CLI):
 *   node tools/harvest-pattern-pack.js \
 *     --input backtest-results/worker-reports/ \
 *     --output data/pattern-pack.json \
 *     --min-trades 20 --boost 0.55 --penalty 0.40
 *
 * Usage (programmatic):
 *   const { harvest } = require('./tools/harvest-pattern-pack');
 *   const result = harvest(inputDir, outputPath, {
 *     minTrades: 20,
 *     boostThreshold: 0.55,
 *     penaltyThreshold: 0.40,
 *     afterTimestamp: <epoch ms — only files mtime'd after this>,
 *     source: 'tsla-2y-exits-sweep',
 *   });
 *
 * Output schema matches TRAIPatternIntegration v2.0-harvested:
 *   { version, generated, source, totalTrades, filters,
 *     patterns: [{ id, dimensions, confidenceBoost, stats }],
 *     antiPatterns: [{ id, dimensions, confidencePenalty, stats }] }
 *
 * @module tools/harvest-pattern-pack
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_OPTS = {
  minTrades: 20,
  boostThreshold: 0.55,
  penaltyThreshold: 0.40,
  afterTimestamp: null,
  source: null,
};

/**
 * Walk inputDir, parse each JSON, accumulate dimension aggregates across all
 * worker reports. Honors afterTimestamp filter for THIS-SWEEP-ONLY harvest.
 */
function aggregateReports(inputDir, opts) {
  const agg = new Map();
  let totalTrades = 0;
  let scannedFiles = 0;
  let skippedFiles = 0;

  if (!fs.existsSync(inputDir)) {
    throw new Error(`[harvest] input dir does not exist: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(inputDir, f));

  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (_) {
      skippedFiles++;
      continue;
    }
    if (opts.afterTimestamp != null && stat.mtimeMs < opts.afterTimestamp) {
      skippedFiles++;
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      skippedFiles++;
      continue;
    }

    // Two read paths: prefer aggregated dimensionAgg from matrix-sweep
    // (CC-A Change 3, smaller files); fall back to raw trades array.
    if (Array.isArray(data.dimensionAgg) && data.dimensionAgg.length > 0) {
      for (const a of data.dimensionAgg) {
        const key = [a.strategy, a.dayOfWeek, a.session, a.holdBucket, a.confidenceTier, a.exitType].join('|');
        if (!agg.has(key)) {
          agg.set(key, {
            strategy: a.strategy, dayOfWeek: a.dayOfWeek, session: a.session,
            holdBucket: a.holdBucket, confidenceTier: a.confidenceTier, exitType: a.exitType,
            count: 0, wins: 0, losses: 0, totalPnl: 0
          });
        }
        const slot = agg.get(key);
        slot.count += a.count || 0;
        slot.wins += a.wins || 0;
        slot.losses += a.losses || 0;
        slot.totalPnl += a.totalPnl || 0;
        totalTrades += a.count || 0;
      }
      scannedFiles++;
      continue;
    }

    if (Array.isArray(data.trades)) {
      for (const t of data.trades) {
        const key = [
          t.strategyName || 'unknown',
          t.dayOfWeek || 'unknown',
          t.session || 'unknown',
          t.holdBucket || 'unknown',
          t.confidenceTier || 'unknown',
          t.exitType || 'unknown'
        ].join('|');
        if (!agg.has(key)) {
          agg.set(key, {
            strategy: t.strategyName || 'unknown',
            dayOfWeek: t.dayOfWeek || 'unknown',
            session: t.session || 'unknown',
            holdBucket: t.holdBucket || 'unknown',
            confidenceTier: t.confidenceTier || 'unknown',
            exitType: t.exitType || 'unknown',
            count: 0, wins: 0, losses: 0, totalPnl: 0
          });
        }
        const slot = agg.get(key);
        const pnl = t.netPnlDollars || 0;
        slot.count++;
        if (pnl > 0) slot.wins++;
        else if (pnl < 0) slot.losses++;
        slot.totalPnl += pnl;
        totalTrades++;
      }
      scannedFiles++;
      continue;
    }

    skippedFiles++;
  }

  return { agg, totalTrades, scannedFiles, skippedFiles };
}

/**
 * Convert aggregated dimensions to TRAIPatternIntegration v2.0-harvested format.
 * Patterns: WR >= boostThreshold and count >= minTrades.
 * Anti-patterns: WR <= penaltyThreshold and count >= minTrades.
 */
function buildPatternPack(agg, opts, totalTrades) {
  const patterns = [];
  const antiPatterns = [];

  for (const slot of agg.values()) {
    if (slot.count < opts.minTrades) continue;
    const winRate = slot.count > 0 ? slot.wins / slot.count : 0;
    const avgPnl = slot.count > 0 ? slot.totalPnl / slot.count : 0;

    const idTail = [slot.strategy, slot.session, slot.dayOfWeek, slot.holdBucket]
      .map(s => String(s).slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .join('-');

    const stats = {
      trades: slot.count,
      winRate: parseFloat(winRate.toFixed(4)),
      avgPnl: parseFloat(avgPnl.toFixed(4)),
      source: opts.source || 'sweep-harvest',
    };

    const dimensions = {
      strategy: slot.strategy,
      session: slot.session,
      dayOfWeek: slot.dayOfWeek,
      holdBucket: slot.holdBucket,
      confidenceTier: slot.confidenceTier,
      exitType: slot.exitType,
    };

    if (winRate >= opts.boostThreshold) {
      patterns.push({
        id: `PAT-${idTail}`,
        dimensions,
        confidenceBoost: parseFloat((1.0 + (winRate - 0.5) * 0.4).toFixed(4)),
        stats,
      });
    } else if (winRate <= opts.penaltyThreshold) {
      antiPatterns.push({
        id: `ANTI-${idTail}`,
        dimensions,
        confidencePenalty: parseFloat((0.7 + winRate * 0.5).toFixed(4)),
        stats,
      });
    }
  }

  return {
    version: '2.0-harvested',
    generated: new Date().toISOString(),
    source: opts.source || 'sweep-harvest',
    totalTrades,
    filters: {
      minTrades: opts.minTrades,
      boostThreshold: opts.boostThreshold,
      penaltyThreshold: opts.penaltyThreshold,
    },
    patterns,
    antiPatterns,
  };
}

/**
 * Main entry — read worker reports, aggregate, write pattern-pack.json,
 * and a sibling pattern-harvest-report.json with raw aggregation data.
 */
function harvest(inputDir, outputPath, opts = {}) {
  const merged = { ...DEFAULT_OPTS, ...opts };
  const { agg, totalTrades, scannedFiles, skippedFiles } = aggregateReports(inputDir, merged);
  const pack = buildPatternPack(agg, merged, totalTrades);

  // Write main pattern-pack.json
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(pack, null, 2));

  // Write companion harvest report with raw aggregation data
  const reportPath = path.join(path.dirname(outputPath), 'pattern-harvest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generated: pack.generated,
    inputDir,
    scannedFiles,
    skippedFiles,
    totalTrades,
    dimensionCount: agg.size,
    rawDimensions: Array.from(agg.values()),
  }, null, 2));

  return {
    patterns: pack.patterns.length,
    antiPatterns: pack.antiPatterns.length,
    totalTrades,
    scannedFiles,
    skippedFiles,
    dimensionCount: agg.size,
    outputPath,
    reportPath,
  };
}

module.exports = { harvest, aggregateReports, buildPatternPack };

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let inputDir = path.join(__dirname, '..', 'backtest-results', 'worker-reports');
  let outputPath = path.join(__dirname, '..', 'data', 'pattern-pack.json');
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input' && args[i + 1]) { inputDir = args[++i]; continue; }
    if (a === '--output' && args[i + 1]) { outputPath = args[++i]; continue; }
    if (a === '--min-trades' && args[i + 1]) { opts.minTrades = parseInt(args[++i]); continue; }
    if (a === '--boost' && args[i + 1]) { opts.boostThreshold = parseFloat(args[++i]); continue; }
    if (a === '--penalty' && args[i + 1]) { opts.penaltyThreshold = parseFloat(args[++i]); continue; }
    if (a === '--source' && args[i + 1]) { opts.source = args[++i]; continue; }
    if (a === '--after' && args[i + 1]) { opts.afterTimestamp = parseFloat(args[++i]); continue; }
    if (a === '--help' || a === '-h') {
      console.log(`Usage: node tools/harvest-pattern-pack.js [options]
  --input <dir>          Worker reports dir (default: backtest-results/worker-reports/)
  --output <path>        Pattern-pack output path (default: data/pattern-pack.json)
  --min-trades <n>       Minimum trades per dimension combo (default: 20)
  --boost <ratio>        Win-rate threshold for pattern (default: 0.55)
  --penalty <ratio>      Win-rate threshold for anti-pattern (default: 0.40)
  --source <label>       Source label written into pack metadata
  --after <epoch-ms>     Only scan files mtime'd after this timestamp
`);
      process.exit(0);
    }
  }

  try {
    const r = harvest(inputDir, outputPath, opts);
    console.log(`[harvest] scanned=${r.scannedFiles} skipped=${r.skippedFiles} dimensions=${r.dimensionCount} trades=${r.totalTrades}`);
    console.log(`[harvest] patterns=${r.patterns} antiPatterns=${r.antiPatterns}`);
    console.log(`[harvest] pack written to ${r.outputPath}`);
    console.log(`[harvest] raw report at ${r.reportPath}`);
  } catch (e) {
    console.error(`[harvest] failed: ${e.message}`);
    process.exit(1);
  }
}
