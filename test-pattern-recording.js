#!/usr/bin/env node

// Test pattern recording pipeline
const EnhancedPatternRecognition = require('./core/EnhancedPatternRecognition');

console.log('🔍 Testing Pattern Recording Pipeline...\n');

// Create instance
const patternChecker = new EnhancedPatternRecognition.EnhancedPatternChecker();

// Test 1: Check initial state
console.log('📊 Initial Pattern Count:', patternChecker.memory.patternCount);

// Test 2: Create test features (9-element array like real patterns)
const testFeatures = [0.52, 0.15, 1, 0.02, 0.01, 0.5, 0.12, -0.05, 1];
console.log('🧪 Test Features:', testFeatures);

// Test 3: Try to record a pattern with features
console.log('\n📝 Recording pattern with features array...');
const result1 = patternChecker.recordPatternResult(testFeatures, {
  pnl: 1.5,
  timestamp: Date.now(),
  detected: true
});
console.log('✅ Result:', result1 ? 'SUCCESS' : 'FAILED');

// Test 4: Check pattern count after recording
console.log('📊 Pattern Count After Recording:', patternChecker.memory.patternCount);

// Test 5: Try with signature string (should warn but work)
const testSignature = JSON.stringify(testFeatures).substring(0, 50);
console.log('\n📝 Recording pattern with signature string...');
console.log('🔤 Test Signature:', testSignature);
const result2 = patternChecker.recordPatternResult(testSignature, {
  pnl: -0.5,
  timestamp: Date.now()
});
console.log('✅ Result:', result2 ? 'SUCCESS' : 'FAILED');

// Test 6: Check final pattern count
console.log('📊 Final Pattern Count:', patternChecker.memory.patternCount);

// Test 7: Check if patterns are in memory
const memoryKeys = Object.keys(patternChecker.memory.memory || {});
console.log('\n🧠 Patterns in Memory:', memoryKeys.length);
console.log('🔑 Pattern Keys:', memoryKeys.slice(0, 5));

// Test 8: Save to disk
console.log('\n💾 Saving to disk...');
patternChecker.memory.saveToDisk();

// Test 9: Read back from disk
const fs = require('fs');
const diskData = fs.readFileSync('/opt/ogzprime/OGZPMLV2/data/pattern-memory.json', 'utf8');
const parsed = JSON.parse(diskData);
console.log('📁 Patterns on Disk:', parsed.count);
console.log('✅ Disk Save Working:', parsed.count > 1 ? 'YES' : 'NO');

console.log('\n' + '='.repeat(50));
if (parsed.count > 1) {
  console.log('✅ PATTERN RECORDING IS WORKING!');
} else {
  console.log('❌ PATTERN RECORDING STILL BROKEN');
  console.log('Check the memory structure:', patternChecker.memory);
}