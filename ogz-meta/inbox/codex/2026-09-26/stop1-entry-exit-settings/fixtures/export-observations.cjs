'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const { redactSensitiveText } = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const env = require(path.join(root, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(root, '.env')));
const secrets = Object.entries(env).filter(([key, value]) => /KEY|SECRET|TOKEN|PASSWORD/.test(key) && value.length >= 12).map(([, value]) => value);
const [label, ...directories] = process.argv.slice(2);
assert.match(label, /^[a-z0-9-]+$/); assert.ok(directories.length);
const manifest = { at: new Date().toISOString(), files: [], knownCredentialMatches: 0 };
for (const directory of directories) {
  assert.match(directory, /^[a-zA-Z0-9-]+$/);
  for (const name of ['receipt.json', 'failure.json', 'console.json']) {
    const file = path.join(packet, 'private', directory, name); if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file), redacted = Buffer.from(redactSensitiveText(bytes.toString()));
    assert.equal(secrets.some(value => redacted.includes(value)), false);
    const gzip = zlib.gzipSync(redacted), redactedPath = `tapes/${label}--${directory}--${name}.gz`;
    fs.writeFileSync(path.join(packet, redactedPath), gzip, { flag: 'wx', mode: 0o600 });
    const reread = fs.readFileSync(path.join(packet, redactedPath));
    assert.equal(hash(reread), hash(gzip)); assert.equal(hash(zlib.gunzipSync(reread)), hash(redacted));
    manifest.files.push({ originalPath: path.relative(root, file), originalSha256: hash(bytes), originalBytes: bytes.length,
      redactedPath, redactedSha256: hash(redacted), gzipSha256: hash(gzip), gzipBytes: gzip.length });
  }
}
fs.writeFileSync(path.join(packet, 'tapes', label + '-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ files: manifest.files.length, compressedBytes: manifest.files.reduce((n, file) => n + file.gzipBytes, 0), knownCredentialMatches: 0 }));
