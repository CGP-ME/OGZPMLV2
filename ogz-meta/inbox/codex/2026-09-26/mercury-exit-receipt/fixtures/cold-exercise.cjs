'use strict';
// Only launches the real cold-pulled CLI and captures its unabridged output.
// This fixture is not an alternate review engine or a bot boot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(packet, 'private/cold-pull-5gJPFK');
const label = process.argv[2];
const args = process.argv.slice(3);
if (!/^[a-z0-9-]+$/.test(label || '') || !args.length) {
  throw new Error('Supply a unique exercise label and actual ask.js arguments');
}
const configPath = path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-ingestion-recovery/private/mercury.isolated.json');
const git = (...gitArgs) => execFileSync('git', ['-C', clone, ...gitArgs], {
  encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = () => ({
  head: git('rev-parse', 'HEAD').trim(), tree: git('rev-parse', 'HEAD^{tree}').trim(),
  status: git('status', '--porcelain=v1', '--untracked-files=no'),
  trackedFiles: git('ls-files', '--stage', '-z').split('\0').filter(Boolean).map(entry => {
    const [metadata, file] = entry.split('\t');
    const [mode, object] = metadata.split(' ');
    if (mode === '160000') return { path: file, mode, object, content: 'uninitialized gitlink' };
    const bytes = mode === '120000' ? Buffer.from(fs.readlinkSync(path.join(clone, file)))
      : fs.readFileSync(path.join(clone, file));
    return { path: file, mode, object, sha256: digest(bytes) };
  }),
});
const before = identity();
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env'), quiet: true });
const destination = path.join(packet, 'private', label);
fs.mkdirSync(destination, { mode: 0o700 });
const save = (name, data) => fs.writeFileSync(path.join(destination, name), JSON.stringify(data, null, 2) + '\n', {
  flag: 'wx', mode: 0o600,
});
const startedAt = new Date().toISOString();
save('invocation.json', { startedAt, clone, command: [process.execPath, 'trai_brain/mercury-bridge/ask.js', ...args],
  configPath, ledgerDirectory: 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/ledger',
  dependencies: 'Shared installed node_modules from active repository; no secret files copied',
  source: before });
const output = fs.openSync(path.join(destination, 'console.log'), 'wx', 0o600);
const child = spawn(process.execPath, ['trai_brain/mercury-bridge/ask.js', ...args], {
  cwd: clone,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', NODE_PATH: path.join(root, 'node_modules'),
    MERCURY_CONFIG_FILE: configPath,
    MERCURY_RUN_LEDGER_DIR: 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/ledger' },
  stdio: ['ignore', output, output],
});
console.log(JSON.stringify({ label, pid: child.pid, startedAt, head: before.head,
  trackedDirty: before.status, output: path.relative(root, destination) }));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code, signal) => {
  fs.closeSync(output);
  const after = identity();
  const result = { finishedAt: new Date().toISOString(), exitCode: code, signal,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
    consoleSha256: digest(fs.readFileSync(path.join(destination, 'console.log'))), sourceAfter: after };
  save('completion.json', result);
  console.log(JSON.stringify({ label, exitCode: code, signal, sourceUnchanged: result.sourceUnchanged }));
  process.exitCode = code == null ? 1 : code;
});
