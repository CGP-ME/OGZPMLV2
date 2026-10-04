const fs = require('fs'), path = require('path'), Module = require('module'), assert = require('assert');
const root = path.resolve(__dirname, '../../../../..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8'));
function load(name, version) {
  const filename = path.join(root, 'modules', name + '.js');
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(fs.readFileSync(path.join(__dirname, name + '-' + version + '.js'), 'utf8'), filename);
  return m.exports;
}
const names = ['EMASMACrossoverSignal', 'MADynamicSR', 'BreakAndRetest', 'SmartMoneySweep', 'NoWickImbalance', 'OpeningRangeBreakout', 'LiquiditySweepDetector'];
const configs = {
  EMASMACrossoverSignal: { ...cfg.strategies.EMASMACrossover, ...cfg.launchProfiles.paper.strategyBehavior.emaCrossover },
  MADynamicSR: cfg.strategies.MADynamicSR,
  BreakAndRetest: cfg.strategies.BreakRetest,
  SmartMoneySweep: cfg.strategies.SmartMoneySweep,
  NoWickImbalance: cfg.strategies.NoWickImbalance,
  OpeningRangeBreakout: cfg.strategies.OpeningRangeBreakout,
  LiquiditySweepDetector: cfg.strategies.LiquiditySweep,
};
const originalLog = console.log, originalNow = Date.now;
console.log = () => {};
Date.now = () => 1800000000000;
const reports = [];
for (const name of names) {
  const Old = load(name, 'before'), New = load(name, 'candidate');
  const old = new Old(configs[name]), active = new New(configs[name]), observed = new New(configs[name]);
  const candles = [];
  let activeSignals = 0;
  function call(instance, candle, observe) {
    const ctx = { priceHistory: candles, indicators: { atr: 2 }, extras: { symbol: 'AAA', timeframe: '1m' } };
    if (observe) return name === 'NoWickImbalance' ? instance.observe(ctx) : instance.observe(candle, candles);
    if (name === 'NoWickImbalance') return instance.evaluate(ctx);
    if (name === 'LiquiditySweepDetector') return instance.feedCandle(candle);
    return instance.update(candle, candles);
  }
  for (let i = 0; i < 460; i++) {
    const price = 100 + Math.sin(i / 8) * 5 + i * .01;
    const candle = { t: Date.UTC(2026, 9, 1, 12, 0) + i * 60000, o: price - .2, h: price + .8, l: price - .8, c: price, v: 100 + i % 17 };
    candles.push(candle);
    const expected = call(old, candle, false), actual = call(active, candle, false);
    assert.deepStrictEqual(actual, expected, name + ': unchanged active result');
    if (actual?.direction && actual.direction !== 'neutral') activeSignals++;
    if (expected?.hasSignal || (name === 'OpeningRangeBreakout' && expected)) old.consumeSignal();
    if (actual?.hasSignal || (name === 'OpeningRangeBreakout' && actual)) active.consumeSignal();
    const observation = call(observed, candle, true);
    assert.ok(!observation?.direction || observation.direction === 'neutral', name + ': no observed entry');
    assert.ok(!observation?.hasSignal, name + ': no observed signal');
  }
  if (name === 'EMASMACrossoverSignal') {
    assert.deepStrictEqual(observed.prevSpreads, active.prevSpreads);
    assert.deepStrictEqual(observed.divergenceHistory, active.divergenceHistory);
    assert.deepStrictEqual(observed.crossoverState, active.crossoverState);
    assert.equal(observed.signalLog.length, 0);
  }
  if (name === 'MADynamicSR') {
    assert.equal(observed.barCount, active.barCount);
    assert.deepStrictEqual(observed.swings, active.swings);
    assert.deepStrictEqual(observed.srLevels, active.srLevels);
    assert.equal(observed.inPullbackTaken, false);
  }
  if (name === 'BreakAndRetest') {
    assert.equal(observed.barCount, active.barCount);
    assert.deepStrictEqual(observed.recentCandles, active.recentCandles);
    assert.ok(observed.signalLog.every(item => !item.type.startsWith('ENTRY_')));
  }
  if (name === 'SmartMoneySweep') {
    for (const key of ['ivbHigh', 'ivbLow', 'ivbBarCount', 'sessionDay']) assert.deepStrictEqual(observed[key], active[key]);
    assert.equal(observed.lastLongSweepBar, -1);
    assert.equal(observed.lastShortSweepBar, -1);
  }
  if (name === 'OpeningRangeBreakout') {
    assert.deepStrictEqual(observed.recentCandles, active.recentCandles);
    assert.deepStrictEqual(observed.openingRange, active.openingRange);
    assert.equal(observed.pendingSignal, null);
  }
  if (name === 'LiquiditySweepDetector') {
    assert.equal(observed.stats.signalsGenerated, 0);
    assert.deepStrictEqual(observed.state.dailyCandles, active.state.dailyCandles);
  }
  reports.push({ name, candles: 460, activeResultsUnchanged: true, observationEntries: 0, activeSignals });
}
Date.now = originalNow;
console.log = originalLog;
const result = { reports, limits: 'Actual modules with in-memory candles/config objects. Synthetic tape is not exhaustive pattern coverage; full orchestrator dispatch and broker execution not exercised.' };
fs.writeFileSync(path.join(__dirname, 'stateful-behavior.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
