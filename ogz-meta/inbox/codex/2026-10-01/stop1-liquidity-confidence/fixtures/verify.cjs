'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const acorn = require('acorn');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-token';
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
const packet = path.dirname(__dirname);
const repo = path.resolve(__dirname, '../../../../../..');
const reviewTree = process.env.LIQUIDITY_REVIEW_TREE;
const review = reviewTree === undefined ? null : require('./review-source.cjs')(reviewTree, packet, repo);
const candidateRoot = review ? review.root : path.join(__dirname, 'candidate');
const resultPath = review ? review.resultPath : path.join(packet, 'verification.json');
const readCandidate = file => review ? review.read(file) : fs.readFileSync(path.join(candidateRoot, file));
if (review) {
  process.on('uncaughtExceptionMonitor', error => {
    fs.writeFileSync(resultPath, JSON.stringify({ pass: false, sourceSelection: review.selection,
      selectedSourceHashes: review.sourceHashes, loadedSourceHashes: review.loadedHashes,
      untrackedDependencyFallbackRejected: review.untrackedDependencyFallbackRejected,
      error: { name: error.name, message: error.message } }, null, 2) + '\n');
  });
}
const settingsPath = path.join(candidateRoot, 'config/settings.json');
const internalsPath = path.join(candidateRoot, 'config/internals.json');
const originalSettings = review ? review.read('config/settings.json') : fs.readFileSync(path.join(__dirname, 'baseline/config/settings.json'));
const originalInternals = review ? review.read('config/internals.json') : fs.readFileSync(path.join(__dirname, 'baseline/config/internals.json'));
const loaderPath = path.join(candidateRoot, 'foundation/ConfigLoader.js');
const globals = ['settingsConfigFile', 'internalsConfigFile', 'activeEnv', 'activeEnvSources',
  'activeLaunchProfileContext', 'activeCredentialEnv', 'activeCredentialSources',
  'activeProcessRole', 'activeRunDescriptor', '_cached', '_cachedRole'];
