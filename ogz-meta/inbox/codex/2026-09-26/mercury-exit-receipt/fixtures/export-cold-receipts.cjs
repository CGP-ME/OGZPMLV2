'use strict';
// Export existing real execution tapes; never change their originals.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const packet = path.resolve(__dirname, '..');
const clone = path.join(packet, 'private/cold-pull-5gJPFK');
const { redactSensitiveText } = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const correction = process.argv.includes('--correction');
const correctionRun = '2026-09-26t02-21-17-240z-1563654-2e292f831571';
const output = path.join(packet, correction ? 'cold-correction-tapes' : 'cold-pull-tapes');
fs.mkdirSync(output, { mode: 0o700 });
const manifest = { sourceHead: correction ? 'bed1573c842ceaa9bcbdfa813feba5183c5a1c69'
  : 'a51b33e4ccafa4a082e503c0423af7aad8805919',
  exportedAt: new Date().toISOString(), files: [] };
function exportFile(file, name) {
  const original = fs.readFileSync(file);
  const redacted = Buffer.from(redactSensitiveText(original.toString('utf8')));
  const compressed = zlib.gzipSync(redacted);
  const destination = path.join(output, name + '.gz');
  fs.writeFileSync(destination, compressed, { flag: 'wx', mode: 0o600 });
  manifest.files.push({ originalPath: path.relative(packet, file),
    originalSha256: digest(original), originalBytes: original.length,
    redactedPath: path.relative(packet, destination), redactedSha256: digest(redacted),
    redactedBytes: redacted.length, gzipSha256: digest(compressed), gzipBytes: compressed.length });
}
function visit(directory, prefix) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file, prefix + entry.name + '--');
    else if (entry.isFile()) exportFile(file, prefix + entry.name);
  }
}
const history = path.join(clone, 'ogz-meta/cognition-history/mercury-runs');
visit(path.join(history, 'raw/2026-09-26', ...(correction ? [correctionRun] : [])),
  correction ? `raw--${correctionRun}--` : 'raw--');
visit(path.join(history, 'evidence/2026-09-26', ...(correction ? [correctionRun] : [])),
  correction ? `evidence--${correctionRun}--` : 'evidence--');
visit(path.join(clone, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/ledger'), 'ledger--');
for (const label of process.argv.slice(2).filter(arg => arg !== '--correction')) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid exercise label');
  visit(path.join(packet, 'private', label), label + '--');
}
for (const name of (correction ? ['live-decision-replay-postpull.json']
  : ['seed-consequence.json', 'live-decision-replay.json'])) {
  exportFile(path.join(packet, 'private', name), name);
}
fs.writeFileSync(path.join(output, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', {
  flag: 'wx', mode: 0o600,
});
console.log(JSON.stringify({ files: manifest.files.length,
  compressedBytes: manifest.files.reduce((sum,f) => sum + f.gzipBytes, 0),
  manifest: path.relative(path.resolve(__dirname, '../../../../../..'), path.join(output, 'MANIFEST.json')) }));
