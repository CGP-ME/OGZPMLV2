// Package only after the parent-owned provider invocation has completed.
'use strict';
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const crypto=require('node:crypto'), zlib=require('node:zlib'), Module=require('node:module');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../..');
const harness='6bcfad8a25f72cb9e1eb946e854695913b2133c4';
const input=process.argv[2];
assert(input,'Usage: node package-tapes.cjs <completed private/review-timestamp directory>');
const invocation=path.resolve(input);
const privateRoot=path.join(__dirname,'private')+path.sep;
assert(invocation.startsWith(privateRoot) && /^review-/.test(path.basename(invocation)),'Invocation must belong to this packet');
assert(fs.existsSync(path.join(invocation,'result.json')),'Completed provider result is required before packaging');
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64000000});
const tracked=new Set(git(['ls-tree','-r','--name-only','-z',harness]).split('\0'));
const previous=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{
 const relative=path.relative(root,file).split(path.sep).join('/');
 return tracked.has(relative) && !relative.startsWith('node_modules/') ? mod._compile(git(['show',`${harness}:${relative}`]),file) : previous(mod,file);
};
const {redactSensitiveText}=require(path.join(root,'trai_brain/mercury-bridge/run-ledger'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const records=[], requested=new Map(), rows=[];
const output=path.join(__dirname,'tapes',path.basename(invocation));
function collect(value){
 if(!value || typeof value!=='object') return;
 if(typeof value.path==='string' && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/') && value.path.endsWith('.raw')){
  const source=path.resolve(root,value.path);
  if(source.startsWith(path.join(root,'ogz-meta/cognition-history/mercury-runs/raw')+path.sep)) requested.set(source,value.sha256 || null);
 }
 for(const item of Object.values(value)) collect(item);
}
function capture(requestedSource,name,expectedHash){
 let source=requestedSource, recovery=null;
 if(!fs.existsSync(source) && expectedHash && fs.existsSync(path.dirname(source))){
  const matches=fs.readdirSync(path.dirname(source),{withFileTypes:true}).filter(e=>e.isFile() && e.name.endsWith('.raw')).map(e=>path.join(path.dirname(source),e.name)).filter(file=>hash(fs.readFileSync(file))===expectedHash);
  if(matches.length===1){source=matches[0];recovery='unique_sibling_sha256';}
  else recovery=matches.length>1?'ambiguous_sibling_sha256':'no_sibling_sha256_match';
 }
 const identity={requested_source:path.relative(root,requestedSource),source:path.relative(root,source),expected_sha256:expectedHash || null,recovery};
 if(!fs.existsSync(source)){records.push({...identity,absence:'source_missing'});return;}
 const original=fs.readFileSync(source), originalSha=hash(original);
 if(expectedHash && originalSha!==expectedHash){records.push({...identity,original:originalSha,absence:'source_identity_mismatch'});return;}
 const redacted=Buffer.from(redactSensitiveText(original.toString('utf8')));
 assert.equal(redactSensitiveText(redacted.toString('utf8')),redacted.toString('utf8'),'Redaction must be stable');
 const compressed=zlib.gzipSync(redacted,{level:9});
 const destination=path.join(output,name+'.gz');
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,compressed,{flag:'wx'});
 records.push({...identity,artifact:path.relative(__dirname,destination),original:originalSha,redacted:hash(redacted),compressed:hash(compressed),originalBytes:original.length,redactedBytes:redacted.length,storedBytes:compressed.length});
}
for(const name of ['invocation.json','result.json']){
 const source=path.join(invocation,name);
 if(fs.existsSync(source)) collect(JSON.parse(fs.readFileSync(source,'utf8')));
 capture(source,'host/'+name);
}
const ledgerRoot=path.join(invocation,'ledger');
function walk(dir){
 if(!fs.existsSync(dir))return;
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const source=path.join(dir,entry.name);
  if(entry.isDirectory()){
   // Captured repository directories are not manifests or provider tapes.
   if(!entry.name.startsWith('source-'))walk(source);
  }else if(entry.isFile() && entry.name.endsWith('.jsonl')){
   const parsed=fs.readFileSync(source,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   parsed.forEach(row=>{rows.push(row);collect(row);});
   capture(source,'ledger/'+path.relative(ledgerRoot,source));
  }else if(entry.isFile() && /^(?:source.*|.*manifest.*)\.json$/.test(entry.name))capture(source,'manifests/'+path.relative(ledgerRoot,source));
 }
}
walk(ledgerRoot);
if(!rows.length)records.push({requested_source:path.relative(root,ledgerRoot),absence:'run_ledger_missing_or_empty'});
for(const [source,expected] of requested)capture(source,'raw/'+path.basename(path.dirname(source))+'/'+path.basename(source),expected);
if(!requested.size)records.push({requested_source:'provider raw receipt references',absence:'no_raw_references_found'});
const manifest={harness,invocation:path.relative(root,invocation),encoding:'gzip of UTF-8 after pinned redactSensitiveText',runs:rows.map(row=>({id:row.run_id,verdict:row.verdict,termination:row.termination})),records,missing:records.filter(record=>record.absence)};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'TAPES.json'),redactSensitiveText(JSON.stringify(manifest,null,2))+'\n',{flag:'wx'});
console.log(JSON.stringify({manifest:path.relative(root,path.join(output,'TAPES.json')),records:records.length,missing:manifest.missing.length,storedBytes:records.reduce((sum,r)=>sum+(r.storedBytes||0),0)}));
if(manifest.missing.length)process.exitCode=1;
