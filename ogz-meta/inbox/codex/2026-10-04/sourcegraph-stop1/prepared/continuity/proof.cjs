const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');
const root = path.resolve(__dirname, '../../../../..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8')).strategies.OGZTPO;
function load(file) {
  const filename = path.join(root, 'core/OgzTpoIntegration.js');
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(fs.readFileSync(path.join(__dirname, file), 'utf8'), filename);
  return m.exports;
}
const Old = load('integration-before.js');
const New = load('integration-candidate.js');
const originalLog = console.log;
console.log = () => {};
let samples = 0;
let disabledEvents = 0;
const symbols = [];
for (const symbol of ['AAA', 'BBB']) {
  const old = new Old({ ...config, enabled: true });
  const reference = new New({ ...config, enabled: true });
  const candidate = new New({ ...config, enabled: true });
  let disabled = false;
  candidate.on('signal', () => { if (disabled) disabledEvents++; });
  for (let i = 0; i < 220; i++) {
    disabled = i >= 65 && i < 175;
    const price = 100 + (symbol === 'BBB' ? 20 : 0) + Math.sin(i / 5) * 9 + i * .02;
    const candle = { t: 1800000000000 + i * 60000, o: price - .2, h: price + 1, l: price - 1, c: price, v: 100 };
    reference.update(candle);
    candidate.config.enabled = !disabled;
    const result = candidate.update(candle);
    if (!disabled) old.update(candle);
    assert.deepStrictEqual(candidate.candleHistory, reference.candleHistory);
    assert.deepStrictEqual(candidate.lastResult, reference.lastResult);
    assert.equal(candidate.barCounter, reference.barCounter);
    if (disabled) {
      assert.equal(result.enabled, false);
      assert.deepStrictEqual(candidate.getVotes(), []);
    }
    if (i === 100) {
      const revised = { ...candle, c: price + .1 };
      reference.update(revised);
      candidate.update(revised);
      assert.equal(candidate.barCounter, reference.barCounter);
      assert.deepStrictEqual(candidate.candleHistory, reference.candleHistory);
      assert.deepStrictEqual(candidate.lastResult, reference.lastResult);
    }
    samples++;
  }
  assert.notDeepStrictEqual(old.candleHistory, candidate.candleHistory);
  symbols.push({ symbol, bars: candidate.barCounter, oldGappedBars: old.barCounter, lastTpo: candidate.getState().current.tpo });
}
assert.equal(disabledEvents, 0);
console.log = originalLog;
const result = { samples, disabledEvents, continuousReferenceMatches: true, sameTimestampReplacement: true, symbols,
  limits: 'Actual integration module + indicator, independent per-symbol instances. Full orchestrator dispatch not exercised in this probe.' };
fs.writeFileSync(path.join(__dirname, 'behavior.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
