'use strict';
// Build a scoped, reviewable patch; never stage the inherited dirty worktree wholesale.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const packet = path.resolve(__dirname, '..');
const root = process.cwd();
const dir = path.join(packet, 'private');
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'before/source.json'), 'utf8'));
const files = snapshot.files.filter(item => fs.existsSync(path.join(dir, 'before', item.path)));
const parts = [];
for (const { path: file } of files) {
  const before = path.join(dir, 'before', file);
  const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--unified=3', before, file],
    { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 4 * 1024 * 1024 });
  if (diff.status > 1) throw new Error(diff.stderr);
  let patch = diff.stdout.replace(/^diff --git .+$/m, `diff --git a/${file} b/${file}`)
    .replace(/^--- .+$/m, `--- a/${file}`).replace(/^\+\+\+ .+$/m, `+++ b/${file}`);
  parts.push(patch);
}
const patch = parts.join('');
fs.writeFileSync(path.join(dir, 'mission-delta.patch'), patch, { mode: 0o600 });
const index = path.join(dir, 'scoped.index');
const env = { ...process.env, GIT_INDEX_FILE: index, GIT_OPTIONAL_LOCKS: '0' };
if (!fs.existsSync(index)) execFileSync('git', ['read-tree', snapshot.head], { env });
const check = spawnSync('git', ['apply', '--cached', '--check', '--verbose', '-'], { input: patch, env, encoding: 'utf8' });
console.log(check.stdout + check.stderr);
console.log(JSON.stringify({ patch: path.relative(root, path.join(dir, 'mission-delta.patch')), check: check.status }));
