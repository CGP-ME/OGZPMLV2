'use strict';
// Trey's tape rule: retain redacted provider tapes and ledger, with both hashes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const {redactSensitiveText} = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ledger = path.join(packet, 'private/ledger/2026-09-29.jsonl');
const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
const sources = new Map();
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/') && value.path.endsWith('.raw')) {
    sources.set(value.path, value.sha256);
  }
  for (const item of Object.values(value)) collect(item);
}
rows.forEach(collect);
const records = [];
function capture(source, name, expectedHash) {
  if (!fs.existsSync(source)) {
    records.push({source:path.relative(root,source), original:expectedHash, absence:'source_missing'});
    return;
  }
  const original = fs.readFileSync(source);
  if (expectedHash && hash(original) !== expectedHash) throw new Error('Tape identity mismatch: '+source);
  const redacted = Buffer.from(redactSensitiveText(original.toString('utf8')));
  if (redactSensitiveText(redacted.toString('utf8')) !== redacted.toString('utf8')) throw new Error('Redaction is not stable: '+source);
  const compressed = zlib.gzipSync(redacted, {level:9});
  const target = path.join(packet,'tapes',name+'.gz');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target,compressed);
  records.push({source:path.relative(root,source),artifact:path.relative(packet,target),original:hash(original),redacted:hash(redacted),compressed:hash(compressed),originalBytes:original.length,redactedBytes:redacted.length,storedBytes:compressed.length});
}
capture(ledger,'ledger.jsonl');
for (const name of ['reproduction.json','observations.json','boundaries.json','review-prompt.txt','review-result.json','final-review-prompt.txt','final-review-result.json','view-integrity.json','symlink-reproduction.json','recheck-source-identity.json','final-recheck-source-identity.json']) {
  capture(path.join(packet, 'private', name), 'host/' + name);
}
for (const view of JSON.parse(fs.readFileSync(path.join(packet,'private/view-integrity.json')))) capture(path.join(root,view.manifest),'manifests/'+path.basename(path.dirname(view.manifest))+'.json');
for (const [source,expectedHash] of sources) capture(path.join(root,source),path.basename(path.dirname(source))+'/'+path.basename(source),expectedHash);
fs.writeFileSync(path.join(packet,'TAPES.json'),JSON.stringify({date:'2026-09-29',encoding:'gzip of UTF-8 after redactSensitiveText; original and redacted SHA-256 retained',runs:rows.map(r=>({id:r.run_id,verdict:r.verdict,termination:r.termination})),records},null,2)+'\n');
console.log(JSON.stringify({runs:rows.length,tapes:records.length,storedBytes:records.reduce((n,r)=>n+(r.storedBytes||0),0),absences:records.filter(r=>r.absence)}));
