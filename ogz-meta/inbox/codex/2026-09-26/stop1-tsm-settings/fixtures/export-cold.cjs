'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const {redactSensitiveText}=require(path.join(clone,'trai_brain/mercury-bridge/run-ledger'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const env=require(path.join(root,'node_modules/dotenv')).parse(fs.readFileSync(path.join(root,'.env')));
const secrets=Object.entries(env).filter(([k,v])=>/KEY|SECRET|TOKEN|PASSWORD/.test(k)&&v.length>=12).map(([,v])=>v);
const expected=JSON.parse(fs.readFileSync(path.join(packet,'OBSERVATION.json'))),cold=JSON.parse(fs.readFileSync(path.join(packet,'private/cold-gLfhfQ/receipt.json')));
assert.deepEqual(cold.sources,expected.sources);
const manifest={commit:'f88bdc409389a3706d12b5ce84255eb08da6509f',boundary:'same-host separate clone fetched from GitHub; not independent metal or running bot',files:[]};
for(const name of ['receipt.json','console.json']){
 const originalPath=path.join(packet,'private/cold-gLfhfQ',name),bytes=fs.readFileSync(originalPath),redacted=Buffer.from(redactSensitiveText(bytes.toString()));
 assert.equal(secrets.some(v=>redacted.includes(v)),false);
 const gzip=zlib.gzipSync(redacted),redactedPath='tapes/cold-'+name+'.gz';
 fs.writeFileSync(path.join(packet,redactedPath),gzip,{flag:'wx',mode:0o600});
 assert.equal(hash(zlib.gunzipSync(fs.readFileSync(path.join(packet,redactedPath)))),hash(redacted));
 manifest.files.push({originalPath:path.relative(root,originalPath),originalSha256:hash(bytes),redactedSha256:hash(redacted),gzipSha256:hash(gzip),redactedPath});
}
fs.writeFileSync(path.join(packet,'tapes/COLD-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest));
