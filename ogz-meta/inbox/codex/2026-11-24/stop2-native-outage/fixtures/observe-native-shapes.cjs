'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const root = process.cwd();
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=fixture\nALPACA_API_SECRET=fixture\nKRAKEN_API_KEY=fixture\nKRAKEN_API_SECRET=fixture\nWEBSOCKET_AUTH_TOKEN=fixture\n');
process.env.PROFILE = 'paper'; process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(root + '/foundation/ConfigLoader');
const loaded = ConfigLoader.load({ role: 'bot', silent: true });
const Kraken = require(root + '/brokers/KrakenIBrokerAdapter');
const Alpaca = require(root + '/brokers/AlpacaAdapter');
const axios = require('axios');
const krakenCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-22/stop2-kraken-history-pacing/fixtures/native-ohlc.json'));
const alpacaCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json'));
const source = fs.readFileSync('run-empire-v2.js', 'utf8');
const owner = require('acorn').parse(source, { ecmaVersion: 'latest' }).body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const method = owner.body.body.find(n => n.key.name === '_normalizeHydrationCandle');
const normalize = vm.runInNewContext('({' + source.slice(method.start, method.end) + '})', {
  ohlcTimestampMs: require(root + '/foundation/ohlc-normalize').toTimestampMs,
})._normalizeHydrationCandle;
const intervals = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
async function main() {
  const rows = [];
  for (const kind of ['kraken', 'alpaca']) {
    const adapter = kind === 'kraken' ? new Kraken({ apiKey: 'fixture', apiSecret: 'fixture' })
      : new Alpaca({ apiKey: 'fixture', apiSecret: 'fixture', mode: 'paper' });
    for (const [timeframe, minutes] of Object.entries(intervals)) {
      const response = kind === 'kraken'
        ? krakenCapture.observations.find(o => o.interval === minutes).response
        : alpacaCapture.lanes.bot[timeframe].response;
      axios.get = async () => ({ data: structuredClone(response) });
      const symbol = kind === 'kraken' ? 'BTC-USD' : 'TSLA';
      const candles = await adapter.getCandles(symbol, timeframe, 60);
      const rejected = candles.filter(c => normalize(c, symbol, timeframe, minutes * 60000) === null);
      assert.ok(candles.length > 0);
      assert.equal(rejected.length, 0, kind + ' ' + timeframe);
      rows.push({ broker: kind, symbol, timeframe, observed: candles.length, rejected: rejected.length,
        first: candles[0].t, last: candles.at(-1).etime });
    }
  }
  process.stdout.write(JSON.stringify({ rows, actualAdapters: true, network: 'captured native provider responses in isolation',
    captures: { kraken: krakenCapture.capturedAt, alpaca: alpacaCapture.capturedAt },
    paperBaseTimeframe: loaded.config.execution.candleTimeframe, logs,
    limitation: 'These recorded responses verify supported producer shapes, not every possible future provider response.' }, null, 2) + '\n');
}
main().then(() => process.exit(0), error => { process.stderr.write(error.stack + '\n'); process.exit(1); });
