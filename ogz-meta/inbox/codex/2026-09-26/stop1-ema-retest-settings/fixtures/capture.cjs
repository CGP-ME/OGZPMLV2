'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const label=process.argv[2]||'';assert.match(label,/^[a-z0-9-]*$/);const prefix=label?label+'-':'';
fs.mkdirSync(path.join(packet,'tapes'),{recursive:true});
const diff=cp.execFileSync('git',['diff','--binary','--','modules/EMATrendRetest.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js'],{cwd:clone,maxBuffer:4e6});
fs.writeFileSync(path.join(packet,'private/'+prefix+'candidate.patch'),diff,{flag:'wx',mode:0o600});
const {redactSensitiveText}=require(path.join(clone,'trai_brain/mercury-bridge/run-ledger'));
const manifest={at:new Date().toISOString(),base:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:clone}).toString().trim(),files:[]};
for(const name of label?[prefix+'candidate.patch']:['blast.json','candidate.patch']){
 const bytes=fs.readFileSync(path.join(packet,'private',name)),redacted=Buffer.from(redactSensitiveText(bytes.toString())),gzip=zlib.gzipSync(redacted);
 const file=path.join(packet,'tapes',name+'.gz');fs.writeFileSync(file,gzip,{flag:'wx'});
 assert.equal(hash(fs.readFileSync(file)),hash(gzip));assert.equal(hash(zlib.gunzipSync(gzip)),hash(redacted));
 manifest.files.push({originalPath:'private/'+name,originalSha256:hash(bytes),redactedPath:'tapes/'+name+'.gz',redactedSha256:hash(redacted),gzipSha256:hash(gzip)});
}
fs.writeFileSync(path.join(packet,'tapes/'+prefix+'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest));
