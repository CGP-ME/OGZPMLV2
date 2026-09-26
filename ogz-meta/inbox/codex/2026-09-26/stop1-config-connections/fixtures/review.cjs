'use strict';
// Capture the existing real Mercury CLI; not an alternate review implementation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const [label, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label || '')) throw new Error('Unique receipt label required');
const git = (...a) => execFileSync('git', ['-C', clone, ...a], {
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 16 * 1024 * 1024,
}).toString();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function identity() {
  return { head: git('rev-parse', 'HEAD').trim(), diff: git('diff', '--binary'),
    files: git('ls-files', '--stage', '-z').split('\0').filter(Boolean).map(entry => {
      const [meta, file] = entry.split('\t'); const [mode, object] = meta.split(' ');
      return { path: file, mode, object, sha256: mode === '160000' ? null : hash(
        mode === '120000' ? fs.readlinkSync(path.join(clone, file)) : fs.readFileSync(path.join(clone, file))) };
    }) };
}
const destination = path.join(packet, 'private', label);
fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
fs.mkdirSync(destination, { mode: 0o700 });
const save = (name, value) => fs.writeFileSync(path.join(destination, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const before = identity();
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env'), quiet: true });
const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', NODE_PATH: path.join(root, 'node_modules'),
  MERCURY_CONFIG_FILE: path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-ingestion-recovery/private/mercury.isolated.json'),
  MERCURY_RUN_LEDGER_DIR: 'ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/private/ledger' };
const invocation = args[0] === '--preflight'
  ? ['-e', "require('./trai_brain/mercury-bridge/provider-preflight').runProviderPreflight({repoRoot:process.cwd()}).then(r=>{console.log(JSON.stringify(r));process.exitCode=r.ok&&r.tieBreakerReady?0:1})"]
  : ['trai_brain/mercury-bridge/ask.js', ...args];
save('invocation.json', { at: new Date().toISOString(), clone, invocation, source: before,
  configuration: { path: env.MERCURY_CONFIG_FILE, sha256: hash(fs.readFileSync(env.MERCURY_CONFIG_FILE)) },
  dependencies: 'Shared installed node_modules; credentials loaded in memory only; explicit-target run does not index' });
const output = fs.openSync(path.join(destination, 'console.log'), 'wx', 0o600);
const child = spawn(process.execPath, invocation, { cwd: clone, env, stdio: ['ignore', output, output] });
console.log(JSON.stringify({ label, pid: child.pid, head: before.head, receipt: path.relative(root, destination) }));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code, signal) => {
  fs.closeSync(output); const after = identity();
  const result = { at: new Date().toISOString(), exitCode: code, signal,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after), source: after,
    outputSha256: hash(fs.readFileSync(path.join(destination, 'console.log'))) };
  save('completion.json', result);
  console.log(JSON.stringify({ label, exitCode: code, sourceUnchanged: result.sourceUnchanged }));
  process.exitCode = code == null ? 1 : code;
});
