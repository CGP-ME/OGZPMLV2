const fs = require('fs'), path = require('path'), cp = require('child_process');
const kind = process.argv[2];
for (const file of fs.readdirSync(__dirname)) {
  if (file.startsWith(kind + '__')) {
    const destination = path.resolve(file.slice(kind.length + 2, -4).split('__').join('/'));
    fs.writeFileSync(destination, fs.readFileSync(path.join(__dirname, file)));
  }
}
// Use exact pinned configuration source, not unrelated worktree configuration.
fs.writeFileSync('foundation/ConfigLoader.js', fs.readFileSync(path.join(__dirname, 'foundation__ConfigLoader.js.cjs')));
fs.writeFileSync('config/settings.json', JSON.stringify(require('./settings.cjs')));
const env = { ...process.env, WEBSOCKET_AUTH_TOKEN: 'fixture-only-token', ALPACA_API_KEY: 'fixture-only-key', ALPACA_API_SECRET: 'fixture-only-secret', KRAKEN_API_KEY: 'fixture-only-key', KRAKEN_API_SECRET: 'fixture-only-secret' };
fs.writeFileSync('.env', ['WEBSOCKET_AUTH_TOKEN', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'KRAKEN_API_KEY', 'KRAKEN_API_SECRET'].map(key => key + '=' + env[key]).join('\n') + '\n');
const result = cp.spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', 'test/session-router-transition-journal.test.js', 'test/session-router-fail-safe.test.js', 'test/session-router-epoch-fencing.test.js', '--runInBand'], { env, stdio: 'inherit' });
process.exitCode = result.status;
