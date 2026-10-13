'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const repo = path.resolve(__dirname, '../../../../../..');
const ref = process.argv.find(a => a.startsWith('--candidate-ref='))?.split('=')[1];
assert.ok(ref, 'Pass immutable --candidate-ref');
const read = name => cp.execFileSync('git', ['show', `${ref}:${name}`], {cwd:repo,encoding:'utf8'});
const allowed = new Set(['core/indicators/IndicatorEngine.js','core/CandleHelper.js','core/dto/IndicatorSnapshotDTO.js','core/ogzTwoPoleOscillator.js','core/CandleStore.js','core/ContractValidator.js']);
const cache = new Map();
function load(name) {
  assert.ok(allowed.has(name), `Unqualified repository dependency ${name}`);
  if(cache.has(name)) return cache.get(name).exports;
  const filename=path.join(repo,name), mod=new Module(filename,module);
  mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(name,mod);
  mod.require=function(request) {
    if(request.startsWith('.')) {
      let target=path.relative(repo,path.resolve(path.dirname(filename),request));
      if(!target.endsWith('.js'))target+='.js';
      return load(target);
    }
    return Module.prototype.require.call(mod,request);
  };
  mod._compile(read(name),filename);return mod.exports;
}
const Engine=load('core/indicators/IndicatorEngine.js');
const settings=JSON.parse(read('config/settings.json'));
const internals=JSON.parse(read('config/internals.json'));
const config = { ...settings.indicators.engine, ...internals.indicators.engine, maxCandles: 32, maxSeriesPoints: 32, symbol: 'TSLA', tf: '1m' };
const candle = (i, change = 0) => {
  const close = 100 + Math.sin(i / 9) * 4 + i * 0.01 + change;
  return { t: 1700000000000 + i * 60000, o: close - 0.2, h: close + 0.8, l: close - 0.9, c: close, v: 1000 + i % 97 };
};
const comparable = engine => {
  const state = engine.getRawState(); state.updatedAt = null;
  const render = engine.getRenderPacket(); render.timestamp = null;
  return { state, indicators: engine.getSnapshot().indicators, render };
};
const fresh = (length, replacements = new Map(), omitted = new Set()) => {
  const e = new Engine(config);
  for (let i=0;i<length;i++) if (!omitted.has(i)) e.updateCandle(replacements.get(i) || candle(i));
  return e;
};
const actual = length => fresh(length);
const results=[];
{
  const e=actual(301); e.updateCandle(candle(281,3));
  assert.deepEqual(comparable(e), comparable(fresh(301,new Map([[281,candle(281,3)]]))));
  results.push('301 revision');
}
{
  const e=actual(101); e.updateCandle(candle(90,2));
  assert.deepEqual(comparable(e), comparable(fresh(101,new Map([[90,candle(90,2)]]))));
  assert.ok(e.candles.length <= config.maxCandles); assert.ok(e._previousCandleChunk.length <= config.maxCandles); assert.ok(e._currentCandleChunk.length <= config.maxCandles);
  results.push('101 current revision bounded');
}
{
  const e=actual(101); e.updateCandle(candle(75,2));
  assert.deepEqual(comparable(e), comparable(fresh(101,new Map([[75,candle(75,2)]]))));
  assert.ok(e.candles.length <= config.maxCandles); assert.ok(e._previousCandleChunk.length <= config.maxCandles); assert.ok(e._currentCandleChunk.length <= config.maxCandles);
  results.push('101 previous revision bounded');
}
{
  const e=fresh(101,new Map(),new Set([90])); e.updateCandle(candle(90));
  assert.deepEqual(comparable(e), comparable(fresh(101)));
  assert.ok(e.candles.length <= config.maxCandles); assert.ok(e._previousCandleChunk.length <= config.maxCandles); assert.ok(e._currentCandleChunk.length <= config.maxCandles);
  results.push('101 missing insertion bounded');
}
const {CandleStore}=load('core/CandleStore.js');
const store=new CandleStore({maxCandles:32,validator:{validateCandle(){}}});
const engine=new Engine(config);
for(let i=0;i<101;i++) {store.addCandle('TSLA','1m',candle(i));engine.updateCandle(candle(i));}
for(const i of [90,75,100]) {const bar=candle(i,2);store.addCandle('TSLA','1m',bar);engine.updateCandle(bar);}
const expected=fresh(101,new Map([75,90,100].map(i=>[i,candle(i,2)])));
assert.deepEqual(store.getCandles('TSLA','1m'),expected.candles);
assert.deepEqual(comparable(engine),comparable(expected));
results.push('store and engine maintain identical chronological retained windows');
config.maxCandles=internals.indicators.engine.maxCandles;
config.maxSeriesPoints=internals.indicators.engine.maxSeriesPoints;
const full=fresh(301);full.updateCandle(candle(281,3));
assert.deepEqual(comparable(full),comparable(fresh(301,new Map([[281,candle(281,3)]]))));
results.push('canonical retention and indicator settings, 301-candle correction');
console.log(JSON.stringify({status:'pass',candidateRef:ref,results,maxCandles:config.maxCandles,persistentStateWrites:0,brokerCalls:0,runtimeActivation:false}));
