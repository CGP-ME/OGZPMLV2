#!/usr/bin/env node
// tools/pine-import.js
const fs = require('fs');
const path = require('path');
const PineFeatureScanner = require('../core/PineFeatureScanner');

function main() {
  const [, , srcPath] = process.argv;
  if (!srcPath) {
    console.error('Usage: node tools/pine-import.js path/to/strategy.pine');
    process.exit(1);
  }

  const source = fs.readFileSync(srcPath, 'utf8');
  const scanner = new PineFeatureScanner();
  const scanResult = scanner.assertImportable(source);

  console.log('\n--- Pine Feature Scan ---');
  console.log('Features detected:', JSON.stringify(scanResult.features, null, 2));

  if (!scanResult.signalModeReady) {
    console.warn('\n--- Advanced Features (require full VM) ---');
    console.warn('  -', scanResult.unsupportedSignalMode.join('\n  - '));
    console.warn('\nThe generated module will run but may need manual adjustments.');
  }

  const moduleName = path.basename(srcPath, '.pine');

  // Generate the JS module source
  const js = `/**
 * Auto-generated from ${path.basename(srcPath)} - DO NOT EDIT MANUALLY
 * Requires: pine-transpiler/core/*
 */
const PineRuntime = require('../core/PineRuntime');

const SOURCE = \`${source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

const runtime = new PineRuntime(SOURCE);

module.exports = {
  name: '${moduleName}',

  /**
   * @param {Object} ctx - { priceHistory: [{open,high,low,close,volume,timestamp}] }
   * @returns {Object} - { direction, confidence, overrideLevels, sizingMultiplier, reason }
   */
  evaluate(ctx) {
    // feed the newest candle to the runtime
    const candle = ctx.priceHistory[ctx.priceHistory.length - 1];
    return runtime.evaluate(candle);
  }
};
`;

  const outDir = path.resolve(__dirname, '..', 'modules');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `${moduleName}.js`);
  fs.writeFileSync(outPath, js, 'utf8');
  console.log(`\n--- Transpiled module written to ${outPath}`);
}

try {
  main();
} catch (err) {
  if (err && err.code === 'PINE_IMPORT_REFUSED') {
    console.error(err.message);
    for (const entry of err.features || []) {
      console.error(`  - ${entry.feature}: ${entry.reason}`);
    }
    process.exit(2);
  }
  throw err;
}
