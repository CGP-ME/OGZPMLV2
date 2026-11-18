'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const baseline = process.argv.includes('--baseline');
const override = process.argv.find(arg => arg.startsWith('--source-overrides='));
if (override) for (const [file, source] of Object.entries(JSON.parse(fs.readFileSync(override.split('=')[1])))) fs.writeFileSync(file, source);
const credentials = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(credentials, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = credentials; process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
const resolvedConfig = ConfigLoader.load({ role: 'bot', silent: true });
const stockAdapter = require(path.join(process.cwd(), 'server/stock-data-adapter'));
const { resolveDashboardStockConfigFromRuntime } = require(path.join(process.cwd(), 'server/dashboard-stock-stream-config'));
const { attachDashboardMarketScope, buildDashboardMarketScope } = require(path.join(process.cwd(), 'server/dashboard-market-scope'));
const acorn = require('acorn');
const hashes = {};
function parsed(filename) {
  const source = fs.readFileSync(filename, 'utf8'), nodes = [];
  hashes[filename] = crypto.createHash('sha256').update(source).digest('hex');
  function walk(n) { if (!n || typeof n !== 'object') return; if (n.type) nodes.push(n);
    for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
  walk(acorn.parse(source, { ecmaVersion: 'latest' }));
  return { nodes, text: n => source.slice(n.start, n.end) };
}
const server = parsed('ogzprime-ssl-server.js'), runner = parsed('run-empire-v2.js'), socket = parsed('core/WebSocketManager.js');
for (const f of ['server/stock-data-adapter.js','server/dashboard-stock-stream-config.js','server/dashboard-market-scope.js','foundation/ConfigLoader.js','config/settings.json','config/internals.json']) hashes[f] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function declaration(source, name, ctx) {
  const node = source.nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  assert.ok(node, name); vm.runInContext(source.text(node), ctx);
}
function method(source, name, owner, ctx) {
  const node = source.nodes.find(n => n.type === 'MethodDefinition' && n.key.name === name);
  assert.ok(node, name); return vm.runInContext('({' + source.text(node) + '})', ctx)[name].bind(owner);
}
const historyBlock = server.nodes.find(n => n.type === 'IfStatement' && server.text(n.test).includes("ws.clientType === 'dashboard'") && server.text(n.test).includes("'request_historical'"));
assert.ok(historyBlock);
const nativeBar = { t: '2026-11-17T05:00:00.000Z', o: 100, h: 104, l: 99, c: 103, v: 0 };
(async () => {
  const cases = [], routeCases = [];
  for (const timeframe of ['1m','5m','15m','30m','1h','4h','1d']) for (const mode of ['success','empty','http_failure','network_failure','missing_credentials']) {
    const config = structuredClone(resolvedConfig.config);
    config.services.dashboard.stockData.symbols = ['TSLA'];
    config.services.dashboard.stockData.apiKey = mode === 'missing_credentials' ? null : 'fixture-key';
    config.services.dashboard.stockData.apiSecret = 'fixture-secret';
    const dataConfig = resolveDashboardStockConfigFromRuntime(config).data;
    for (const route of ['server','runner']) {
      const sent = [], relayed = [], requests = [], pending = [], logs = [];
      const logging = Object.fromEntries(['log','warn','error'].map(level => [level, (...args) => logs.push({level,message:args.map(v => v?.message || String(v)).join(' ')})]));
      const originalConsole = { log: console.log, warn: console.warn, error: console.error };
      Object.assign(console, logging);
      global.fetch = async url => {
        const parsed = new URL(url); requests.push({ path: parsed.pathname, timeframe: parsed.searchParams.get('timeframe') });
        if (mode === 'network_failure') throw Error('synthetic provider disconnected');
        return { ok: mode !== 'http_failure', status: mode === 'http_failure' ? 503 : 200,
          text: async () => 'synthetic provider unavailable', json: async () => ({ bars: mode === 'empty' ? [] : [nativeBar] }) };
      };
      const bot = { dashboardWs: { send: message => sent.push(JSON.parse(message)) }, tradingPair: 'TSLA' };
      const ctx = vm.createContext({ ConfigLoader, console: logging, Date, Map, Set, JSON,
        resolvedConfig: { config }, resolveDashboardStockConfigFromRuntime,
        isDashboardStockSymbol: stockAdapter.isStock, fetchStockCandles: stockAdapter.fetchStockCandles,
        DASHBOARD_STOCK_DATA_CONFIG: dataConfig, DASHBOARD_STOCK_PRICE_SYMBOLS: ['TSLA'],
        dashboardSnapshotCache: { state_update: null }, dashboardRuntimeConfig: config,
        attachDashboardMarketScope, buildDashboardMarketScope, WebSocket: { OPEN: 1 },
        ws: { clientType: 'dashboard', readyState: 1, send: message => sent.push(JSON.parse(message)) },
        wss: { clients: new Set([{ readyState: 1, authenticated: true, clientType: 'bot', send: message => relayed.push(JSON.parse(message)) }]) },
        data: { type: 'request_historical', asset: 'TSLA', timeframe, limit: 2 },
        require: name => { assert.equal(name, './server/stock-data-adapter'); return { ...stockAdapter,
          fetchStockCandles: (...args) => { const promise = stockAdapter.fetchStockCandles(...args); pending.push(promise); return promise; } }; },
      });
      declaration(server, 'normalizeDashboardSymbol', ctx); declaration(server, 'dashboardStockMarketScope', ctx);
      declaration(runner, 'normalizeRuntimeSymbol', ctx); declaration(runner, 'looksLikeEquityTicker', ctx);
      try {
        if (route === 'server') { vm.runInContext(server.text(historyBlock), ctx); await Promise.allSettled(pending); for (let i=0;i<4;i++) await Promise.resolve(); }
        else {
          bot._stampDashboardHistoricalCandles = method(runner, '_stampDashboardHistoricalCandles', bot, ctx);
          await method(runner, 'fetchAndSendHistoricalCandles', bot, ctx)(timeframe, 2, 'TSLA');
        }
      } finally { Object.assign(console, originalConsole); }
      const row = { route, timeframe, mode, classifiedAsStock: stockAdapter.isStock('TSLA', { config: dataConfig }), sent, relayed, requests, logs };
      cases.push(row);
      if (!baseline) {
        assert.equal(row.classifiedAsStock, true); assert.equal(relayed.length, 0); assert.equal(sent.length, 1, `${route} ${timeframe} ${mode}`);
        const packet = sent[0]; assert.equal(packet.symbol, 'TSLA'); assert.equal(packet.timeframe, timeframe);
        if (mode === 'success') { assert.equal(packet.candles.length, 1); const c = packet.candles[0];
          assert.equal(c.time, Date.parse(nativeBar.t)/1000); assert.deepEqual([c.open,c.high,c.low,c.close,c.volume],[100,104,99,103,0]); assert.equal(packet.error, undefined); }
        else { assert.equal(packet.candles.length, 0); assert.ok(packet.error); }
        assert.equal(requests.length, mode === 'missing_credentials' ? 0 : 1);
        if (requests.length) assert.equal(requests[0].timeframe, dataConfig.timeframes[timeframe].alpaca);
      }
    }
  }
  for (const type of ['request_historical', 'timeframe_change']) {
    const relayed = [], botFetches = [];
    const ctx = vm.createContext({ ConfigLoader, console, data: { type, asset: 'BTC-USD', timeframe: '4h', limit: 2 },
      DASHBOARD_STOCK_DATA_CONFIG: resolveDashboardStockConfigFromRuntime(resolvedConfig.config).data,
      require: name => stockAdapter, ws: { clientType: 'dashboard' }, WebSocket: { OPEN: 1 },
      wss: { clients: new Set([{ readyState: 1, authenticated: true, clientType: 'bot', send: str => relayed.push(JSON.parse(str)) }]) },
      owner: { ctx: { fetchAndSendHistoricalCandles: (...args) => botFetches.push(args) } },
      msg: { type, asset: 'BTC-USD', timeframe: '4h', limit: 2 } });
    vm.runInContext(server.text(historyBlock), ctx);
    const handlers = socket.nodes.filter(n => n.type === 'IfStatement' && ["msg.type === 'timeframe_change'", "msg.type === 'request_historical'"].includes(socket.text(n.test)));
    vm.runInContext('(function(){' + handlers.map(n => socket.text(n)).join('\n') + '}).call(owner)', ctx);
    routeCases.push({ type, relayed, botFetches });
    if (!baseline) { assert.equal(relayed.length, type === 'request_historical' ? 1 : 0); assert.equal(botFetches.length, type === 'request_historical' ? 1 : 0); }
  }
  console.log('NATIVE_HISTORY_RECEIPT ' + JSON.stringify({ baseline, sourceHashes: hashes, cases, routeCases,
    seams: ['Actual stock data adapter, config resolver and market-scope functions', 'Actual server history branch and runner history methods; surrounding live process excluded',
      'Actual bot request handlers; synthetic WS connections, broker HTTP replies and isolated credentials'],
    limits: ['No real broker request, authentication/session lifecycle, PM2 restart or connected browser', 'No orders, broker state, real journals or banks accessed',
      'The generic unexpected-rejection catch is inspected, while actual HTTP/network/config failures execute through fetchStockCandles'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
