const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const root=path.resolve(__dirname,'../../../../..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'config/settings.json'),'utf8'));
function load(name){const filename=path.join(root,'modules',name+'.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fs.readFileSync(path.join(__dirname,name+'-candidate.js'),'utf8'),filename);return m.exports;}
const original=console.log;console.log=()=>{};
const Orb=load('OpeningRangeBreakout');
const orbConfig={...cfg.strategies.OpeningRangeBreakout,sessionOpenHourUTC:14,sessionOpenET:'',orDurationMinutes:15,orMinWidthAtr:0,fvgScanBars:10,minFVGPercent:.01,maxFVGPercent:5,entryLevel:'top',stopBufferPct:.05,targetRR:2};
const active=new Orb(orbConfig),observed=new Orb(orbConfig);
const bars=[[100,105,98,103],[104,108,103,107],[107,108,106,107.5],[108,115,108,114],[114,118,112,116]].map(([o,h,l,c],i)=>({o,h,l,c,v:1000,t:Date.UTC(2026,2,12,14,i*15)}));
let signal;
for(const bar of bars){signal=active.update(bar);assert.equal(observed.observe(bar),null);}
assert.equal(signal.direction,'buy');assert.equal(active.state,'SIGNAL_READY');assert.equal(observed.pendingSignal,null);assert.equal(observed.state,'WATCHING_FOR_FVG');assert.deepEqual(observed.openingRange,active.openingRange);assert.deepEqual(observed.recentCandles,active.recentCandles);
const Liq=load('LiquiditySweepDetector');const liqActive=new Liq(cfg.strategies.LiquiditySweep),liqObserved=new Liq(cfg.strategies.LiquiditySweep);
const prev={o:110,h:112,l:109,c:111,v:1000,t:Date.UTC(2026,2,12,15)};
const next={o:112,h:113,l:107,c:108,v:1000,t:prev.t+60000};
for(const instance of [liqActive,liqObserved]){instance._currentDay='2026-03-12';instance.state.phase='watching_for_pattern';instance.state.box={high:105,low:95,range:10,validations:{sweepsHighs:true,sweepsLows:false,closesInsideRange:true}};instance.state.exitSide='above';instance.state.prevBar=prev;instance.state.barsAfterOpen=0;}
const ls=liqActive.feedCandle(next);liqObserved.observe(next);assert.equal(ls.hasSignal,true);assert.equal(liqActive.state.phase,'signal_active');assert.equal(liqObserved.state.phase,'watching_for_pattern');assert.equal(liqObserved.state.signal,null);assert.equal(liqObserved.stats.signalsGenerated,0);assert.deepEqual(liqObserved.state.prevBar,liqActive.state.prevBar);
const NoWick=load('NoWickImbalance'), nwActive=new NoWick(cfg.strategies.NoWickImbalance),nwObserved=new NoWick(cfg.strategies.NoWickImbalance);
const history=Array.from({length:40},(_,i)=>{const c=100+i*.1+Math.sin(i*1.2)*.7;return {o:c-.1,h:c+.3,l:c-.3,c,t:1800000000000+i*60000};});
history.push({o:104.1,h:105,l:103.9,c:104.5,t:1800000000000+40*60000});
for(const n of[nwActive,nwObserved])n.scopedState.set('AAA:1M',{candleCount:4,pendingLevels:[{type:'bullish',level:104,formationCount:3,trend:'uptrend',timestamp:1800000000000}],invalidatedLevels:[]});
const ctx={priceHistory:history,indicators:{atr:1},extras:{symbol:'AAA',timeframe:'1m'}};
assert.equal(nwActive._detectTrend(history),'uptrend');assert.equal(nwActive.evaluate(ctx).direction,'buy');assert.equal(nwObserved.observe(ctx),null);assert.equal(nwActive.scopedState.get('AAA:1M').pendingLevels.length,0);assert.equal(nwObserved.scopedState.get('AAA:1M').pendingLevels.length,1);assert.equal(nwObserved.scopedState.get('AAA:1M').candleCount,5);
console.log=original;const result={orbRealFvgSignalActive:true,orbNoDisabledSignalOrConsumption:true,liquidityRealEngulfingSignalActive:true,liquidityNoDisabledSignalOrConsumption:true,noWickRealTrendAndEntryActive:true,noWickObservedLevelNotConsumed:true,limits:'ORB uses actual candle pattern; liquidity uses explicitly seeded prior valid session state then actual candle/pattern/generation path. NoWick seeds a prior pending level then uses actual trend/touch/exit calculations. No executed trade.'};fs.writeFileSync(path.join(__dirname,'emission-behavior.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
