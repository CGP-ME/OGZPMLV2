'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const {redactSensitiveText}=require(path.join(clone,'trai_brain/mercury-bridge/run-ledger'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const secrets=Object.entries(env).filter(([k,v])=>/KEY|SECRET|TOKEN|PASSWORD/.test(k)&&v.length>=12).map(([,v])=>v);
const out=path.join(packet,'tapes');fs.mkdirSync(out,{mode:0o700});
const manifest={at:new Date().toISOString(),files:[],knownCredentialMatches:0};
function write(bytes,originalPath,name){
  const redacted=Buffer.from(redactSensitiveText(bytes.toString()));
  if(secrets.some(value=>redacted.includes(value)))throw new Error('Credential remains: '+name);
  const gzip=zlib.gzipSync(redacted),destination=path.join(out,name+'.gz');
  fs.writeFileSync(destination,gzip,{flag:'wx',mode:0o600});
  manifest.files.push({originalPath,originalSha256:hash(bytes),originalBytes:bytes.length,redactedPath:path.relative(packet,destination),
    redactedSha256:hash(redacted),redactedBytes:redacted.length,gzipSha256:hash(gzip),gzipBytes:gzip.length});
}
function visit(directory,prefix){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())visit(file,prefix+entry.name+'--');
    else if(entry.isFile())write(fs.readFileSync(file),path.relative(root,file),prefix+entry.name);
  }
}
const ids=new Set();
for(const label of ['tsm-settings-preflight','tsm-settings-candidate','tsm-settings-review']){
  const dir=path.join(root,'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private',label);
  const completion=JSON.parse(fs.readFileSync(path.join(dir,'completion.json')));
  if(!completion.sourceUnchanged)throw new Error('Source changed during review: '+label);
  visit(dir,label+'--');
  for(const match of fs.readFileSync(path.join(dir,'console.log'),'utf8').matchAll(/(?:evidence|raw)\/2026-09-26\/([^/\s"]+)\//g))ids.add(match[1]);
}
for(const id of ids)for(const kind of ['raw','evidence']){
  const dir=path.join(clone,'ogz-meta/cognition-history/mercury-runs',kind,'2026-09-26',id);
  if(fs.existsSync(dir))visit(dir,kind+'--'+id+'--');
}
const ledger='ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/ledger/2026-09-26.jsonl';
const runIds=process.argv.slice(2);
if(runIds.length!==1)throw new Error('Supply the explicit review run ID');
const rows=fs.readFileSync(path.join(clone,ledger),'utf8').trim().split('\n').filter(line=>runIds.includes(JSON.parse(line).run_id));
if(rows.length!==runIds.length)throw new Error('Missing ledger row');
write(Buffer.from(rows.join('\n')+'\n'),path.relative(root,path.join(clone,ledger))+'#mission-rows','mission-ledger.jsonl');
for(const name of ['blast.json','baseline-ywKvZR/receipt.json','baseline-ywKvZR/console.json','candidate-0OkGJV/receipt.json','candidate-0OkGJV/console.json','candidate-uTFroK/receipt.json','candidate-uTFroK/console.json','candidate-JX9QCS/receipt.json','candidate-JX9QCS/console.json']){
  const file=path.join(packet,'private',name);write(fs.readFileSync(file),path.relative(root,file),'observation--'+name.replaceAll('/','--'));
}
for(const record of manifest.files){
  const gzip=fs.readFileSync(path.join(packet,record.redactedPath));
  if(hash(gzip)!==record.gzipSha256||hash(zlib.gunzipSync(gzip))!==record.redactedSha256)throw new Error('Export hash mismatch');
}
fs.writeFileSync(path.join(out,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:manifest.files.length,compressedBytes:manifest.files.reduce((n,f)=>n+f.gzipBytes,0),knownCredentialMatches:0,runIds}));