const loaderSource = readCandidate('foundation/ConfigLoader.js').toString('utf8');
const probeGlobals = '\nmodule.exports.probeGlobals=()=>({' + globals.join(',') + '});';
let Loader;
if (review) Loader = review.load('foundation/ConfigLoader.js', probeGlobals);
else {
  const loaderModule = new Module(loaderPath, module);
  loaderModule.filename = loaderPath;
  loaderModule.paths = Module._nodeModulePaths(path.dirname(loaderPath));
  loaderModule._compile(loaderSource + probeGlobals, loaderPath);
  Loader = loaderModule.exports;
}
const Candidate = review ? review.load('modules/LiquiditySweepDetector.js') : require('./candidate/modules/LiquiditySweepDetector');
const Baseline = review ? Candidate : require('./baseline/modules/LiquiditySweepDetector');
const weights = ['manipCandle', 'wickSweep', 'sweepReject', 'hammerPattern', 'engulfPattern'];
const dataPath = path.resolve(__dirname, '../../../../../../tuning/tsla-15m-year1.json');
const tapeBytes = review ? review.read('tuning/tsla-15m-year1.json') : fs.readFileSync(dataPath);
const tape = JSON.parse(tapeBytes);
const log = console.log;
const error = console.error;
const now = Date.now;
const errors = [];
console.log = () => {};
console.error = (...args) => errors.push(args.join(' '));
Date.now = () => 123456789;
function reset(settingsBytes = originalSettings) {
  fs.writeFileSync(settingsPath, settingsBytes);
  fs.writeFileSync(internalsPath, originalInternals);
  Loader._resetForTest();
  return Loader.load({ silent: true, loadDotenv: false });
}
function save(changes) {
  const r = Loader.getSettingsView().configuration;
  return Loader.saveSettings({ requestId: 'liquidity-weights-fixture', expectedRevision: r.settings,
    expectedSettingsHash: r.settingsHash, changes });
}
const constructorEvidence = [];
function expressions(file) {
  const source = readCandidate(file).toString('utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', locations: true });
  const found = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'NewExpression' && node.callee.name === 'LiquiditySweepDetector') {
      found.push({ file, line: node.loc.start.line, expression: source.slice(node.start, node.end) });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  return found;
}
const runnerConstructors = expressions('run-empire-v2.js');
const orchestratorConstructors = expressions('core/StrategyOrchestrator.js');
assert.equal(runnerConstructors.length, 1);
assert.equal(orchestratorConstructors.length, 2);
constructorEvidence.push(...runnerConstructors, ...orchestratorConstructors);
function construct(entry, config) {
  return vm.runInNewContext(`(function(){return ${entry.expression};}).call(owner)`, {
    LiquiditySweepDetector: Candidate, ConfigLoader: Loader, liqConfig: config,
    owner: { liquiditySweepConfig: config },
  });
}
function stateSnapshot(detector) {
  return JSON.stringify({ state: detector.state, interval: detector._candleIntervalMs,
    daily: detector._dailyCandle, buffer: detector._openingBuffer, stats: detector.stats });
}
const results = [];
try {
  for (const key of weights) {
    const snapshot = reset();
    const config = snapshot.config.strategies.LiquiditySweep;
    const modifiedConfig = { ...config, weights: { ...config.weights, [key]: 0 } };
    const actors = constructorEvidence.map((entry, index) => ({ index,
      managed: construct(entry, config), control: new Baseline(config), oracle: new Baseline(modifiedConfig),
      fixed: new Candidate(config), changed: 0, generated: 0, patterns: new Set() }));
    for (const actor of actors) {
      const generate = actor.managed._generateSignal;
      actor.managed._generateSignal = function (...args) {
        actor.generated++;
        actor.patterns.add(args[0].type);
        return generate.apply(this, args);
      };
    }
    let persistedRevision;
    for (let i = 0; i < tape.length; i++) {
      if (i === 1800) {
        const before = actors.map(actor => stateSnapshot(actor.managed));
        const outcome = save({ [`strategies.LiquiditySweep.weights.${key}`]: 0 });
        assert.equal(outcome.applied, true);
        assert.equal(outcome.saved, true);
        persistedRevision = outcome.configuration.settings;
        assert.equal(JSON.parse(fs.readFileSync(settingsPath)).strategies.LiquiditySweep.weights[key], 0);
        actors.forEach((actor, j) => assert.equal(stateSnapshot(actor.managed), before[j]));
      }
      for (const actor of actors) {
        const controlSignal = actor.control.feedCandle(tape[i]);
        const expected = actor.oracle.feedCandle(tape[i]);
        const actual = actor.managed.feedCandle(tape[i]);
        const fixed = actor.fixed.feedCandle(tape[i]);
        assert.deepEqual(fixed, controlSignal);
        assert.deepEqual(actual, i < 1800 ? controlSignal : expected);
        assert.equal(stateSnapshot(actor.managed), stateSnapshot(i < 1800 ? actor.control : actor.oracle));
        if (actual.hasSignal && actual.confidence !== controlSignal.confidence) actor.changed++;
        // Actual runner keeps its materialized signal; orchestrator consumes it.
        if (actor.index > 0) {
          for (const detector of [actor.managed, actor.control, actor.oracle, actor.fixed]) {
            if (detector.getSignal().hasSignal) detector.consumeSignal();
          }
        }
      }
    }
    for (const actor of actors) {
      assert.ok(actor.changed > 0, key);
      assert.equal(actor.managed.getStatus().confidenceWeights[key], 0);
      assert.equal(actor.fixed.config.weights[key], config.weights[key]);
    }
    results.push({ key, savedValue: 0, persistedRevision, actors: actors.map(actor => ({
      site: constructorEvidence[actor.index], generated: actor.generated, changedOutputs: actor.changed,
      patterns: [...actor.patterns] })) });
  }

  // Publish while an actual recorded-data root signal remains materialized.
  const snapshot = reset();
  const managed = construct(runnerConstructors[0], snapshot.config.strategies.LiquiditySweep);
  let firstIndex;
  for (let i = 0; i < tape.length; i++) {
    if (managed.feedCandle(tape[i]).hasSignal) { firstIndex = i; break; }
  }
  assert.ok(firstIndex > 0);
  const priorSignal = managed.state.signal;
  const priorConfidence = priorSignal.confidence;
  const priorState = stateSnapshot(managed);
  assert.equal(save({ 'strategies.LiquiditySweep.weights.manipCandle': 2 }).applied, true);
  assert.equal(managed.getSignal().confidence, priorConfidence);
  assert.equal(managed.state.signal, priorSignal);
  assert.equal(stateSnapshot(managed), priorState);
  managed.feedCandle(tape[firstIndex + 1]);
  assert.equal(managed.state.signal, priorSignal);
  assert.equal(managed.getSignal().confidence, priorConfidence);
  let nextGenerated = false;
  const originalGenerate = managed._generateSignal;
  managed._generateSignal = function (...args) { nextGenerated = true; return originalGenerate.apply(this, args); };
  for (let i = firstIndex + 2; i < tape.length && !nextGenerated; i++) managed.feedCandle(tape[i]);
  assert.ok(nextGenerated);
  assert.equal(managed.config.weights.manipCandle, 2);
  assert.equal(managed.getSignal().confidence, 1);

  // All malformed external replacements reject explicitly, preserving every
  // configuration owner reference and leaving initial-load behavior untouched.
  reset();
  const initial = Loader.probeGlobals();
  const initialReceipt = Loader.getSettingsView().configuration;
  let rejectedSaves = 0;
  let rejectedReloads = 0;
  for (const key of weights) {
    for (const value of [-1, null, 'bad', '1e999', { toString: null }]) {
      const outcome = save({ [`strategies.LiquiditySweep.weights.${key}`]: value });
      assert.equal(outcome.applied, false);
      assert.deepEqual(Loader.getSettingsView().configuration, initialReceipt);
      rejectedSaves++;
      const malformed = JSON.parse(originalSettings);
      malformed.strategies.LiquiditySweep.weights[key] = value;
      fs.writeFileSync(settingsPath, JSON.stringify(malformed));
      const changedInternals = JSON.parse(originalInternals);
      changedInternals.revision++;
      fs.writeFileSync(internalsPath, JSON.stringify(changedInternals));
      const rejection = Loader.load({ force: true, silent: true, loadDotenv: false });
      assert.equal(rejection.applied, false);
      assert.equal(rejection.reloaded, false);
      assert.equal(rejection.reason, 'invalid_liquidity_sweep_weight');
      assert.equal(rejection.path, `strategies.LiquiditySweep.weights.${key}`);
      const after = Loader.probeGlobals();
      for (const name of globals) assert.equal(after[name], initial[name], name);
      assert.deepEqual(Loader.getSettingsView().configuration, initialReceipt);
      assert.deepEqual(Loader.getConfigFileValue('strategies.LiquiditySweep.weights'), initial._cached.config.strategies.LiquiditySweep.weights);
      assert.equal(Loader.getInternalsFileValue('revision'), JSON.parse(originalInternals).revision);
      rejectedReloads++;
      fs.writeFileSync(settingsPath, originalSettings);
      fs.writeFileSync(internalsPath, originalInternals);
    }
  }
  assert.equal(save({ 'strategies.LiquiditySweep.weights.manipCandle': 2 }).applied, true);
  const strings = JSON.parse(fs.readFileSync(settingsPath));
  strings.strategies.LiquiditySweep.weights.manipCandle = '2';
  fs.writeFileSync(settingsPath, JSON.stringify(strings));
  const validReload = Loader.load({ force: true, silent: true, loadDotenv: false });
  assert.equal(validReload.config.strategies.LiquiditySweep.weights.manipCandle, '2');
  const numericStringInstance = construct(runnerConstructors[0], validReload.config.strategies.LiquiditySweep);
  assert.equal(numericStringInstance.config.weights.manipCandle, 2);
  assert.equal(errors.length, rejectedReloads);
  const acceptedBytes = fs.readFileSync(settingsPath);
  const roleOwner = Loader.probeGlobals();
  fs.writeFileSync(settingsPath, '{ deliberately unreadable fixture JSON');
  let roleRejections = 0;
  for (const role of ['dashboard', 'checkout', 'supervisor', 'market-data-tool']) {
    const outcome = Loader.load({ force: true, role, silent: true, loadDotenv: false });
    assert.equal(outcome.reason, 'forced_reload_role_change_rejected');
    assert.equal(outcome.applied, false);
    assert.equal(outcome.reloaded, false);
    assert.equal(outcome.requestedRole, role);
    assert.equal(outcome.currentRole, 'bot');
    const after = Loader.probeGlobals();
    for (const name of globals) assert.equal(after[name], roleOwner[name], name);
    roleRejections++;
  }
  fs.writeFileSync(settingsPath, acceptedBytes);
  assert.equal(save({ 'strategies.LiquiditySweep.weights.wickSweep': 0.05 }).applied, true);
  let signalAfterRoleRejection;
  for (const candle of tape) {
    signalAfterRoleRejection = numericStringInstance.feedCandle(candle);
    if (signalAfterRoleRejection.hasSignal) break;
  }
  assert.equal(signalAfterRoleRejection.hasSignal, true);
  assert.equal(numericStringInstance.config.weights.manipCandle, 2);
  assert.equal(numericStringInstance.config.weights.wickSweep, 0.05);
  const missing = JSON.parse(originalSettings);
  delete missing.strategies.LiquiditySweep.weights.manipCandle;
  fs.writeFileSync(settingsPath, JSON.stringify(missing));
  const beforeMissing = Loader.probeGlobals();
  const missingRejected = Loader.load({ force: true, silent: true, loadDotenv: false });
  assert.equal(missingRejected.applied, false);
  assert.equal(missingRejected.path, 'strategies.LiquiditySweep.weights.manipCandle');
  for (const name of globals) assert.equal(Loader.probeGlobals()[name], beforeMissing[name]);
  // Initial loader behavior remains unchanged; the existing constructor owns
  // its existing required-field validation. No startup rejection is added.
  Loader._resetForTest();
  const initialMissing = Loader.load({ silent: true, loadDotenv: false });
  assert.equal(initialMissing.config.strategies.LiquiditySweep.weights.manipCandle, undefined);
  assert.throws(() => new Candidate(initialMissing.config.strategies.LiquiditySweep), /manipCandle is required/);
  const receipt = { pass: true, recordedCandles: tape.length,
    sourceSelection: review ? review.selection : { mode: 'portable_builder_candidate', patchesApplied: true },
    selectedSourceHashes: review ? review.sourceHashes : undefined,
    loadedSourceHashes: review ? review.loadedHashes : undefined,
    untrackedDependencyFallbackRejected: review ? review.untrackedDependencyFallbackRejected : undefined,
    recordedSha256: crypto.createHash('sha256').update(tapeBytes).digest('hex'), constructorEvidence,
    scenarios: results, priorMaterializedSignalPreserved: true, greaterThanOneAccepted: true,
    NumberStringCompatibility: true, rejectedSaves, rejectedReloads,
    missingReplacementRejected: true, initialLoadBehaviorUnchanged: true,
    roleRejections, roleRejectionBeforeDiskRead: true, retainedSignalAfterRoleRejection: true,
    rollbackGlobalCount: globals.length, namedErrors: errors,
    loaderSha256: crypto.createHash('sha256').update(loaderSource).digest('hex') };
  fs.writeFileSync(resultPath, JSON.stringify(receipt, null, 2) + '\n');
} finally {
  fs.writeFileSync(settingsPath, originalSettings);
  fs.writeFileSync(internalsPath, originalInternals);
  console.log = log;
  console.error = error;
  Date.now = now;
}
console.log(JSON.stringify({ pass: true, weightScenarios: results.length, actualConstructorSites: 3,
  recordedCandles: tape.length, receipt: resultPath }));
