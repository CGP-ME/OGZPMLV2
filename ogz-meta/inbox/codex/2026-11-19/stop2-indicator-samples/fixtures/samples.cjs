'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require(process.cwd()+'/test/helpers/require-isolation.cjs');
const baseline=process.argv.includes('--baseline');
const override=process.argv.find(v=>v.startsWith('--source='));
if(override)for(const [f,s] of Object.entries(JSON.parse(fs.readFileSync(override.slice(9),'utf8'))))fs.writeFileSync(f,s);
let ind;const source=fs.readFileSync('public/js/indicators.js','utf8');
vm.runInNewContext(source,{window:{OGZ:{register:(name,value)=>{ind=value;}}}});
const copy=x=>JSON.parse(JSON.stringify(x));
const rsi=copy(ind.calculateRSI([100,101,102,101,103,102],3));
const bands=copy(ind.calculateBollinger([1,2,3,4],3));
const vwap=copy(ind.calculateVWAP([{high:9,low:9,close:9,volume:0},{high:12,low:12,close:12,volume:2},{high:18,low:18,close:18,volume:1}]));
const flat=copy(ind.calculateRSI(Array(20).fill(100),14));
const short=copy(ind.calculateRSI([100,101],14));
const upward=copy(ind.calculateRSI([1,2,3,4,5],3));
const downward=copy(ind.calculateRSI([5,4,3,2,1],3));
const observed={rsi,bands,vwap,flat,short,upward,downward};
if(!baseline){
 assert.equal(rsi.length,6);assert.deepEqual(rsi.slice(0,3),[null,null,null]);
 assert.ok(Math.abs(rsi[3]-200/3)<1e-10);assert.ok(Math.abs(rsi[4]-250/3)<1e-10);assert.ok(Math.abs(rsi[5]-2000/33)<1e-10);
 assert.deepEqual(bands.middle,[null,null,2,3]);assert.ok(Math.abs(bands.upper[3]-(3+2*Math.sqrt(2/3)))<1e-10);
 assert.deepEqual(vwap,[null,12,14]);assert.deepEqual(short,[null,null]);assert.ok(flat.every(x=>x===null));
 assert.deepEqual(upward,[null,null,null,100,100]);assert.deepEqual(downward,[null,null,null,0,0]);
}
console.log('INDICATOR_SAMPLES_RECEIPT '+JSON.stringify({baseline,sourceHash:crypto.createHash('sha256').update(source).digest('hex'),observed,
 evidence:'Executed production browser indicator library; hand-computed rolling windows and Wilder seed/smoothing examples',
 limits:['Front-end math only; trading indicator modules unchanged','Flat RSI and zero-volume VWAP stay unavailable rather than inventing values']}));
