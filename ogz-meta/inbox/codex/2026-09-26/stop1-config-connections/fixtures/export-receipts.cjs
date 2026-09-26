'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const { redactSensitiveText } = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const destination = path.join(packet, 'tapes'); fs.mkdirSync(destination, { mode:0o700 });
const manifest = { at:new Date().toISOString(), files:[] };
function exportFile(file, name) {
  const original = fs.readFileSync(file); const redacted = Buffer.from(redactSensitiveText(original.toString('utf8')));
  const compressed = zlib.gzipSync(redacted); const output = path.join(destination,name+'.gz');
  fs.writeFileSync(output,compressed,{flag:'wx',mode:0o600});
  manifest.files.push({ originalPath:path.relative(root,file), originalSha256:hash(original), originalBytes:original.length,
    redactedPath:path.relative(packet,output), redactedSha256:hash(redacted), redactedBytes:redacted.length,
    gzipSha256:hash(compressed), gzipBytes:compressed.length });
}
function visit(dir,prefix) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) visit(file,prefix+entry.name+'--');
    else if(entry.isFile()) exportFile(file,prefix+entry.name);
  }
}
const ids = new Set();
for (const label of ['providers','providers-2','donchian-before','donchian-after']) {
  const directory=path.join(packet,'private',label);
  if(!fs.existsSync(path.join(directory,'completion.json'))) throw new Error('Run incomplete: '+label);
  visit(directory,label+'--');
  const output=fs.readFileSync(path.join(directory,'console.log'),'utf8');
  for(const match of output.matchAll(/(?:evidence|raw)\/2026-09-26\/([^/\s"]+)\//g)) ids.add(match[1]);
}
for (const id of ids) {
  if(!/^[a-z0-9-]+$/.test(id)) throw new Error('Unexpected raw run ID');
  for(const kind of ['raw','evidence']) {
    const directory=path.join(clone,'ogz-meta/cognition-history/mercury-runs',kind,'2026-09-26',id);
    if(fs.existsSync(directory)) visit(directory,kind+'--'+id+'--');
  }
}
visit(path.join(clone,'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/ledger'),'ledger--');
fs.writeFileSync(path.join(destination,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:manifest.files.length,runIds:[...ids],compressedBytes:manifest.files.reduce((n,f)=>n+f.gzipBytes,0)}));
