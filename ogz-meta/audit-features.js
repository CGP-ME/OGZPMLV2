#!/usr/bin/env node

/**
 * Feature Audit Script
 * Finds all configured features that aren't actually hooked up
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 FEATURE AUDIT STARTING\n');
console.log('=' .repeat(60));

// Load the same immutable paper snapshot consumed by the bot. This audit has
// no independent JSON or environment owner.
const ConfigLoader = require('../foundation/ConfigLoader');
const runtimeConfig = ConfigLoader.snapshot(
  { PROFILE: 'paper' },
  { role: 'bot', silent: true }
).config;
const featuresConfig = runtimeConfig.featureCatalog;

// Load main bot file
const mainBotPath = path.join(__dirname, '..', 'run-empire-v2.js');
const mainBotCode = fs.readFileSync(mainBotPath, 'utf8');

// Check each feature
console.log('\n📋 FEATURE FLAGS STATUS:\n');
const enabledFeatures = [];
const unusedFeatures = [];

Object.entries(featuresConfig).forEach(([name, config]) => {
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
const patternDirectory = path.join(__dirname, '..', 'data');
const patternFiles = fs.existsSync(patternDirectory)
  ? fs.readdirSync(patternDirectory).filter(file => /^pattern-memory.*\.json$/.test(file))
  : [];
console.log('  Pattern memory files:');
console.log(patternFiles.length > 0
  ? patternFiles.map(file => `  ${file}`).join('\n')
  : '  none');

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

console.log(`  Execution mode: ${runtimeConfig.mode.execution}`);
console.log(`  Launch profile: ${runtimeConfig.mode.launchProfile}`);

console.log('\n✅ Audit complete\n');
