'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs');
// Reuse the earlier socket/core/native-chart fixture, with its synthetic series
// boundary. This probe replaces its indicator stubs with the actual chart math.
const helperPath = 'ogz-meta/inbox/codex/2026-11-18/stop2-native-chart-consumer/fixtures/native-client.cjs';
const helper = fs.readFileSync(helperPath, 'utf8');
const { environment, panel, legacy, install, copy, vm, start, sourceHashes, baseline } =
  new Function('require', helper.slice(0, helper.indexOf('function history(')) +
    '\nreturn {environment,panel,legacy,install,copy,vm,start,sourceHashes,baseline};')(require);
const output = [];
const globals = ['ema20Series','ema50Series','ema200Series','sma20Series','sma50Series','sma200Series',
  'bbUpperSeries','bbMiddleSeries','bbLowerSeries','vwapSeries',
  'rsiOverlaySeries','macdLineSeries','macdSignalSeries','atrSeries'];
const members = ['_ichiTenkan','_ichiKijun','_ichiSenkouA','_ichiSenkouB','_trendResistance','_trendSupport'];
function makeSeries() {
  return { rows: [], writes: 0, setData(rows) { this.rows = copy(rows); this.writes++; }, applyOptions() {} };
}
function setup(file, name) {
  const e = environment(file, name, 'BTC-USD', '1m');
  const savedGet = e.context.OGZ.get;
  let ind;
  e.context.OGZ.register = (name, value) => { if (name === 'Indicators') ind = value; };
  e.context.OGZ.get = name => name === 'Indicators' ? ind : savedGet(name);
  e.context.window = { OGZ: e.context.OGZ };
  vm.runInContext(fs.readFileSync('public/js/indicators.js','utf8'), e.context);
  for (const n of globals) e.context[n] = makeSeries();
  for (const n of members) e.chart[n] = makeSeries();
  e.chart._fibLines = []; e.chart._srLines = [];
  e.context.activeOverlays = ['ema','sma','bollinger','vwap','ichimoku','trendlines','fibonacci','sr'];
  e.context._oscPanes.rsi = { series: { rsi: makeSeries() } };
  e.context._oscPanes.atr = { series: { atr: makeSeries() } };
  e.context._oscPanes.macd = { series: { macd: makeSeries(), signal: makeSeries() } };
  e.context.tvChart = { priceScale: () => ({applyOptions(){}}), timeScale: () => ({fitContent(){}, scrollToRealTime(){}}) };
  e.context.MIN_INDICATOR_CANDLES = 30;
  const lines = new Set();
  e.candleSeries.createPriceLine = options => { const line = copy(options); lines.add(line); return line; };
  e.candleSeries.removePriceLine = line => { assert.ok(lines.delete(line), 'remove an existing generated line'); };
  const obj = file.nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === name).init;
  for (const key of ['calculateIndicators','_clearGeneratedOverlayLines','_clearIndicatorData']) {
    const p = obj.properties.find(n => n.key.name === key);
    if (p) e.chart[key] = vm.runInContext('(' + file.text(p.value) + ')', e.context);
  }
  if (name === 'ChartPanel') install(file, ['feedOscIndicatorPanes'], e.context);
  return { ...e, lines, ind };
}
function bars(count = 240) {
  return Array.from({length: count}, (_, i) => {
    const close = 100 + i * 0.2 + Math.sin(i / 3) * 3;
    return {time: start / 1000 + i * 60, open: close - 0.5, high: close + 1, low: close - 1,
      close, volume: 10 + (i % 9)};
  });
}
function packet(row) {
  const candle = {...row, timestamp: row.time * 1000, symbol: 'BTC-USD', timeframe: '1m'};
  return {type:'price', symbol:'BTC-USD',timeframe:'1m',candle};
}
function ema20(rows) {
  return rows.slice(1).reduce((ema, c) => c.close * (2 / 21) + ema * (19 / 21), rows[0].close);
}
function inspect(e, expected) {
  const last = e.context.ema20Series.rows.at(-1);
  const vwap = expected.reduce((x, c) => x + ((c.high+c.low+c.close)/3)*c.volume,0) / expected.reduce((x,c)=>x+c.volume,0);
  const vw = e.context.vwapSeries.rows.at(-1);
  const emaMatches = last?.time === expected.at(-1).time && Math.abs(last.value-ema20(expected)) < 1e-10;
  const vwapMatches = vw?.time === expected.at(-1).time && Math.abs(vw.value-vwap) < 1e-10;
  const expectedLines = e.ind.calculateFibonacci(expected).length + e.ind.calculateSupportResistance(expected).length;
  return {emaMatches, vwapMatches, generatedLines: e.lines.size, expectedLines,
    noDuplicateLines: e.lines.size === expectedLines, lastEma: last};
}
function indicatorWrites(e) {
  return globals.reduce((n,k)=>n+e.context[k].writes,0) + members.reduce((n,k)=>n+e.chart[k].writes,0) +
    ['rsi','macd','atr'].reduce((n,k)=>n+Object.values(e.context._oscPanes[k].series).reduce((s,v)=>s+v.writes,0),0);
}
(async () => {
  for (const [file, name] of [[legacy,'Chart'],[panel,'ChartPanel']]) {
    const e = setup(file,name), expected = bars();
    await e.receive({type:'historical_candles', symbol:'BTC-USD',timeframe:'1m',candles:expected});
    const cases = [{stage:'history',...inspect(e,expected)}];
    const next = {...expected.at(-1),time:expected.at(-1).time+60,open:150,close:154,high:156,low:148,volume:25};
    expected.push(next); await e.receive(packet(next));
    cases.push({stage:'new_candle',...inspect(e,expected)});
    const revision = {...next,close:151,volume:30}; expected[expected.length-1]=revision;
    await e.receive(packet(revision)); cases.push({stage:'current_revision',...inspect(e,expected)});
    const older = {...expected[180],close:190,high:191,volume:70}; expected[180]=older;
    await e.receive(packet(older)); cases.push({stage:'older_revision',...inspect(e,expected)});
    const beforeQuote = indicatorWrites(e);
    await e.receive({type:'price',symbol:'BTC-USD',timeframe:null,candle:null,price:155,timestamp:start+100000000});
    const quoteDoesNotRecalculate = indicatorWrites(e) === beforeQuote;
    const oldTrend = [{time:expected[0].time,value:999},{time:expected.at(-1).time,value:999}];
    e.chart._trendResistance.setData(oldTrend); e.chart._trendSupport.setData(oldTrend);
    const monotonic = bars().map((c,i)=>({...c,open:100+i,high:102+i,low:99+i,close:101+i}));
    await e.receive({type:'historical_candles',symbol:'BTC-USD',timeframe:'1m',candles:monotonic});
    const vanishedTrendsRemoved = !e.chart._trendResistance.rows.length && !e.chart._trendSupport.rows.length;
    await e.receive({type:'historical_candles',symbol:'BTC-USD',timeframe:'1m',candles:bars(4)});
    const shortHistoryClearsOldIndicators = globals.every(k=>e.context[k].rows.length===0) &&
      members.every(k=>e.chart[k].rows.length===0) && e.lines.size===0;
    const volumeHistoryPreserved = name === 'Chart' || e.volumePane.rows.length===4;
    await e.receive({type:'historical_candles',symbol:'BTC-USD',timeframe:'1m',candles:expected});
    e.chart.clearAll();
    const scopeSwitchClearsIndicators = globals.every(k=>e.context[k].rows.length===0) &&
      members.every(k=>e.chart[k].rows.length===0) && e.lines.size===0;
    const errors = e.logs.filter(row=>row.level==='error');
    const row = {chart:name,cases,quoteDoesNotRecalculate,vanishedTrendsRemoved,shortHistoryClearsOldIndicators,
      volumeHistoryPreserved,scopeSwitchClearsIndicators,errors};
    output.push(row);
    if (!baseline) {
      for(const c of cases) for(const k of ['emaMatches','vwapMatches','noDuplicateLines']) assert.equal(c[k],true,`${name} ${c.stage} ${k}`);
      for(const k of ['quoteDoesNotRecalculate','vanishedTrendsRemoved','shortHistoryClearsOldIndicators','volumeHistoryPreserved','scopeSwitchClearsIndicators'])
        assert.equal(row[k],true,`${name} ${k}`);
      assert.deepEqual(errors,[]);
    }
  }
  console.log('INDICATOR_REFRESH_RECEIPT '+JSON.stringify({baseline,sourceHashes,output,
    evidence:'Actual chart history/update/clear methods, core/socket routing and production indicator math; synthetic series boundary',
    limitations:['No browser rendering in this isolated probe','No change to indicator formulas or entry decisions']}));
})().catch(error=>{console.error(error);process.exitCode=1;});
