'use strict';
const fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto');
const packet = path.resolve(__dirname, '..');
const root = path.resolve(__dirname, '../../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(packet, 'CANDIDATE.json')));
const run = name => cp.execFileSync(process.execPath, [path.join(__dirname, name + '.cjs')], {cwd: root, encoding: 'utf8', maxBuffer: 8e6});
run('build');
const files = Object.keys(JSON.parse(fs.readFileSync(path.join(packet, 'build-receipt.json'))).candidate);
const receipt = { tree: identity.candidate, files: {}, steps: [] };
try {
  for (const file of files) {
    const bytes = cp.execFileSync('git', ['show', identity.candidate + ':' + file], {cwd: root});
    fs.writeFileSync(path.join(__dirname, 'candidate', file), bytes);
    receipt.files[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  for (const name of ['integrated-save', 'producer-integration', 'reload-policy-probe']) {
    const output = run(name);
    receipt.steps.push({name, passed: true, output});
  }
  fs.writeFileSync(path.join(packet, 'REVIEW-TREE-PROOF.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({tree: identity.candidate, passed: receipt.steps.map(s => s.name)}));
} finally {
  run('build');
}
