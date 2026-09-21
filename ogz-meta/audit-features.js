#!/usr/bin/env node

/**
 * Feature Audit Script
 * Finds all configured features that aren't actually hooked up
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 FEATURE AUDIT STARTING\n');
console.log('=' .repeat(60));

// Load feature config
const featuresConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'features.json'), 'utf8')
);

// Load main bot file
const mainBotPath = path.join(__dirname, '..', 'run-empire-v2.js');
const mainBotCode = fs.readFileSync(mainBotPath, 'utf8');

// Check each feature
console.log('\n📋 FEATURE FLAGS STATUS:\n');
const enabledFeatures = [];
const unusedFeatures = [];

Object.entries(featuresConfig.features).forEach(([name, config]) => {
  if (config.enabled) {
    enabledFeatures.push(name);
    const found = mainBotCode.includes(name);
    const status = found ? '✅ USED' : '❌ NOT USED';
    console.log(`  ${name}: ${status}`);
    if (!found) unusedFeatures.push(name);

    // Check for shadow mode
    if (config.shadowMode) {
      console.log(`    ⚠️  Running in SHADOW MODE (not actually active)`);
    }
  }
});

// Find unused Manager/Engine classes
console.log('\n📁 UNUSED CORE CLASSES:\n');
const coreDir = path.join(__dirname, '..', 'core');
const coreFiles = fs.readdirSync(coreDir)
  .filter(f => f.endsWith('.js'))
  .filter(f => f.includes('Manager') || f.includes('Engine') || f.includes('Layer'));

const unusedClasses = [];
coreFiles.forEach(file => {
  const className = file.replace('.js', '');
  // Check if imported in main bot
  if (!mainBotCode.includes(className) &&
      !mainBotCode.includes(`require('./core/${file}')`) &&
      !mainBotCode.includes(`require('./core/${className}')`)) {
    console.log(`  ❌ ${className} - Never imported`);
    unusedClasses.push(className);
  }
});

// Check for mode separation issues
console.log('\n🔄 MODE SEPARATION:\n');
const patternFiles = execSync('ls -la data/pattern-memory*.json 2>/dev/null || echo "none"',
  { encoding: 'utf8' });
console.log('  Pattern memory files:');
console.log('  ' + patternFiles.replace(/\n/g, '\n  '));

// Summary
console.log('\n' + '=' .repeat(60));
console.log('📊 AUDIT SUMMARY:\n');
console.log(`  Total features enabled: ${enabledFeatures.length}`);
console.log(`  Features not hooked up: ${unusedFeatures.length}`);
console.log(`  Unused core classes: ${unusedClasses.length}`);

if (unusedFeatures.length > 0) {
  console.log('\n❌ UNHOOKED FEATURES:');
  unusedFeatures.forEach(f => console.log(`  - ${f}`));
}

if (unusedClasses.length > 0) {
  console.log('\n❌ UNUSED CLASSES:');
  unusedClasses.forEach(c => console.log(`  - ${c}`));
}

// Specific checks
console.log('\n🔍 SPECIFIC ISSUES:\n');

// Check PAPER_TRADING
const paperTradingEnabled = featuresConfig.features.PAPER_TRADING?.enabled;
const envHasPaper = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  .includes('PAPER_TRADING=true');
console.log(`  PAPER_TRADING: Config=${paperTradingEnabled}, Env=${envHasPaper}`);

// Check circuit breaker
if (featuresConfig.features.CIRCUIT_BREAKER?.enabled) {
  console.log('  ⚠️  CIRCUIT_BREAKER enabled but user said it blocks all trades');
}

console.log('\n✅ Audit complete\n');