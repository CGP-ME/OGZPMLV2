'use strict';
// Save the exact pending candidate privately and export redacted observations.
// This does not stage production code or call any provider.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const {redactSensitiveText}=require(path.join(clone,'trai_brain/mercury-bridge/run-ledger'));
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const secrets=Object.entries(env).filter(([k,v])=>/KEY|SECRET|TOKEN|PASSWORD/.test(k)&&v.length>=12).map(([,v])=>v);
const raw=path.join(packet,'private/candidate-3iRKCC/receipt.json'),observation=JSON.parse(fs.readFileSync(raw));
for(const [p,h]of Object.entries(observation.sources))if(hash(fs.readFileSync(path.join(clone,p)))!==h)throw new Error('Changed source: '+p);
const candidate=cp.execFileSync('git',['diff','--binary'],{cwd:clone,maxBuffer:8e6});
fs.writeFileSync(path.join(packet,'private/candidate.patch'),candidate,{flag:'wx',mode:0o600});
const out=path.join(packet,'tapes');fs.mkdirSync(out,{mode:0o700});
const manifest={at:new Date().toISOString(),status:'LOCAL_OBSERVATIONS_ONLY_REVIEW_BLOCKED',files:[],knownCredentialMatches:0};
function write(file,name){const original=fs.readFileSync(file),redacted=Buffer.from(redactSensitiveText(original.toString()));
 if(secrets.some(v=>redacted.includes(v)))throw new Error('Known credential remains in '+name);
 const gzip=zlib.gzipSync(redacted);fs.writeFileSync(path.join(out,name+'.gz'),gzip,{flag:'wx',mode:0o600});
 manifest.files.push({originalPath:path.relative(root,file),originalSha256:hash(original),originalBytes:original.length,redactedPath:'tapes/'+name+'.gz',redactedSha256:hash(redacted),redactedBytes:redacted.length,gzipSha256:hash(gzip),gzipBytes:gzip.length});
}
for(const p of ['blast.json','baseline-WB811g/receipt.json','baseline-WB811g/console.json','candidate-3iRKCC/receipt.json','candidate-3iRKCC/console.json'])write(path.join(packet,'private',p),p.replaceAll('/','--'));
// Preserve our own failed observations as failures, not successful evidence.
for(const entry of fs.readdirSync(path.join(packet,'private'),{withFileTypes:true}))if(entry.isDirectory()){
 const file=path.join(packet,'private',entry.name,'failure.json');if(fs.existsSync(file))write(file,entry.name+'--failure.json');
}
const readiness=path.join(root,'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/entry-exit-settings-preflight');
for(const name of ['invocation.json','completion.json','console.log'])write(path.join(readiness,name),'preflight--'+name);
const preflight=JSON.parse(fs.readFileSync(path.join(readiness,'console.log')));
for(const check of preflight.checks)for(const kind of ['raw_output','raw_error']){const file=check.attemptReceipt?.[kind]?.path;if(file)write(path.join(clone,file),'preflight--'+check.label+'--'+kind+'.raw');}
const ledger=path.join(clone,preflight.runLedger.path),lines=fs.readFileSync(ledger,'utf8').split('\n');
const row=lines[preflight.runLedger.line-1];fs.writeFileSync(path.join(packet,'private/preflight-ledger.jsonl'),row+'\n',{flag:'wx',mode:0o600});write(path.join(packet,'private/preflight-ledger.jsonl'),'preflight-ledger.jsonl');
for(const record of manifest.files){const bytes=fs.readFileSync(path.join(packet,record.redactedPath));if(hash(bytes)!==record.gzipSha256||hash(zlib.gunzipSync(bytes))!==record.redactedSha256)throw new Error('Export mismatch');}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const summary={at:new Date().toISOString(),status:manifest.status,base:'e3fa99f244321db00723235b909f6a0b6ccfa56a',candidateLocation:path.relative(root,clone),candidatePatchPrivate:'private/candidate.patch',candidatePatchSha256:hash(candidate),sources:observation.sources,input:observation.input,
 observed:{recordedLongShortStates:observation.before.length,baselineOldStatesChanged:389,candidateOldStatesChanged:observation.oldChanged,entryPlansBefore:observation.entryPlansBefore.length,entryPlansAfter:observation.entryPlansAfter.length,individuallyChangedFields:observation.fieldEffects.filter(x=>x.field!=='zero_floor_minimum_distance').length,zeroFloorLongShortCases:2,initialTrailUpdates:375,initialBreakEvenUpdates:363,oldPolicyBytesUnchanged:observation.oldPolicyBytesUnchanged,legacyAlarmEvents:observation.traces.length},
 boundary:observation.boundary,notProven:['Full adversarial review: Fable 401 expired OAuth','Production bot or page behavior','Actual StateManager persistence/recovery','Actual notification delivery','Independent cold pull','Complete Stop 1 or complete UI surface'],
 providerReadiness:preflight.checks.map(c=>({label:c.label,ready:c.ok,appliedModel:c.attemptReceipt?.applied_model,errorCategory:c.error?.category||null})),tapesManifest:'tapes/MANIFEST.json'};
fs.writeFileSync(path.join(packet,'OBSERVATION.json'),JSON.stringify(summary)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:manifest.files.length,compressedBytes:manifest.files.reduce((n,f)=>n+f.gzipBytes,0),knownCredentialMatches:0,candidatePatchSha256:summary.candidatePatchSha256,observed:summary.observed}));
