'use strict';
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),assert=require('assert'),Module=require('module'),path=require('path');
const receipt=require('./source-receipt.json');
function loadSms(ref){const filename=path.resolve('modules/SmartMoneySweep.js');const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(cp.execFileSync('git',['show',`${ref}:modules/SmartMoneySweep.js`],{encoding:'utf8'}),filename);return m.exports;}
function run(ref,priorLosses){
 const settings=JSON.parse(cp.execFileSync('git',['show',`${ref}:config/settings.json`],{encoding:'utf8'}));
 const context={require:p=>p.includes('SmartMoneySweep')?loadSms(ref):{},jest:{fn:f=>f||(()=>{})},console,canonical:settings.strategies.SmartMoneySweep};
 vm.createContext(context);
 let fixture=fs.readFileSync('test/smart-money-sweep-conviction-ladder.test.js','utf8').split("describe('SmartMoneySweep conviction ladder'")[0];
 fixture=fixture.replace('  return {\n','  return {\n    ...canonical,\n');
 vm.runInContext(fixture+`\nconst sms=sweepModule({conditionsMet:4,rawConfidence:90}); const history=candles(); if(sms.dailyRiskState)sms.dailyRiskState.dailyLosses=${priorLosses}; const signal=sms.update(history[history.length-1],history); globalThis.out={signal,hasLossCounter:!!sms.dailyRiskState};`,context);
 return JSON.parse(JSON.stringify(context.out));
}
const baselineEligible=run(receipt.base,0),baselineBlocked=run(receipt.base,3),candidate=run(receipt.candidate,3);
assert(baselineEligible.signal,'baseline fixture must produce an eligible setup');assert.strictEqual(baselineBlocked.signal,null);assert.deepStrictEqual(candidate.signal,baselineEligible.signal);assert.strictEqual(candidate.hasLossCounter,false);
const out={passed:true,baselineEligible,baselineBlocked,candidate,scope:'Actual SmartMoneySweep.update from exact Git trees; known sweep/indicator primitives from existing fixture, canonical config. No orders or live state.'};fs.writeFileSync(path.join(__dirname,'signal-proof.json'),JSON.stringify(out,null,2));console.log('PASS: same eligible SMS signal survives prior losses; retired counter absent');
