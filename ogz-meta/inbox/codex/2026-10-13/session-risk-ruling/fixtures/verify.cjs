'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),tree=process.env.MERCURY_HARNESS_TREE;
assert.match(tree,/^[a-f0-9]{40}$/);
require(path.join(root,'ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs'));
const originalRead=fs.readFileSync;
const canonical=new Map(['config/settings.json','config/internals.json'].map(file=>[path.join(root,file),cp.execFileSync('git',['show',`${tree}:${file}`],{cwd:root})]));
fs.readFileSync=function(file,options){const value=canonical.get(typeof file==='string'?path.resolve(file):file);if(value){const encoding=typeof options==='string'?options:options?.encoding;return encoding?value.toString(encoding):Buffer.from(value);}return originalRead.apply(this,arguments);};
const settings=JSON.parse(canonical.get(path.join(root,'config/settings.json')).toString());
const {buildRiskManagerConfig}=require(path.join(root,'core/RiskManagerConfig'));
const RiskManager=require(path.join(root,'core/RiskManager'));
const ConfigLoader=require(path.join(root,'foundation/ConfigLoader'));
const {buildRuntimeConfigProof}=require(path.join(root,'core/RuntimeConfigProof'));
const results=[];
for(const [name,profile] of Object.entries(settings.launchProfiles)){
 if(!profile || typeof profile!=='object' || !profile.risk)continue;
 const sources={};
 function visit(value,prefix){for(const [key,child] of Object.entries(value)){const full=prefix+'.'+key;if(child&&typeof child==='object'&&!Array.isArray(child))visit(child,full);else sources[full]='config:launchProfiles.'+name+'.'+full;}}
 visit(profile.risk,'risk');
 const risk=buildRiskManagerConfig(profile.risk,sources);
 assert.equal(Object.hasOwn(risk,'sessionRiskResponse'),false);
 assert.deepEqual(Object.keys(risk).sort(),['guardMode','reconciliationReporter','venueRailBuffer']);
 const manager=new RiskManager(risk);assert.equal(manager.config,risk);
 results.push({profile:name,constructed:true,riskKeys:Object.keys(risk)});
}
assert.equal(results.length,7);
const snapshot=ConfigLoader.snapshot({PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-unused-token',ALPACA_API_KEY:'fixture-unused-key',ALPACA_API_SECRET:'fixture-unused-secret',KRAKEN_API_KEY:'fixture-unused-key',KRAKEN_API_SECRET:'fixture-unused-secret'},{silent:true,loadDotenv:false});
assert.equal(Object.hasOwn(snapshot.config.risk,'sessionRiskResponse'),false);
assert.equal(Object.keys(snapshot.sources).some(k=>k.includes('sessionRiskResponse')),false);
const proof=buildRuntimeConfigProof(snapshot,ConfigLoader);
assert.equal(JSON.stringify(proof).includes('sessionRiskResponse'),false);
assert.ok(proof.configLoader.risk.reconciliationReporter);
assert.ok(proof.configLoader.risk.venueRailBuffer);
const receipt={tree,result:'pass',profiles:results,paperSnapshotBuilt:true,proofBuilt:true,removedFieldInSources:false,removedFieldInProof:false,noBrokerOrPm2Calls:true};
fs.writeFileSync(path.join(__dirname,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
