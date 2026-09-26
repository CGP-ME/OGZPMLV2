'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const packet = path.resolve(__dirname, '..');
const outputs = [];
for (const name of ['receipt', 'report-omission']) {
  const args = ['-r', path.join(__dirname, 'index-source.cjs'), '-r', './trai_brain/mercury-bridge/ask.js', path.join(__dirname, `${name}.cjs`)];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const bytes = JSON.stringify({ command: ['node', ...args], exit_code: result.status,
    stdout: result.stdout, stderr: result.stderr }, null, 2) + '\n';
  const dest = path.join(packet, `${name}-observation.json`);
  fs.writeFileSync(dest, bytes);
  outputs.push({ path: path.relative(process.cwd(), dest), exit_code: result.status,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  if (result.status !== 0) process.exitCode = 1;
}
console.log(JSON.stringify(outputs, null, 2));
