'use strict';
// Fixture runner: source and all mutable outputs are isolated beneath this packet.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const assert = require('assert/strict');
const repo = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const packet = path.join(repo, 'ogz-meta/inbox/codex/2026-10-11/mtf-strategy-state');
const source = process.argv[2] || 'HEAD';
assert(source === 'working' || source === 'HEAD' || /^[a-f0-9]{40}$/.test(source));
const feeScenario = 'strategy-state';
fs.mkdirSync(path.join(packet, 'runs'), { recursive: true });
const run = fs.mkdtempSync(path.join(packet, 'runs', source + '-' + feeScenario + '-'));
const root = path.join(run, 'source');
fs.mkdirSync(root);
const paths = cp.execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(p =>
  /\.(js|cjs|json)$/.test(p) && (!p.includes('/') || /^(core|foundation|modules|brokers|config|utils|server|src|lib|strategies)\//.test(p) || p === 'ogz-meta/claudito-logger.js'));
const hashes = {};
for (const p of paths) {
  const bytes = source === 'working' ? fs.readFileSync(path.join(repo, p)) : cp.execFileSync('git', ['show', source + ':' + p], { cwd: repo, maxBuffer: 16e6 });
  const dest = path.join(root, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  hashes[p] = crypto.createHash('sha256').update(bytes).digest('hex');
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
const settingsPath = path.join(root, 'config/settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath));
// Preserve the source's real fee configuration.
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
const internalsPath = path.join(root, 'config/internals.json');
const internals = JSON.parse(fs.readFileSync(internalsPath));
const outputs = path.join(run, 'outputs');
fs.mkdirSync(outputs);
Object.assign(internals.paths, { stateFile: path.join(outputs, 'state.json'), dataDir: path.join(outputs, 'data'), journalDataDir: path.join(outputs, 'journal'), backtestOutputDir: outputs, logDirectory: path.join(outputs, 'logs') });
internals.sessionRouter.transitionStoreDir = path.join(outputs, 'transitions');
fs.writeFileSync(internalsPath, JSON.stringify(internals, null, 2));
fs.writeFileSync(path.join(run, 'source.json'), JSON.stringify({ head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), source, hashes, fixtureChanges: ['internals.paths redirected into isolated outputs', 'internals.sessionRouter.transitionStoreDir redirected', 'source fee settings preserved'] }, null, 2));
const out = fs.openSync(path.join(run, 'rehearsal.log'), 'w');
const result = cp.spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), root, outputs], {
  cwd: root,
  env: { PATH: process.env.PATH, PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'placeholder-token', ALPACA_API_KEY: 'placeholder-key', ALPACA_API_SECRET: 'placeholder-secret', KRAKEN_API_KEY: 'placeholder-key', KRAKEN_API_SECRET: 'placeholder-secret' },
  stdio: ['ignore', out, out]
});
fs.closeSync(out);
console.log(JSON.stringify({ source, run, exitCode: result.status, error: result.error?.message }));
process.exitCode = result.status === 0 ? 0 : 1;
