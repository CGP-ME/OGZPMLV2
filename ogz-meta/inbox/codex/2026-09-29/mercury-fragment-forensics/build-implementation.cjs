// Rebuild the reviewed overlay in memory from pinned Git bytes plus exact patch.
// No Git index, working-tree source, generated checkout, or provider is mutated.
'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding:'utf8'}).trim();
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'IMPLEMENTATION.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const patch = fs.readFileSync(path.join(__dirname, 'head-plus-repair.patch'), 'utf8');
assert.equal(hash(patch), manifest.patch_sha256, 'Patch hash changed');
const lines = patch.split('\n');
const sources = new Map();
let index = 0;
while (index < lines.length - 1) {
  const oldHeader = lines[index++], newHeader = lines[index++];
  assert(oldHeader.startsWith('--- a/') && newHeader.startsWith('+++ b/'), 'Unexpected patch header');
  const file = oldHeader.slice(6);
  assert.equal(newHeader.slice(6), file, 'Unexpected rename');
  const expected = manifest.files.find(entry => entry.path === file);
  assert(expected && !sources.has(file), 'Unexpected or duplicate patched file');
  const original = cp.execFileSync('git', ['show', `${manifest.base_commit}:${file}`], {cwd:root,encoding:'utf8',maxBuffer:64000000});
  assert.equal(hash(original), expected.base_sha256, `Base mismatch: ${file}`);
  assert(original.endsWith('\n'), 'Fixture patch builder expects newline-terminated source');
  const oldLines = original.slice(0, -1).split('\n');
  const output = [];
  let cursor = 0;
  while (index < lines.length - 1 && !lines[index].startsWith('--- a/')) {
    const match = lines[index++].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    assert(match, 'Unexpected hunk header');
    const oldCount = Number(match[2] === undefined ? 1 : match[2]);
    const newCount = Number(match[4] === undefined ? 1 : match[4]);
    const start = Number(match[1]) - (oldCount ? 1 : 0);
    assert(start >= cursor, 'Overlapping hunks');
    output.push(...oldLines.slice(cursor, start)); cursor = start;
    assert.equal(output.length, Number(match[3]) - (newCount ? 1 : 0), 'New hunk offset mismatch');
    let oldSeen = 0, newSeen = 0;
    while (oldSeen < oldCount || newSeen < newCount) {
      const line = lines[index++], op = line[0], content = line.slice(1);
      assert([' ', '+', '-'].includes(op), 'Unsupported patch line');
      if (op !== '+') { assert.equal(oldLines[cursor++], content, `Hunk context mismatch: ${file}`); oldSeen++; }
      if (op !== '-') { output.push(content); newSeen++; }
    }
    assert.equal(oldSeen, oldCount); assert.equal(newSeen, newCount);
  }
  output.push(...oldLines.slice(cursor));
  const result = output.join('\n') + '\n';
  assert.equal(hash(result), expected.implementation_sha256, `Overlay mismatch: ${file}`);
  sources.set(file, result);
}
assert.equal(sources.size, manifest.files.length, 'Missing overlay file');
module.exports = {root, manifest, sources};
if (require.main === module) console.log(JSON.stringify({base_commit:manifest.base_commit,patch_sha256:manifest.patch_sha256,files:[...sources].map(([file,source])=>({path:file,sha256:hash(source)})),mutations:0},null,2));
