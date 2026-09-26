'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const {redactSensitiveText}=require(path.join(clone,'trai_brain/mercury-bridge/run-ledger'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const secrets=Object.entries(env).filter(([k,v])=>/KEY|SECRET|TOKEN|PASSWORD/.test(k)&&v.length>=12).map(([,v])=>v);
const dir=path.join(packet,'tapes');fs.mkdirSync(dir,{mode:0o700});
const manifest={at:new Date().toISOString(),files:[],knownCredentialMatches:0};
function write(bytes,originalPath,name){
  const redacted=Buffer.from(redactSensitiveText(bytes.toString()));
  if(secrets.some(value=>redacted.includes(value)))throw new Error('Known credential remains in '+name);
  const gzip=zlib.gzipSync(redacted),out=path.join(dir,name+'.gz');
  fs.writeFileSync(out,gzip,{flag:'wx',mode:0o600});
  manifest.files.push({originalPath,originalSha256:hash(bytes),originalBytes:bytes.length,
    redactedPath:path.relative(packet,out),redactedSha256:hash(redacted),redactedBytes:redacted.length,gzipSha256:hash(gzip),gzipBytes:gzip.length});
}
function visit(directory,prefix){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())visit(file,prefix+entry.name+'--');
    else if(entry.isFile())write(fs.readFileSync(file),path.relative(root,file),prefix+entry.name);
  }
}
const ids=new Set();
for(const label of ['ui-settings-preflight','ui-settings-blast','ui-settings-candidate']){
  const d=path.join(root,'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private',label);
  const completion=JSON.parse(fs.readFileSync(path.join(d,'completion.json')));
  if(!completion.sourceUnchanged)throw new Error('Source changed: '+label);
  visit(d,label+'--');
  for(const m of fs.readFileSync(path.join(d,'console.log'),'utf8').matchAll(/(?:evidence|raw)\/2026-09-26\/([^/\s"]+)\//g))ids.add(m[1]);
}
for(const id of ids)for(const kind of ['raw','evidence']){
  const d=path.join(clone,'ogz-meta/cognition-history/mercury-runs',kind,'2026-09-26',id);
  if(fs.existsSync(d))visit(d,kind+'--'+id+'--');
}
const ledger='ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/ledger/2026-09-26.jsonl';
const runIds=['2026-09-26T03-59-29-032Z-1c5112505063','2026-09-26T04-08-08-311Z-79ca8bbdd9a0'];
const rows=fs.readFileSync(path.join(clone,ledger),'utf8').trim().split('\n').filter(line=>runIds.includes(JSON.parse(line).run_id));
if(rows.length!==2)throw new Error('Missing mission ledger rows');
write(Buffer.from(rows.join('\n')+'\n'),path.relative(root,path.join(clone,ledger))+'#mission-rows','mission-ledger.jsonl');
for(const name of ['receipt.json','atr-consumer.json','consumer-console.json']){
 const p=path.join(packet,'private/observation-1PJW6x',name);
 write(fs.readFileSync(p),path.relative(root,p),'observation--'+name);
}
for(const record of manifest.files){
 const gzip=fs.readFileSync(path.join(packet,record.redactedPath)),plain=zlib.gunzipSync(gzip);
 if(hash(gzip)!==record.gzipSha256||hash(plain)!==record.redactedSha256)throw new Error('Export hash mismatch');
}
fs.writeFileSync(path.join(dir,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:manifest.files.length,compressedBytes:manifest.files.reduce((n,f)=>n+f.gzipBytes,0),knownCredentialMatches:0,runIds}));
