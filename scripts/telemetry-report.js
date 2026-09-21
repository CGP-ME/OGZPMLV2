#!/usr/bin/env node

/**
 * OGZPrime Telemetry Report
 * Shows you exactly what the bot has been learning and doing
 */

const fs = require('fs');
const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');

const internalPaths = ConfigLoader.getInternalsFileValue('paths');
const logDirectory = path.resolve(process.cwd(), internalPaths.logDirectory);
const dataDirectory = path.resolve(process.cwd(), internalPaths.dataDir);
const telemetryFile = path.join(logDirectory, 'telemetry.jsonl');
const metricsFile = path.join(logDirectory, 'metrics.json');

console.log('📊 OGZPRIME TELEMETRY REPORT');
console.log('═══════════════════════════════\n');

// Load saved metrics if they exist
let metrics = {
  patterns: {
    detected: 0,
    recorded: 0,
    matched: 0,
    winRate: 0
  },
  trades: {
    total: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    avgConfidence: 0
  },
  performance: {
    candlesProcessed: 0,
    decisionsPerMinute: 0,
    memorySize: 0
  }
};

if (fs.existsSync(metricsFile)) {
  try {
    metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  } catch (e) {
    console.log('⚠️ Could not load metrics file');
  }
}

// Parse telemetry events
if (fs.existsSync(telemetryFile)) {
  const lines = fs.readFileSync(telemetryFile, 'utf8').split('\n').filter(l => l);

  console.log(`📁 Processing ${lines.length} telemetry events...\n`);

  // Count event types
  const eventCounts = {};
  const recentEvents = [];

  lines.forEach(line => {
    try {
      const event = JSON.parse(line);
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;

      // Keep last 10 events
      recentEvents.push(event);
      if (recentEvents.length > 10) recentEvents.shift();

      // Update metrics based on events
      switch(event.type) {
        case 'pattern_detected':
          metrics.patterns.detected++;
          break;
        case 'pattern_recorded':
          metrics.patterns.recorded++;
          if (event.memorySize) {
            metrics.performance.memorySize = event.memorySize;
          }
          break;
        case 'pattern_match':
          metrics.patterns.matched++;
          break;
        case 'trade_executed':
          metrics.trades.total++;
          if (event.pnl > 0) metrics.trades.wins++;
          if (event.pnl < 0) metrics.trades.losses++;
          metrics.trades.pnl += (event.pnl || 0);
          break;
        case 'candle_processed':
          metrics.performance.candlesProcessed++;
          break;
      }
    } catch (e) {
      // Skip malformed lines
    }
  });

  // Calculate derived metrics
  if (metrics.trades.total > 0) {
    metrics.trades.winRate = (metrics.trades.wins / metrics.trades.total * 100).toFixed(1);
  }
  if (metrics.patterns.matched > 0) {
    metrics.patterns.winRate = (metrics.patterns.winRate * 100).toFixed(1);
  }

  // Display report
  console.log('🔍 PATTERN SYSTEM');
  console.log(`  Detected: ${metrics.patterns.detected}`);
  console.log(`  Recorded: ${metrics.patterns.recorded}`);
  console.log(`  Matched: ${metrics.patterns.matched}`);
  console.log(`  Memory Size: ${metrics.performance.memorySize} patterns`);
  console.log(`  Win Rate: ${metrics.patterns.winRate}%\n`);

  console.log('💰 TRADING PERFORMANCE');
  console.log(`  Total Trades: ${metrics.trades.total}`);
  console.log(`  Wins: ${metrics.trades.wins}`);
  console.log(`  Losses: ${metrics.trades.losses}`);
  console.log(`  Win Rate: ${metrics.trades.winRate}%`);
  console.log(`  Total P&L: ${metrics.trades.pnl.toFixed(2)}%\n`);

  console.log('⚡ SYSTEM PERFORMANCE');
  console.log(`  Candles Processed: ${metrics.performance.candlesProcessed}`);
  console.log(`  Pattern Memory: ${metrics.performance.memorySize} patterns\n`);

  console.log('📈 EVENT DISTRIBUTION');
  Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  console.log('\n🕐 RECENT EVENTS');
  recentEvents.slice(-5).forEach(event => {
    const time = new Date(event.ts).toLocaleTimeString();
    console.log(`  [${time}] ${event.type}${event.confidence ? ` (conf: ${(event.confidence * 100).toFixed(1)}%)` : ''}`);
  });

  // Save updated metrics
  fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));

} else {
  console.log('❌ No telemetry file found at:', telemetryFile);
  console.log('   Run the bot first to generate telemetry data');
}

console.log('\n═══════════════════════════════');
console.log('📊 End of report\n');

// Pattern memory check. UnifiedPatternMemory owns one primary bank per
// mode/asset bucket; backup snapshots are recovery artifacts, not extra banks.
const patternBankNames = fs.existsSync(dataDirectory)
  ? fs.readdirSync(dataDirectory)
    .filter(name => /^unified-patterns\.(live|paper|backtest|test)\.(stocks|crypto|[a-z0-9_-]+)\.json$/i.test(name))
    .sort()
  : [];

if (patternBankNames.length === 0) {
  console.log(`No unified pattern memory bank found in ${dataDirectory}`);
}

for (const patternBankName of patternBankNames) {
  const patternFile = path.join(dataDirectory, patternBankName);
  try {
    const snapshot = JSON.parse(fs.readFileSync(patternFile, 'utf8'));
    const patterns = snapshot.patterns && typeof snapshot.patterns === 'object'
      ? snapshot.patterns
      : {};
    const count = Object.keys(patterns).length;
    console.log(`Pattern memory bank ${patternBankName}: ${count} patterns stored`);

    if (count > 0) {
      const sorted = Object.entries(patterns)
        .sort((a, b) => (b[1].occurrences || 0) - (a[1].occurrences || 0))
        .slice(0, 5);

      console.log('\nTOP PATTERNS BY OCCURRENCE:');
      sorted.forEach(([id, pattern]) => {
        console.log(`  ${id}: ${pattern.occurrences || 0} times, Win rate: ${((pattern.winRate || 0) * 100).toFixed(1)}%`);
      });
    }
  } catch (error) {
    console.log(`Could not parse pattern memory bank ${patternBankName}: ${error.message}`);
  }
}
