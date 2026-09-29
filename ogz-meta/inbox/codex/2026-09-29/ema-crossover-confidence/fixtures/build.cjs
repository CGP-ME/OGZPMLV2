'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..');
const baseline = fs.readFileSync(path.join(__dirname, 'baseline-sha.txt'), 'utf8').trim();
const files = ['foundation/ConfigLoader.js', 'core/AtomicWrite.js', 'core/CandleHelper.js',
  'config/settings.json', 'config/internals.json', 'modules/EMASMACrossoverSignal.js',
  'run-empire-v2.js', 'core/SymbolTradingContext.js', 'core/StrategyOrchestrator.js'];
for (const side of ['baseline', 'candidate']) {
  for (const file of files) {
    const target = path.join(__dirname, side, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root }));
  }
}
const candidate = path.relative(root, path.join(__dirname, 'candidate'));
const patches = ['module.patch', 'loader-final-head.patch', 'producers.patch', 'role-ownership.patch'];
for (const patch of patches) {
  cp.execFileSync('git', ['apply', `--directory=${candidate}`, path.join(__dirname, patch)], { cwd: root });
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const receipt = { baseline, patches: Object.fromEntries(patches
  .map(file => [file, hash(path.join(__dirname, file))])),
  candidate: Object.fromEntries(files.map(file => [file, hash(path.join(__dirname, 'candidate', file))])) };
fs.writeFileSync(path.join(__dirname, '../build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ pass: true, baseline, candidateFiles: files.length }));
