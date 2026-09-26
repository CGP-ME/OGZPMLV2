'use strict';
// Append review tapes to the existing checkpoint; never replace prior receipts.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const { redactSensitiveText } = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const env = require(path.join(root, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(root, '.env')));
const secrets = Object.entries(env).filter(([key, value]) => /KEY|SECRET|TOKEN|PASSWORD/.test(key) && value.length >= 12).map(([, value]) => value);
const [name, ...labels] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name || '') || !labels.length || labels.some(label => !/^[a-z0-9-]+$/.test(label))) throw new Error('Explicit manifest name and completed wrapper labels required');
const out = path.join(packet, 'tapes'), manifest = { at: new Date().toISOString(), labels, files: [], knownCredentialMatches: 0 };
function write(bytes, source, filename) {
  const redacted = Buffer.from(redactSensitiveText(bytes.toString()));
  if (secrets.some(value => redacted.includes(value))) throw new Error('Credential remains: ' + filename);
  const compressed = zlib.gzipSync(redacted), destination = path.join(out, name + '--' + filename + '.gz');
  fs.writeFileSync(destination, compressed, { flag: 'wx', mode: 0o600 });
  manifest.files.push({ originalPath: source, originalSha256: hash(bytes), originalBytes: bytes.length,
    redactedPath: path.relative(packet, destination), redactedSha256: hash(redacted), redactedBytes: redacted.length,
    gzipSha256: hash(compressed), gzipBytes: compressed.length });
}
function visit(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file, prefix + entry.name + '--');
    else if (entry.isFile()) write(fs.readFileSync(file), path.relative(root, file), prefix + entry.name);
  }
}
const ledgerPath = path.join(clone, 'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/ledger/2026-09-26.jsonl');
const ledger = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').map(line => ({ line, row: JSON.parse(line) }));
const batches = new Set(), selectedRows = new Set();
for (const label of labels) {
  const directory = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private', label);
  const invocation = JSON.parse(fs.readFileSync(path.join(directory, 'invocation.json')));
  const completion = JSON.parse(fs.readFileSync(path.join(directory, 'completion.json')));
  if (!completion.sourceUnchanged) throw new Error('Source changed during review: ' + label);
  visit(directory, label + '--');
  const output = fs.readFileSync(path.join(directory, 'console.log'), 'utf8');
  for (const match of output.matchAll(/(?:evidence|raw)\/2026-09-26\/([^/\s"]+)\//g)) batches.add(match[1]);
  for (const { line, row } of ledger) {
    const time = row.created_at || row.timestamp || row.started_at;
    if (time && time >= invocation.at && time <= completion.at) selectedRows.add(line);
  }
}
for (const batch of batches) for (const kind of ['raw', 'evidence']) {
  const directory = path.join(clone, 'ogz-meta/cognition-history/mercury-runs', kind, '2026-09-26', batch);
  if (fs.existsSync(directory)) visit(directory, kind + '--' + batch + '--');
}
write(Buffer.from([...selectedRows].join('\n') + '\n'), path.relative(root, ledgerPath) + '#selected-wrapper-intervals', 'ledger.jsonl');
manifest.ledgerRows = selectedRows.size;
manifest.batches = [...batches];
for (const record of manifest.files) {
  const compressed = fs.readFileSync(path.join(packet, record.redactedPath));
  if (hash(compressed) !== record.gzipSha256 || hash(zlib.gunzipSync(compressed)) !== record.redactedSha256) throw new Error('Export hash mismatch');
}
fs.writeFileSync(path.join(out, name + '-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ files: manifest.files.length, ledgerRows: manifest.ledgerRows, batches: manifest.batches, compressedBytes: manifest.files.reduce((n, f) => n + f.gzipBytes, 0), knownCredentialMatches: 0 }));
