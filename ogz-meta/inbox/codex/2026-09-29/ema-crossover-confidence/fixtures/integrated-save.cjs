'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
// Isolated fixture files and non-secret test strings; no live settings or services.
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-token';
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
const root = path.join(__dirname, 'candidate');
const settingsPath = path.join(root, 'config/settings.json');
const baseline = fs.readFileSync(path.join(__dirname, 'baseline/config/settings.json'));
fs.writeFileSync(settingsPath, baseline);
const Loader = require('./candidate/foundation/ConfigLoader');
const Detector = require('./candidate/modules/EMASMACrossoverSignal');
const snapshot = Loader.load({ loadDotenv: false, silent: true });
const cfg = { ...snapshot.config.strategies.EMASMACrossover,
  ...snapshot.config.strategyBehavior.emaCrossover };
const provider = () => Loader.get('strategies.EMASMACrossover');
const detectors = Array.from({ length: 3 }, () => new Detector(cfg, provider));
const staticDetector = new Detector(cfg);
const candles = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../../tuning/tsla-15m-year1.json')));
for (let i = 0; i < 400; i++) {
  const history = candles.slice(0, i + 1);
  for (const detector of [...detectors, staticDetector]) detector.update(candles[i], history);
}
function save(changes) {
  const receipt = Loader.getSettingsView().configuration;
  return Loader.saveSettings({ requestId: 'ema-fixture', expectedRevision: receipt.settings,
    expectedSettingsHash: receipt.settingsHash, changes });
}
const before = Loader.getSettingsView().configuration;
const changed = save({ 'strategies.EMASMACrossover.baseConfidence': 0.2,
  'strategies.EMASMACrossover.confluenceWeight': 0.2,
  'strategies.EMASMACrossover.freshCrossoverBonusPerCross': 0.1,
  'strategies.EMASMACrossover.freshCrossoverBonusMax': 0.1,
  'strategies.EMASMACrossover.maxConfidence': 0.6 });
assert.equal(changed.applied, true);
assert.equal(changed.saved, true);
assert.equal(Loader.getSettingsView().configuration.settings, before.settings + 1);
assert.equal(JSON.parse(fs.readFileSync(settingsPath)).strategies.EMASMACrossover.baseConfidence, 0.2);
const history = candles.slice(0, 401);
const fixedSignal = staticDetector.update(candles[400], history);
for (const detector of detectors) {
  const state = detector.crossoverState;
  const signal = detector.update(candles[400], history);
  assert.equal(detector.crossoverState, state);
  assert.notEqual(signal.confidence, fixedSignal.confidence);
  assert.equal(signal.direction, fixedSignal.direction);
  assert.equal(detector.cfg.baseConfidence, 0.2);
  assert.equal(detector.configReceipt.maxConfidence, 0.6);
}
const accepted = Loader.getSettingsView().configuration;
for (const changes of [
  { 'strategies.EMASMACrossover.baseConfidence': '0.3' },
  { 'strategies.EMASMACrossover.baseConfidence': -0.1 },
  { 'strategies.EMASMACrossover.maxConfidence': 0.1 },
]) {
  assert.equal(save(changes).applied, false);
  assert.deepEqual(Loader.getSettingsView().configuration, accepted);
}
const loadedAgain = Loader.load({ force: true, loadDotenv: false, silent: true });
assert.equal(loadedAgain.config.strategies.EMASMACrossover.baseConfidence, 0.2);
console.log(JSON.stringify({ pass: true, realSave: true, diskPersistence: true, retainedInstances: 3,
  invalidSavesUnpublished: 3, validForcedReload: true, beforeRevision: before.settings,
  afterRevision: accepted.settings }));
fs.writeFileSync(settingsPath, baseline);
