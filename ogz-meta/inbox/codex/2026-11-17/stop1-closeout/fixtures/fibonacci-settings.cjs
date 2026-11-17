'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
process.env.PROFILE='paper';
for(const key of ['KRAKEN_API_KEY','KRAKEN_API_SECRET','ALPACA_API_KEY','ALPACA_API_SECRET','WEBSOCKET_AUTH_TOKEN'])process.env[key]='synthetic-stop1-fixture';
const loader=require(path.join(process.cwd(),'foundation/ConfigLoader'));
loader.load({role:'bot',loadDotenv:false,silent:true});
let seq=0;
function save(changes){const {revisions}=loader.getCachedSnapshot();const result=loader.saveSettings({requestId:`fibonacci-${++seq}`,expectedRevision:revisions.settings,expectedSettingsHash:revisions.settingsHash,changes});assert.equal(result.success,true,result.reason);return result.configuration;}
const FibonacciDetector=require(path.join(process.cwd(),'core/FibonacciDetector'));
const detector=new FibonacciDetector(loader.get('fibonacci'));
const candles=Array.from({length:120},(_,i)=>{const c=100+i/5+Math.sin(i/4)*6;return {o:c-0.5,c,h:c+2,l:c-2,v:100,t:1700000000000+i*60000};});
const old=detector.update(candles),oldBytes=JSON.stringify(old);
assert.ok(old);
const configuration=save({'fibonacci.levels':[0.25,0.5,0.75],'fibonacci.goldenZone':[0.2,0.3],
 'fibonacci.lookbackCandles':40,'fibonacci.strengthRequired':3,'fibonacci.swingThresholdPercent':0.3,
 'fibonacci.proximityThreshold':0.2,'fibonacci.minimumHistoryCandles':30});
const next=detector.update(candles);
const nearest=detector.getNearestLevel(next['0.25']);
const receipt={configuration,priorRatios:Object.keys(old),nextRatios:Object.keys(next),nearest,
 priorSnapshotPreserved:JSON.stringify(old)===oldBytes,retainedDetector:true};
console.log('STOP1_FIBONACCI_RECEIPT',JSON.stringify(receipt));
if(!process.argv.includes('--observe')){
 assert.equal(nearest.level,0.25);assert.equal(nearest.isGoldenZone,true);
 assert.deepEqual(next,new FibonacciDetector(loader.get('fibonacci')).update(candles));
 assert.equal(receipt.priorSnapshotPreserved,true);
 save({'fibonacci.minimumHistoryCandles':121});assert.equal(detector.update(candles),null);
 save({'fibonacci.minimumHistoryCandles':30});assert.ok(detector.update(candles));
 save({'fibonacci.proximityThreshold':0});assert.equal(detector.getNearestLevel(next['0.25']+0.01),null);
 console.log('STOP1_FIBONACCI_RESULT',JSON.stringify({newLevels:true,newGoldenZone:true,minimumHistoryIncreaseAndDecrease:true,zeroProximity:true}));
}
