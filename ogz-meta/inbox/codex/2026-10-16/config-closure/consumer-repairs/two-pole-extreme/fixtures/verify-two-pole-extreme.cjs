'use strict';
const path = require('path');
const sourceName = process.env.SOURCE || 'source-candidate';
const root = path.resolve(__dirname, sourceName);
for (const key of ['WEBSOCKET_AUTH_TOKEN','ALPACA_API_KEY','ALPACA_API_SECRET','KRAKEN_API_KEY','KRAKEN_API_SECRET']) process.env[key] = 'fixture-only';
process.env.DOTENV_CONFIG_PATH = path.join(root, 'env.js');
const Loader = require(path.join(root, 'foundation/ConfigLoader.js'));
const TwoPole = require(path.join(root, 'core/TwoPoleOscillator.js'));
const snapshot = Loader.load({ role: 'bot', silent: true });
const base = snapshot.config.indicators.optimized.twoPole;
function quietConfidence(instance, oscillator, filtered = oscillator) {
  const oldLog = console.log;
  console.log = () => {};
  try { return instance.calculateSignalConfidence(oscillator, filtered); }
  finally { console.log = oldLog; }
}
function instance(cfg) { return new TwoPole({ ...cfg, zoneLogDigits: 3, deltaLogDigits: 3, priceLogDigits: 3, riskLogDigits: 3 }); }
const asymmetric = instance({ ...base, extremeOverbought: 1.5, extremeOversold: -0.5 });
const currentNegative = quietConfidence(asymmetric, -0.75);
const currentPositive = quietConfidence(asymmetric, 1.5);
const request = {
  requestId: 'two-pole-extreme-fixture',
  expectedRevision: snapshot.revisions.settings,
  expectedSettingsHash: snapshot.revisions.settingsHash,
  changes: { 'indicators.optimized.twoPole.extremeOversold': -0.75 },
};
const save = Loader.saveSettings(request);
const oldInstance = instance(base);
const oldRetained = quietConfidence(oldInstance, -0.75);
let fresh = null;
if (save.success) {
  Loader._resetForTest();
  const refreshed = Loader.load({ role: 'bot', silent: true });
  fresh = instance(refreshed.config.indicators.optimized.twoPole);
}
const freshValue = fresh ? quietConfidence(fresh, -0.75) : null;
const result = {
  source: sourceName,
  save: { success: save.success, reason: save.reason || null },
  asymmetry: { negative: currentNegative, positive: currentPositive },
  retainedOldInstance: oldRetained,
  freshAfterSave: freshValue,
  descriptorVisibleAfterSave: save.success,
  canonicalThresholdBeforeSave: base.extremeOversold,
  freshThreshold: fresh ? fresh.extremeOversold : null,
};
console.log(JSON.stringify(result));

const assert = require('node:assert/strict');
if (sourceName === 'source-candidate') {
  assert.equal(save.success, true);
  assert.equal(fresh.extremeOversold, -0.75);
  assert.equal(oldRetained, 65);
  assert.equal(freshValue, 85);
  assert.equal(currentNegative, 85);
  assert.equal(currentPositive, 85);
  const OldTwoPole = require(path.resolve(__dirname, 'source-baseline/core/TwoPoleOscillator.js'));
  const baselineInstance = new OldTwoPole({...base, zoneLogDigits:3,deltaLogDigits:3,priceLogDigits:3,riskLogDigits:3});
  const unchangedInstance = instance(base);
  for (const oscillator of [-2,-1,-0.75,-0.1,0,0.1,0.75,1,2]) {
    for (const offset of [-0.3,0,0.3]) {
      assert.equal(quietConfidence(unchangedInstance,oscillator,oscillator+offset),quietConfidence(baselineInstance,oscillator,oscillator+offset));
    }
  }
} else {
  assert.equal(save.success,false);
  assert.equal(save.reason,'setting_not_hot_editable');
  assert.equal(currentNegative,65);
  assert.equal(currentPositive,85);
}
console.log(JSON.stringify({assertionsPassed:true,baselineDefaultsPreserved:sourceName==='source-candidate'}));
