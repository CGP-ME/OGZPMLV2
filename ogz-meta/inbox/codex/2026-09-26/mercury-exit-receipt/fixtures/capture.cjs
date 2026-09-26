'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = process.cwd();
const packet = path.resolve(__dirname, '..');
const paths = ['reviewer-panel.js', 'doctrine-review.js', 'ask.js', 'adversarial-review.js',
  'run-ledger.js', 'evidence-ingestion.js'].map(file => `trai_brain/mercury-bridge/${file}`);
const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const destination = path.join(packet, 'private', process.argv[2]);
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
const dirty = git(['diff', '--name-only', '-z']).toString().split('\0').filter(Boolean);
const all = [...new Set([...dirty, ...paths])];
const files = all.map(file => {
  const bytes = fs.readFileSync(path.join(root, file));
  if (paths.includes(file)) {
    const copy = path.join(destination, file);
    fs.mkdirSync(path.dirname(copy), { recursive: true, mode: 0o700 });
    fs.writeFileSync(copy, bytes, { flag: 'wx', mode: 0o600 });
  }
  return { path: file, sha256: hash(bytes), bytes: bytes.length };
});
const receipt = { at: new Date().toISOString(), head: git(['rev-parse', 'HEAD']).toString().trim(),
  index_diff_sha256: hash(git(['diff', '--cached', '--binary'])), files };
fs.writeFileSync(path.join(destination, 'source.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ receipt: path.relative(root, path.join(destination, 'source.json')), files: files.length, head: receipt.head }));
