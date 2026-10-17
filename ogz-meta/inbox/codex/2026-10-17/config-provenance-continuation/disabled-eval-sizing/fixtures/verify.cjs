'use strict';
const fs = require('fs'), path = require('path'), Module = require('module'), vm = require('vm');
const assert = require('assert/strict'), acorn = require('acorn'), walk = require('acorn-walk');
const root = process.cwd(), read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const canonical = JSON.parse(read('settings.json')), internals = read('internals.json'), loaderText = read('loader.cjs');
const actualRead = fs.readFileSync;
let settings = canonical;
fs.readFileSync = function(file, ...args) {
  let content;
  if (String(file) === path.join(root, 'config/settings.json')) content = JSON.stringify(settings);
  if (String(file) === path.join(root, 'config/internals.json')) content = internals;
  if (content !== undefined) return typeof args[0] === 'string' || args[0]?.encoding ? content : Buffer.from(content);
  return actualRead.call(this, file, ...args);
};
process.env.PROFILE = 'paper';
for (const key of ['KRAKEN_API_KEY','KRAKEN_API_SECRET','ALPACA_API_KEY','ALPACA_API_SECRET','WEBSOCKET_AUTH_TOKEN']) process.env[key] = `fixture-${key}`;
function loaderForCurrentSettings() {
  const filename = path.join(root, 'foundation/ConfigLoader.js');
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(loaderText, filename);
  const snapshot = mod.exports.load({ role: 'bot', silent: true, loadDotenv: false });
  assert.equal(snapshot.sources['evalRules.enabled'], 'config:settings.json:launchProfiles.paper.venueGuards.ttp.enabled');
  return mod.exports;
}
function consumer(name, loader) {
  const text = read(name), ast = acorn.parse(text, {ecmaVersion:'latest'}), wanted = new Set(['_percentDistanceDecimal','_positiveConfigNumber','_entryProfitDistanceDecimal','_entryStopDistanceDecimal','_applyStockShareRange']);
  const methods = [];
  walk.simple(ast, {MethodDefinition(node) {if(wanted.has(node.key.name)) methods.push(text.slice(node.start,node.end));}});
  assert.equal(methods.length, wanted.size);
  return vm.runInNewContext(`({${methods.join(',')}})`, {ConfigLoader:loader});
}
const args = {orderQuantity:40, price:100, exitContract:{takeProfitPercent:10, stopLossPercent:10}, absoluteCapSizeUsd:5000, capReason:'absolute_position_cap'};
const rows=[];
for (const enabled of [false,true]) for(const consistency of [false,true]) for(const accountLimits of [false,true]) {
  settings = structuredClone(canonical);
  Object.assign(settings.launchProfiles.paper.venueGuards.ttp,{enabled});
  settings.launchProfiles.paper.venueGuards.ttp.consistency.enabled=consistency;
  settings.launchProfiles.paper.venueGuards.ttp.accountLimits.enabled=accountLimits;
  let loader;
  if (enabled && (!consistency || !accountLimits)) {
    assert.throws(() => loaderForCurrentSettings(), /TTP_(ACCOUNT_LIMITS|CONSISTENCY)_ENABLED=false is illegal/);
    rows.push({enabled,consistency,accountLimits,unchangedLoaderRejection:true});
    continue;
  }
  loader = loaderForCurrentSettings();
  assert.equal(loader.get('evalRules.enabled'),enabled);
  const baseline = consumer('base-executor.cjs', loader)._applyStockShareRange(args);
  const candidate = consumer('candidate-executor.cjs', loader)._applyStockShareRange(args);
  const expected = enabled ? (accountLimits ? 5 : (consistency ? 8 : 40)) : 40;
  assert.equal(baseline.orderQuantity,5);
  assert.equal(candidate.orderQuantity,expected);
  assert.equal(candidate.bounds.reasons.includes('ttp_consistency_profit_cap'),enabled && consistency);
  assert.equal(candidate.bounds.reasons.includes('ttp_daily_loss_risk'),enabled && accountLimits);
  if(enabled && consistency && accountLimits) assert.equal(JSON.stringify(candidate),JSON.stringify(baseline));
  rows.push({enabled,consistency,accountLimits,baseline:baseline.orderQuantity,candidate:candidate.orderQuantity});
}
// Canonical non-eval share limits remain binding when TTP is off.
settings = structuredClone(canonical);settings.entryLogic.sizing.stockShareRange.maxShares=3;
let loader=loaderForCurrentSettings();
assert.equal(consumer('candidate-executor.cjs',loader)._applyStockShareRange(args).orderQuantity,3);
settings.entryLogic.sizing.stockShareRange.enabled=false;loader=loaderForCurrentSettings();
assert.equal(consumer('candidate-executor.cjs',loader)._applyStockShareRange(args).orderQuantity,40);
console.log(JSON.stringify({pass:true,rows,configuredShareLimitPreserved:true,disabledShareRangePreserved:true,limitation:'Actual copied ConfigLoader and AST-extracted native share-sizing methods; synthetic trade inputs, no order submission or runtime activation.'},null,2));
