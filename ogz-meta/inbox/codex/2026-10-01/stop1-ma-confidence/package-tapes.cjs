'use strict';
// Trey's tape rule: retain redacted provider tapes and ledger, with both hashes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const root = path.resolve(__dirname, '../../../../..');
const packet = __dirname;
const {redactSensitiveText} = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Historic source receipts can contain revoked 64-hex dashboard secrets. The
// generic ledger redactor preserves hashes, so also apply the existing denylist.
const {loadBurnedTokenHashes} = require(path.join(root, 'scripts/scan-secrets.js'));
const burnedHashes = loadBurnedTokenHashes();
const scanner = fs.readFileSync(path.join(root, 'scripts/scan-secrets.js'), 'utf8');
const prefixDeclaration = scanner.split('\n').find(line => line.startsWith('const BURNED_DASHBOARD_TOKEN_PREFIX = '));
const literal = prefixDeclaration.slice(prefixDeclaration.indexOf('=') + 1).trim().replace(/;$/, '');
const slash = literal.lastIndexOf('/');
const burnedPrefix = new RegExp(literal.slice(1, slash), literal.slice(slash + 1));
function redactTape(text) {
  return redactSensitiveText(text.replace(/[a-f0-9]{64}/gi, token =>
    burnedHashes.has(hash(token.toLowerCase())) || burnedHashes.has(token.toLowerCase())
      ? '[REDACTED_BURNED_SECRET]' : token)
    .replace(burnedPrefix, '[REDACTED_BURNED_DASHBOARD_TOKEN]'));
}

// Only these four MA results establish this mission's source/run closure.
const resultNames = ['review-result.json', 'quota-failed-review-result.json', 'recheck-result.json', 'kimi-final.json'];
const sources = new Map(), runIds = new Set(), runDirs = new Set(), redactedPointers = new Map();
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/') && value.path.endsWith('.raw')) {
    if (value.path.includes('[REDACTED]')) {
      redactedPointers.set(value.path+'#'+value.sha256,{path:value.path,sha256:value.sha256});
      runDirs.add(path.dirname(value.path));
    } else {
    const existing = sources.get(value.path);
    if (existing && value.sha256 && existing !== value.sha256) throw new Error('Conflicting original identity: '+value.path);
    sources.set(value.path, value.sha256 || existing);
    runDirs.add(path.dirname(value.path));
    }
  }
  for (const [key,item] of Object.entries(value)) {
    if ((key === 'run_id' || key === 'runId') && typeof item === 'string') runIds.add(item);
    if (item && typeof item === 'object') collect(item);
  }
}
// Refuse to package a partial final seat; no incomplete manifest replaces a full one.
for (const name of resultNames) {
  const file=path.join(packet,'private',name);
  if (!fs.existsSync(file)) throw new Error('Required MA result is not ready: '+name);
  collect(JSON.parse(fs.readFileSync(file,'utf8')));
}
// Raw pointer names may be redacted in receipts. Restrict recovery to identified
// MA run directories and validate originals by their recorded SHA256.
const originalsByHash=new Map();
for (const dir of runDirs) {
  const absolute=path.join(root,dir);
  if (!fs.existsSync(absolute)) continue;
  for (const name of fs.readdirSync(absolute)) {
    if (!name.endsWith('.raw')) continue;
    const relative=path.join(dir,name),sha=hash(fs.readFileSync(path.join(root,relative)));
    originalsByHash.set(sha,relative);
    if (!sources.has(relative)) sources.set(relative,sha);
  }
}
const recoveredPointers=[];
for (const pointer of redactedPointers.values()) {
  const actual=originalsByHash.get(pointer.sha256);
  if (actual) recoveredPointers.push({ledger_pointer:pointer.path,actual_source:actual,sha256:pointer.sha256});
  else sources.set(pointer.path,pointer.sha256);
}
for (const [source,sha] of sources) {
  if (!fs.existsSync(path.join(root,source)) && originalsByHash.has(sha)) {
    recoveredPointers.push({ledger_pointer:source,actual_source:originalsByHash.get(sha),sha256:sha});
    sources.delete(source);
  }
}
const records=[], unique=new Map();
function captureBytes(source,original,expectedHash,extra={}) {
  const originalHash=hash(original);
  if (expectedHash && originalHash!==expectedHash) throw new Error('Tape identity mismatch: '+source);
  const redacted=Buffer.from(redactTape(original.toString('utf8')));
  if (redactTape(redacted.toString('utf8'))!==redacted.toString('utf8')) throw new Error('Unstable redaction: '+source);
  const redactedHash=hash(redacted);
  let stored=unique.get(redactedHash);
  if (!stored) {
    const compressed=zlib.gzipSync(redacted,{level:9}),artifact='tapes/'+redactedHash+'.utf8.gz';
    fs.mkdirSync(path.join(packet,'tapes'),{recursive:true});fs.writeFileSync(path.join(packet,artifact),compressed);
    stored={artifact,redacted:redactedHash,compressed:hash(compressed),redactedBytes:redacted.length,storedBytes:compressed.length};
    unique.set(redactedHash,stored);
  }
  records.push({source,original:originalHash,originalBytes:original.length,...stored,...extra});
}
for (const name of resultNames) {
  const relative=path.relative(root,path.join(packet,'private',name));
  captureBytes(relative,fs.readFileSync(path.join(root,relative)));
}
// Preserve exact ledger lines for these MA runs, not unrelated day-file rows.
const ledger=path.join(packet,'private/ledger/2026-10-01.jsonl');
const ledgerRuns=new Set();
if (fs.existsSync(ledger)) {
  const lines=fs.readFileSync(ledger,'utf8').split('\n');
  for (let i=0;i<lines.length;i++) {
    if (!lines[i].trim()) continue;
    const row=JSON.parse(lines[i]);
    if (!runIds.has(row.run_id)) continue;
    ledgerRuns.add(row.run_id);
    captureBytes(path.relative(root,ledger)+'#line='+String(i+1),Buffer.from(lines[i]+'\n'),undefined,{runId:row.run_id});
  }
}
for (const [source,sha] of sources) {
  if (!fs.existsSync(path.join(root,source))) {records.push({source,original:sha,absence:'source_missing'});continue;}
  captureBytes(source,fs.readFileSync(path.join(root,source)),sha);
}
const manifest={date:'2026-10-01',scope:resultNames,encoding:'Content-addressed gzip of UTF-8 redacted with redactSensitiveText plus burned-secret denylist; identical payloads stored once',runs:[...runIds],ledgerRuns:[...ledgerRuns],recoveredPointers,records};
fs.writeFileSync(path.join(packet,'TAPES.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({records:records.length,uniquePayloads:unique.size,storedBytes:[...unique.values()].reduce((n,r)=>n+r.storedBytes,0),absences:records.filter(r=>r.absence)}));
