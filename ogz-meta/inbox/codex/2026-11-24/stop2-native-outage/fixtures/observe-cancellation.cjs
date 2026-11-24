'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=fixture\nALPACA_API_SECRET=fixture\nKRAKEN_API_KEY=fixture\nKRAKEN_API_SECRET=fixture\nWEBSOCKET_AUTH_TOKEN=fixture\n');
process.env.PROFILE = 'paper'; process.env.DOTENV_CONFIG_PATH = env;
require(process.cwd() + '/foundation/ConfigLoader').load({ role: 'bot', silent: true });
const Kraken = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const Alpaca = require(process.cwd() + '/brokers/AlpacaAdapter');
const rows = [];
async function main() {
  for (const kind of ['kraken', 'alpaca']) {
    const controller = new AbortController();
    let received = false, closed = false;
    const server = http.createServer((req, res) => {
      received = true;
      req.on('close', () => { closed = true; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{'); // Deliberately never finish the provider response.
      setTimeout(() => controller.abort(), 30);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const adapter = kind === 'kraken' ? new Kraken({ apiKey: 'fixture', apiSecret: 'fixture' })
      : new Alpaca({ apiKey: 'fixture', apiSecret: 'fixture', mode: 'paper' });
    if (kind === 'kraken') adapter.kraken.baseUrl = endpoint;
    else adapter.dataUrl = endpoint;
    let failure, result;
    try { result = await adapter.getCandles(kind === 'kraken' ? 'BTC-USD' : 'TSLA', '1m', 10, null, { signal: controller.signal }); }
    catch (error) { failure = { code: error.code, message: error.message }; }
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(received, true); assert.equal(closed, true);
    if (kind === 'kraken') {
      assert.deepEqual(result, []); assert.ok(logs.some(l => l.text.includes('Failed to fetch OHLC: canceled')));
    } else assert.match(failure?.message, /canceled/);
    await new Promise(resolve => server.close(resolve));
    rows.push({ broker: kind, received, socketClosed: closed, failure, result });
  }
  process.stdout.write(JSON.stringify({ rows, logs, isolation: true,
    seam: 'Local HTTP server holds its response; caller aborts. Actual adapters and Axios cancel the actual socket.' }, null, 2) + '\n');
}
main().then(() => process.exit(0), error => { process.stderr.write(error.stack + '\n'); process.exit(1); });
