#!/usr/bin/env node

// Test PATTERN_BASED_SIZING
console.log('\n🧪 Testing PATTERN_BASED_SIZING\n');

const { PatternStatsManager, TradingOptimizations } = require('./core/TradingOptimizations');
const patternStats = new PatternStatsManager();
const tradingOpt = new TradingOptimizations(patternStats, console);

// Check if enabled
console.log(`Feature flag enabled: ${tradingOpt.config.enablePatternSizeScaling}`);

// Test with different pattern qualities
const baseSize = 0.01; // 0.01 BTC
const testCases = [
  { patternIds: [], quality: -0.8, expected: 0.25 },
  { patternIds: [], quality: -0.2, expected: 0.5 },
  { patternIds: [], quality: 0.3, expected: 1.0 },
  { patternIds: [], quality: 0.8, expected: 1.5 },
];

console.log('\n📊 Position Size Adjustments:');
testCases.forEach(test => {
  const context = { patternQuality: test.quality };
  const adjusted = tradingOpt.calculatePositionSize(baseSize, test.patternIds, context);
  const multiplier = adjusted / baseSize;
  const status = Math.abs(multiplier - test.expected) < 0.01 ? '✅' : '❌';
  console.log(`  Quality ${test.quality.toFixed(1)}: ${baseSize} BTC → ${adjusted.toFixed(4)} BTC (${multiplier.toFixed(2)}x) ${status}`);
});

const working = tradingOpt.config.enablePatternSizeScaling;
console.log(`\n${working ? '✅ PATTERN_BASED_SIZING is WORKING' : '❌ PATTERN_BASED_SIZING is DISABLED'}\n`);