'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const assert = require('node:assert/strict');
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-token';
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
const Loader = require('./candidate/foundation/ConfigLoader');
const Detector = require('./candidate/modules/EMASMACrossoverSignal');
const settingsPath = path.join(__dirname, 'candidate/config/settings.json');
const original = fs.readFileSync(path.join(__dirname, 'baseline/config/settings.json'));
fs.writeFileSync(settingsPath, original);
const snapshot = Loader.load({ silent: true, loadDotenv: false });
const emaConfig = { ...snapshot.config.strategies.EMASMACrossover, ...snapshot.config.strategyBehavior.emaCrossover };
const evidence = [];
function nodes(file, name) {
  const source = fs.readFileSync(path.join(__dirname, 'candidate', file), 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', locations: true });
  const found = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'NewExpression' && node.callee.name === name) {
      found.push({ node, source: source.slice(node.start, node.end), file });
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
function instantiate(found, additions = {}) {
  const sandbox = { EMASMACrossoverSignal: Detector, ConfigLoader: Loader, emaConfig,
    owner: { emaCrossoverConfig: emaConfig }, ...additions };
  evidence.push({ file: found.file, line: found.node.loc.start.line, expression: found.source });
  return vm.runInNewContext(`(function () { return ${found.source}; }).call(owner)`, sandbox);
}
const runner = nodes('run-empire-v2.js', 'EMASMACrossoverSignal');
const symbol = nodes('core/SymbolTradingContext.js', 'EMASMACrossoverSignal');
const orchestrator = nodes('core/StrategyOrchestrator.js', 'EMASMACrossoverSignal');
assert.equal(runner.length, 1);
assert.equal(symbol.length, 1);
assert.equal(orchestrator.length, 2);
const contexts = nodes('run-empire-v2.js', 'SymbolTradingContext');
assert.equal(contexts.length, 1);
// Execute the actual runner options producer and actual SymbolTradingContext
// detector constructor expression, without constructing unrelated services.
class SymbolContextConstructorProbe {
  constructor(sym, store, config) {
    this.emaCrossover = instantiate(symbol[0], { config });
  }
}
const routed = instantiate(contexts[0], { SymbolTradingContext: SymbolContextConstructorProbe,
  sym: 'TSLA', metadata: { timeframe: '15m' }, resolvedConfig: snapshot,
  owner: { _candleStore: {} } });
const retained = [instantiate(runner[0]), routed.emaCrossover, ...orchestrator.map(node => instantiate(node))];
const fixed = new Detector(emaConfig);
const dataPath = path.resolve(__dirname, '../../../../../../tuning/tsla-15m-year1.json');
const candles = JSON.parse(fs.readFileSync(dataPath));
try {
  for (let i = 0; i < 400; i++) {
    const history = candles.slice(0, i + 1);
    const expected = fixed.update(candles[i], history);
    for (const detector of retained) assert.deepEqual(detector.update(candles[i], history), expected);
  }
  const configuration = Loader.getSettingsView().configuration;
  const result = Loader.saveSettings({ requestId: 'actual-constructor-publish',
    expectedRevision: configuration.settings, expectedSettingsHash: configuration.settingsHash,
    changes: { 'strategies.EMASMACrossover.baseConfidence': 0.2 } });
  assert.equal(result.applied, true);
  const expected = fixed.update(candles[400], candles.slice(0, 401));
  for (const detector of retained) {
    const previousState = detector.crossoverState;
    const actual = detector.update(candles[400], candles.slice(0, 401));
    assert.equal(detector.crossoverState, previousState);
    assert.equal(detector.cfg.baseConfidence, 0.2);
    assert.equal(actual.direction, expected.direction);
    assert.notEqual(actual.confidence, expected.confidence);
  }
  console.log(JSON.stringify({ pass: true, actualProductionConstructors: retained.length,
    symbolOptionsProducerExecuted: true, warmupCandles: 400, realSaveSettingsPublication: true,
    evidence }, null, 2));
} finally {
  fs.writeFileSync(settingsPath, original);
}
