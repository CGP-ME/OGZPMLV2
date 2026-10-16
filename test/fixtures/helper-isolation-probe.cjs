'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');
require('../helpers/require-isolation.cjs')();

(async () => {
  const root = process.cwd();
  assert.equal(process.env.OGZ_HOST_SECRET_CANARY, undefined);
  for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    let environment;
    try { environment = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); }
    catch (error) { if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) continue; throw error; }
    assert.ok(!environment.includes('OGZ_HOST_SECRET_CANARY='), 'namespace processes do not inherit host credentials');
  }
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
  assert.equal(fs.existsSync('/home/linuxuser/.pm2/rpc.sock'), false);
  assert.equal(fs.existsSync(path.join(root, 'data/state-paper.json')), false);
  assert.equal(fs.existsSync(process.argv[3]), false, 'outside host sentinel is not mounted');

  const connected = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(process.argv[2]) });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
  assert.equal(connected, false, 'host service is not reachable');

  for (const directory of ['data', 'logs/decisions', 'data/pattern-memory']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, 'helper-isolation-canary.json'), '{"fixture":true}');
  }
  const escape = path.join(root, 'data/host-link');
  fs.symlinkSync(process.argv[3], escape);
  assert.throws(() => fs.writeFileSync(escape, 'should not reach host'), /ENOENT|EACCES|EROFS/);
  const child = spawnSync(process.execPath, ['-e', "require('fs').writeFileSync('data/helper-child-canary.json','{}')"], { cwd: root });
  assert.equal(child.status, 0, 'child can write its disposable data');

  // Deliberately reproduce the obsolete env override + actual writer shape.
  // These synthetic credentials exist only inside this disconnected fixture.
  fs.writeFileSync('.env', [
    'ALPACA_API_KEY=PKISOLATIONFIXTURE',
    'ALPACA_API_SECRET=ISOLATIONFIXTURESECRET',
    'KRAKEN_API_KEY=ISOLATIONFIXTURE',
    'KRAKEN_API_SECRET=ISOLATIONFIXTURESECRET',
    'WEBSOCKET_AUTH_TOKEN=ISOLATIONFIXTURETOKEN',
  ].join('\n'));
  process.env.PROFILE = 'paper';
  process.env.STATE_FILE = '/tmp/obsolete-env-path.json';
  const { StateManager } = require('../../core/StateManager');
  const state = new StateManager();
  state.state.balance = 7500;
  assert.equal(state.save().success, true);
  assert.equal(JSON.parse(fs.readFileSync('data/state-paper.json', 'utf8')).balance, 7500);
  require('../../core/DecisionLedgerLogger').writeRejection({ tradeId: 'ISOLATION_FIXTURE', symbol: 'TSLA' });
  assert.ok(fs.readdirSync('logs/decisions').some(name => name.startsWith('rejections_')));
  console.log('PASS: namespace, credentials, host socket, absolute paths, symlink, child process, actual StateManager and ledger writes isolated');
})().catch(error => { console.error(error); process.exitCode = 1; });
