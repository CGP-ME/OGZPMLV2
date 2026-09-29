'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Original = require('./baseline/modules/EMASMACrossoverSignal');
const Candidate = require('./candidate/modules/EMASMACrossoverSignal');
const settings = require('./baseline/config/settings.json');
const config = { ...settings.strategies.EMASMACrossover,
  ...settings.launchProfiles[settings.launchProfiles.defaultProfile].strategyBehavior.emaCrossover };
const dataPath = path.resolve(__dirname, '../../../../../../tuning/tsla-15m-year1.json');
const bytes = fs.readFileSync(dataPath);
const candles = JSON.parse(bytes).slice(0, 1600);
const consoleLog = console.log;
console.log = () => {};
const original = new Original(config);
const fixed = new Candidate(config);
let published = { ...config };
const retained = Array.from({ length: 3 }, () => new Candidate(config, () => published));
let baselineSignals = 0;
for (let i = 0; i < 400; i++) {
  const history = candles.slice(0, i + 1);
  const before = original.update(candles[i], history);
  const after = fixed.update(candles[i], history);
  assert.deepEqual(after, before);
  for (const module of retained) assert.deepEqual(module.update(candles[i], history), before);
  if (before.direction !== 'neutral') baselineSignals++;
}
const stateKeys = ['crossoverState', 'prevSpreads', 'divergenceHistory', 'signalLog', 'barIndex'];
const changes = { baseConfidence: 0.2, confluenceWeight: 0.2,
  freshCrossoverBonusPerCross: 0.1, freshCrossoverBonusMax: 0.01, maxConfidence: 0.42 };
const results = [];
for (const [key, value] of Object.entries(changes)) {
  published = { ...config, [key]: value };
  for (const module of retained) {
    const refs = stateKeys.map(name => module[name]);
    const prior = JSON.stringify(Object.fromEntries(stateKeys.map(name => [name, module[name]])));
    module.update(null, []);
    assert.equal(JSON.stringify(Object.fromEntries(stateKeys.map(name => [name, module[name]]))), prior);
    stateKeys.forEach((name, i) => assert.equal(module[name], refs[i]));
    assert.equal(module.cfg[key], value);
    assert.equal(module.getSnapshot().config[key], value);
    for (const unchanged of ['decayBars', 'velocityWindowBars', 'elasticityMinAtr']) {
      assert.equal(module.cfg[unchanged], config[unchanged]);
    }
  }
  assert.equal(fixed.cfg[key], config[key]);
  // Compare independently warmed detectors on recorded candles. Confidence
  // publication must alter scoring without changing crossover state/direction.
  const control = new Candidate(config);
  let liveConfidence = config;
  const hot = new Candidate(config, () => liveConfidence);
  let changed = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 400) liveConfidence = published;
    const history = candles.slice(0, i + 1);
    const a = control.update(candles[i], history);
    const b = hot.update(candles[i], history);
    assert.equal(a.direction, b.direction);
    assert.deepEqual(hot.crossoverState, control.crossoverState);
    if (a.confidence !== b.confidence) changed++;
  }
  assert.ok(changed > 0, `${key} must change real recorded-candle scoring`);
  results.push({ key, value, changedSignals: changed });
}
console.log = consoleLog;
console.log(JSON.stringify({ pass: true, baselineSignals, recordedCandles: candles.length,
  dataset: path.relative(process.cwd(), dataPath), sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  retainedInstances: retained.length, results }, null, 2));
