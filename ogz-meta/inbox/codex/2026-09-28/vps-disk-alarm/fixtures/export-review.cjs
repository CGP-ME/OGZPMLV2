'use strict';
// Preserve this alarm's existing reviews; no new model calls or review logic.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
const { redactSensitiveText } = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ledger = path.join(packet, 'private/ledger/2026-09-28.jsonl');
const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
const sources = new Set([ledger]);
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.path.startsWith('ogz-meta/cognition-history/mercury-runs/raw/2026-09-28/') && value.path.endsWith('.raw')) {
    sources.add(path.join(root, value.path));
  }
  for (const child of Object.values(value)) visit(child);
}
rows.forEach(visit);
const credentials = require(path.join(root, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(root, '.env')));
const secrets = Object.entries(credentials).filter(([key, value]) => /KEY|SECRET|TOKEN|PASSWORD|NTFY_TOPIC/.test(key) && value.length >= 8).map(([, value]) => value);
const output = path.join(packet, 'tapes');
fs.mkdirSync(output, { recursive: true });
const manifest = { source: 'Four completed alarm-only review invocations', date: new Date().toISOString(), runIds: rows.map(row => row.run_id), files: [] };
for (const source of [...sources].sort()) {
  const bytes = fs.readFileSync(source);
  let text = redactSensitiveText(bytes.toString('utf8'));
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  const redacted = Buffer.from(text), compressed = zlib.gzipSync(redacted);
  const name = source === ledger ? 'ledger.jsonl.gz' : path.basename(path.dirname(source)) + '--' + path.basename(source) + '.gz';
  fs.writeFileSync(path.join(output, name), compressed, { flag: 'wx', mode: 0o600 });
  manifest.files.push({ source: path.relative(root, source), originalSha256: hash(bytes), originalBytes: bytes.length,
    file: name, redactedSha256: hash(redacted), redactedBytes: redacted.length, compressedSha256: hash(compressed), compressedBytes: compressed.length });
}
fs.writeFileSync(path.join(output, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ runIds: manifest.runIds, files: manifest.files.length,
  compressedBytes: manifest.files.reduce((sum, file) => sum + file.compressedBytes, 0) }));
