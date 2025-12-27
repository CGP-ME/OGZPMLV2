#!/usr/bin/env node

// Test PATTERN_MEMORY_PARTITION
console.log('\n🧪 Testing PATTERN_MEMORY_PARTITION\n');

// Test 1: Paper mode
process.env.PAPER_TRADING = 'true';
delete require.cache[require.resolve('./core/EnhancedPatternRecognition')];
const { PatternMemorySystem } = require('./core/EnhancedPatternRecognition');
const epr1 = new PatternMemorySystem();
console.log(`✅ Paper mode file: ${epr1.options.memoryFile}`);
const expectPaper = epr1.options.memoryFile.includes('pattern-memory.paper.json');

// Test 2: Live mode
process.env.PAPER_TRADING = 'false';
delete require.cache[require.resolve('./core/EnhancedPatternRecognition')];
const { PatternMemorySystem: PMS2 } = require('./core/EnhancedPatternRecognition');
const epr2 = new PMS2();
console.log(`✅ Live mode file: ${epr2.options.memoryFile}`);
const expectLive = epr2.options.memoryFile.includes('pattern-memory.live.json');

// Test 3: Backtest mode
process.env.BACKTEST_MODE = 'true';
process.env.PAPER_TRADING = 'false';
delete require.cache[require.resolve('./core/EnhancedPatternRecognition')];
const { PatternMemorySystem: PMS3 } = require('./core/EnhancedPatternRecognition');
const epr3 = new PMS3();
console.log(`✅ Backtest mode file: ${epr3.options.memoryFile}`);
const expectBacktest = epr3.options.memoryFile.includes('pattern-memory.backtest.json');

// Results
console.log('\n📊 Results:');
console.log(`  Paper mode separation: ${expectPaper ? '✅ WORKING' : '❌ BROKEN'}`);
console.log(`  Live mode separation: ${expectLive ? '✅ WORKING' : '❌ BROKEN'}`);
console.log(`  Backtest mode separation: ${expectBacktest ? '✅ WORKING' : '❌ BROKEN'}`);

const allWorking = expectPaper && expectLive && expectBacktest;
console.log(`\n${allWorking ? '✅ PATTERN_MEMORY_PARTITION is WORKING' : '❌ PATTERN_MEMORY_PARTITION is BROKEN'}\n`);