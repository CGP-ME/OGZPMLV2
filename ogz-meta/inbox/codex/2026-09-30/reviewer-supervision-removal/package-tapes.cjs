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

const ledger = path.join(packet, 'private/ledger/2026-09-30.jsonl');
const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
const followupLedger = path.join(packet, 'followup/private/focused-results.jsonl');
const followupRows = fs.existsSync(followupLedger) ? fs.readFileSync(followupLedger, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const sources = new Map();
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/') && value.path.endsWith('.raw')) {
    sources.set(value.path, value.sha256);
  }
  for (const item of Object.values(value)) collect(item);
}
rows.forEach(collect);
followupRows.forEach(collect);
// Ledger redaction can redact long raw-output basenames. Preserve every actual
// provider output for this known mission run, and resolve redacted pointers by hash.
const rawRoot = path.join(root, 'ogz-meta/cognition-history/mercury-runs/raw/2026-09-30');
const identities = JSON.parse(fs.readFileSync(path.join(packet, 'review-identities.json'), 'utf8'));
const runDirs = [...new Set([...Object.values(identities).map(entry => entry.raw_run || entry.run),
  ...followupRows.map(entry => entry.identity.rawRunId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'))].filter(Boolean))];
const originalPathsByHash = new Map();
for (const run of runDirs) for (const name of fs.readdirSync(path.join(rawRoot, run))) {
  if (!name.endsWith('.raw')) continue;
  const file = path.join(rawRoot, run, name), sha = hash(fs.readFileSync(file));
  const relative = path.relative(root, file);
  sources.set(relative, sha); originalPathsByHash.set(sha, relative);
}
const recoveredPointers = [];
for (const [source, sha] of sources) if (!fs.existsSync(path.join(root, source)) && originalPathsByHash.has(sha)) {
  recoveredPointers.push({ledger_pointer:source, actual_source:originalPathsByHash.get(sha), sha256:sha});
  sources.delete(source);
}
const records = [];
function capture(source, name, expectedHash) {
  if (!fs.existsSync(source)) {
    records.push({source:path.relative(root,source), original:expectedHash, absence:'source_missing'});
    return;
  }
  const original = fs.readFileSync(source);
  if (expectedHash && hash(original) !== expectedHash) throw new Error('Tape identity mismatch: '+source);
  const redacted = Buffer.from(redactTape(original.toString('utf8')));
  if (redactTape(redacted.toString('utf8')) !== redacted.toString('utf8')) throw new Error('Redaction is not stable: '+source);
  const compressed = zlib.gzipSync(redacted, {level:9});
  const target = path.join(packet,'tapes',name+'.gz');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target,compressed);
  records.push({source:path.relative(root,source),artifact:path.relative(packet,target),original:hash(original),redacted:hash(redacted),compressed:hash(compressed),originalBytes:original.length,redactedBytes:redacted.length,storedBytes:compressed.length});
}
capture(ledger,'ledger.jsonl');
if (fs.existsSync(followupLedger)) capture(followupLedger,'focused-results.jsonl');
for (const [source,expectedHash] of sources) capture(path.join(root,source),path.basename(path.dirname(source))+'/'+path.basename(source),expectedHash);
fs.writeFileSync(path.join(packet,'TAPES.json'),JSON.stringify({date:'2026-09-30',encoding:'gzip of UTF-8 after redactSensitiveText; original and redacted SHA-256 retained',recoveredPointers,runs:rows.map(r=>({id:r.run_id,verdict:r.verdict,termination:r.termination})),records},null,2)+'\n');
console.log(JSON.stringify({runs:rows.length,tapes:records.length,storedBytes:records.reduce((n,r)=>n+(r.storedBytes||0),0),absences:records.filter(r=>r.absence)}));
