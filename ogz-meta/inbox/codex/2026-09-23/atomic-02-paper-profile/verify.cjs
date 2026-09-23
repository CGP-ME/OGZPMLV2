'use strict';
// Real ConfigLoader on byte-pinned parent source plus only the profile change.
// No application boot, provider, broker, PM2 or production configuration write.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const parent = '26e808075520be433285c13bb7c3616858469a6c';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const before = git('show', `${parent}:config/settings.json`);
const candidate = JSON.parse(before);
candidate.revision += 1;
candidate.launchProfiles.production.mode = 'paper';
candidate.launchProfiles.production.confirmLive = false;
const after = before.replace('  "revision": 1,', '  "revision": 2,')
  .replace('    "production": {\n      "mode": "live",\n      "confirmLive": true,',
    '    "production": {\n      "mode": "paper",\n      "confirmLive": false,');
assert.deepEqual(JSON.parse(after), candidate);
const fixtures = path.join(__dirname, 'fixtures-exact');
fs.mkdirSync(fixtures);
const sourceHashes = {};
const results = [];
for (const [label, settings] of [['parent', before], ['candidate', after]]) {
  const fixture = path.join(fixtures, label);
  for (const file of ['foundation/ConfigLoader.js', 'config/internals.json', 'config/settings.json']) {
    const source = file === 'config/settings.json' ? settings : git('show', `${parent}:${file}`);
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), source, { flag: 'wx' });
    sourceHashes[`${label}/${file}`] = hash(source);
  }
  const ConfigLoader = require(path.join(fixture, 'foundation/ConfigLoader.js'));
  for (const profile of [null, 'paper', 'production']) {
    for (const ambientLive of [false, true]) {
      const input = { ...(profile ? { PROFILE: profile } : {}),
        ...(ambientLive ? { LIVE_TRADING: 'true', PAPER_TRADING: 'false', EXECUTION_MODE: 'live', CONFIRM_LIVE: 'true' } : {}),
        ALPACA_API_KEY: 'synthetic-local-only', ALPACA_API_SECRET: 'synthetic-local-only', WEBSOCKET_AUTH_TOKEN: 'synthetic-local-only' };
      let observed;
      try {
        const snapshot = ConfigLoader.snapshot(input, { silent: true, loadDotenv: false, role: 'bot' });
        observed = { execution: snapshot.config.mode.execution, paperTrading: snapshot.config.mode.paperTrading,
          liveTrading: snapshot.config.mode.liveTrading, backtest: snapshot.config.mode.backtest,
          brokerMode: snapshot.config.execution.brokerMode, fingerprint: snapshot.fingerprint,
          source: snapshot.sources['mode.execution'], revision: snapshot.revisions.settings };
      } catch (error) { observed = { error: error.message }; }
      const expected = { execution: 'paper', paperTrading: true, liveTrading: false, backtest: false, brokerMode: 'paper' };
      if (label === 'candidate') {
        for (const [key, value] of Object.entries(expected)) assert.equal(observed[key], value);
      }
      results.push({ label, input: { profile, ambientLive, credentialSource: 'synthetic explicit values; no file/credential read' }, expected, observed });
    }
  }
}
const receipt = { parent, boundary: 'Actual configuration producer only, with synthetic explicit bootstrap inputs. Not a bot boot or an observed order route.',
  changedValues: { revision: [JSON.parse(before).revision, candidate.revision], productionMode: ['live', 'paper'], productionConfirmLive: [true, false] },
  loaderUnchangedFromParent: sourceHashes['parent/foundation/ConfigLoader.js'] === sourceHashes['candidate/foundation/ConfigLoader.js'],
  sourceHashes, results };
fs.writeFileSync(path.join(__dirname, 'receipt-exact.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ candidateCases: results.filter(row => row.label === 'candidate').length,
  allCandidateModeConsumersPaper: true, loaderUnchangedFromParent: receipt.loaderUnchangedFromParent,
  parentProduction: results.filter(row => row.label === 'parent' && row.input.profile === 'production').map(row => row.observed) }));
