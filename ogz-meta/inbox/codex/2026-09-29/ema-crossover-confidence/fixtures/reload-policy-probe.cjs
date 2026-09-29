'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-token';
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
const settingsPath = path.join(__dirname, 'candidate/config/settings.json');
const internalsPath = path.join(__dirname, 'candidate/config/internals.json');
const original = fs.readFileSync(path.join(__dirname, 'baseline/config/settings.json'));
const originalInternals = fs.readFileSync(internalsPath);
const loaderPath = path.join(__dirname, 'candidate/foundation/ConfigLoader.js');
const source = fs.readFileSync(loaderPath, 'utf8');
const m = new Module(loaderPath, module);
m.filename = loaderPath;
m.paths = Module._nodeModulePaths(path.dirname(loaderPath));
// Test-only identity observation; production exports are unchanged.
const globals = ['settingsConfigFile', 'internalsConfigFile', 'activeEnv', 'activeEnvSources',
  'activeLaunchProfileContext', 'activeCredentialEnv', 'activeCredentialSources',
  'activeProcessRole', 'activeRunDescriptor', '_cached', '_cachedRole'];
m._compile(source + '\nmodule.exports.probeGlobals = () => ({' + globals.join(',') + '});', loaderPath);
const Loader = m.exports;
const Detector = require('./candidate/modules/EMASMACrossoverSignal');
try {
  const settings = JSON.parse(original);
  settings.strategies.EMASMACrossover.baseConfidence = '0.4';
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const initial = Loader.load({ loadDotenv: false, silent: true });
  const cfg = { ...initial.config.strategies.EMASMACrossover, ...initial.config.strategyBehavior.emaCrossover };
  const detector = new Detector(cfg, () => Loader.get('strategies.EMASMACrossover'));
  detector.update(null, []);
  assert.equal(detector.cfg.baseConfidence, 0.4);
  const receipt = Loader.getSettingsView().configuration;
  const accepted = Loader.saveSettings({ requestId: 'numeric-string-preserved',
    expectedRevision: receipt.settings, expectedSettingsHash: receipt.settingsHash,
    changes: { 'strategies.EMASMACrossover.confluenceWeight': 0.3 } });
  assert.equal(accepted.applied, true);
  detector.update(null, []);
  assert.equal(detector.cfg.baseConfidence, 0.4);
  assert.equal(detector.cfg.confluenceWeight, 0.3);
  const acceptedBytes = fs.readFileSync(settingsPath);
  const before = Loader.probeGlobals();
  const priorReceipt = Loader.getSettingsView().configuration;
  const priorCanonical = Loader.getConfigFileValue('strategies.EMASMACrossover');
  const priorInternalsRevision = Loader.getInternalsFileValue('revision');
  settings.strategies.EMASMACrossover.baseConfidence = 0.4;
  settings.strategies.EMASMACrossover.maxConfidence = 0.1;
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const invalidInternals = JSON.parse(originalInternals);
  invalidInternals.revision += 1;
  fs.writeFileSync(internalsPath, JSON.stringify(invalidInternals));
  const rejection = Loader.load({ force: true, loadDotenv: false, silent: true });
  assert.equal(rejection.success, false);
  assert.equal(rejection.applied, false);
  assert.equal(rejection.reloaded, false);
  assert.equal(rejection.reason, 'ema_crossover_max_confidence_below_base');
  const after = Loader.probeGlobals();
  for (const name of globals) assert.equal(after[name], before[name], name);
  let invalidLeavesChecked = 0;
  for (const key of ['baseConfidence', 'confluenceWeight', 'freshCrossoverBonusPerCross', 'freshCrossoverBonusMax', 'maxConfidence']) {
    for (const value of [-1, 1.1, 'not-a-number', { toString: null }]) {
      const malformed = JSON.parse(acceptedBytes);
      malformed.strategies.EMASMACrossover[key] = value;
      fs.writeFileSync(settingsPath, JSON.stringify(malformed));
      const result = Loader.load({ force: true, loadDotenv: false, silent: true });
      assert.equal(result.applied, false);
      assert.equal(result.path, `strategies.EMASMACrossover.${key}`);
      const preserved = Loader.probeGlobals();
      for (const name of globals) assert.equal(preserved[name], before[name], name);
      invalidLeavesChecked++;
    }
  }
  assert.deepEqual(Loader.getSettingsView().configuration, priorReceipt);
  assert.deepEqual(Loader.getConfigFileValue('strategies.EMASMACrossover'), priorCanonical);
  assert.equal(Loader.getInternalsFileValue('revision'), priorInternalsRevision);
  assert.equal(Loader.load({ silent: true }), before._cached);
  detector.update(null, []);
  assert.equal(detector.cfg.maxConfidence, 1);
  assert.throws(() => new Detector({ ...cfg, maxConfidence: 0.1 }), /maxConfidence must be >= baseConfidence/);
  const blockedSave = Loader.saveSettings({ requestId: 'changed-disk',
    expectedRevision: priorReceipt.settings, expectedSettingsHash: priorReceipt.settingsHash,
    changes: { 'strategies.EMASMACrossover.confluenceWeight': 0.2 } });
  assert.equal(blockedSave.reason, 'settings_changed_outside_loaded_owner');
  fs.writeFileSync(settingsPath, acceptedBytes);
  fs.writeFileSync(internalsPath, originalInternals);
  const laterSave = Loader.saveSettings({ requestId: 'after-rejection',
    expectedRevision: priorReceipt.settings, expectedSettingsHash: priorReceipt.settingsHash,
    changes: { 'strategies.EMASMACrossover.confluenceWeight': 0.2 } });
  assert.equal(laterSave.applied, true);
  detector.update(null, []);
  assert.equal(detector.cfg.confluenceWeight, 0.2);
  const validReload = Loader.load({ force: true, loadDotenv: false, silent: true });
  assert.equal(validReload.config.strategies.EMASMACrossover.confluenceWeight, 0.2);
  const freshModule = new Module(loaderPath, module);
  freshModule.filename = loaderPath;
  freshModule.paths = Module._nodeModulePaths(path.dirname(loaderPath));
  freshModule._compile(source, loaderPath);
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const initialInvalid = freshModule.exports.load({ loadDotenv: false, silent: true });
  assert.equal(initialInvalid.config.strategies.EMASMACrossover.maxConfidence, 0.1);
  console.log(JSON.stringify({ numericStringCompatibility: true, saveWithUnchangedNumericString: true,
    forcedReloadIsFixtureOnlyNoIdentifiedProductionCaller: true,
    forcedReloadExplicitRejection: true, preservedGlobalIdentities: globals.length,
    invalidLeavesChecked,
    publicCanonicalReadersUnchanged: true, receiptAndRoleUnchanged: true,
    noNewInitialLoadRejection: true,
    laterSaveWorksAfterExternalFileRestored: true, validReloadUnchanged: true }));
} finally {
  fs.writeFileSync(settingsPath, original);
  fs.writeFileSync(internalsPath, originalInternals);
}
