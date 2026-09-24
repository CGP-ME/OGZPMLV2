'use strict';
// Mission-local operator launcher. Not part of the bot or Mercury architecture.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.resolve(__dirname, '../../../../..');
process.env.MERCURY_CONFIG_FILE = path.resolve(process.argv[3] || path.join(__dirname, 'mercury.isolated.json'));
const receiptDir = path.dirname(process.env.MERCURY_CONFIG_FILE);
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(receiptDir, 'ledger'));
const mode = process.argv[2];
async function main() {
  if (mode === 'preflight') {
    require(path.join(root, 'trai_brain/mercury-bridge/ask'));
    const { runProviderPreflight } = require(path.join(root, 'trai_brain/mercury-bridge/provider-preflight'));
    const { sanitizeForLedger } = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
    const result = await runProviderPreflight({ repoRoot: root });
    fs.writeFileSync(path.join(receiptDir, 'provider-readiness.json'), JSON.stringify(sanitizeForLedger(result), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ok: result.ok, challengerReady: result.challengerReady,
      tieBreakerReady: result.tieBreakerReady, ledger: result.runLedger,
      attempts: result.attempts.map(a => ({ provider: a.requested_provider, requestedModel: a.requested_model,
        appliedModels: a.applied_models, status: a.status, statusCode: a.status_code,
        identity: a.identity_posture, error: a.error })) }));
    if (!result.ok || !result.tieBreakerReady) process.exitCode = 1;
    return;
  }
  if (!['index', 'review'].includes(mode)) throw new Error('Use preflight, index or review');
  const script = mode === 'index' ? 'trai_brain/mercury-bridge/indexer.js' : 'trai_brain/mercury-bridge/ask.js';
  const args = mode === 'index' ? [script] : [script, '--max-tokens=7750', '--reviewers=mercury,fable,kimi', 'Mercury, break my fix.'];
  const commandReceipt = { startedAt: new Date().toISOString(), cwd: root, executable: process.execPath, args,
    configPath: process.env.MERCURY_CONFIG_FILE, ledgerPath: process.env.MERCURY_RUN_LEDGER_DIR };
  fs.writeFileSync(path.join(receiptDir, `${mode}-command.json`), JSON.stringify(commandReceipt, null, 2) + '\n', { flag: 'wx' });
  const fd = fs.openSync(path.join(receiptDir, `${mode}.private.log`), 'wx', 0o600);
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => fs.writeSync(fd, bytes));
  child.stderr.on('data', bytes => fs.writeSync(fd, bytes));
  console.log(JSON.stringify({ mode, pid: child.pid, command: args, log: `${mode}.private.log` }));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('close', (code, signal) => {
    fs.closeSync(fd);
    const receipt = { ...commandReceipt, finishedAt: new Date().toISOString(), code, signal };
    fs.writeFileSync(path.join(receiptDir, `${mode}-completion.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ mode, code, signal, completedAt: receipt.finishedAt }));
    process.exitCode = code == null ? 1 : code;
  });
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
