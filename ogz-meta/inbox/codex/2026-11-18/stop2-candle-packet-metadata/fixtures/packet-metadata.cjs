'use strict';

// Synthetic intake/transport proof, using the real processor and canonical store.
// Account state, transport and unrelated orchestration are fixture surroundings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const baseline = process.argv.includes('--baseline');
const overrideArg = process.argv.find(arg => arg.startsWith('--source-overrides='));
if (overrideArg) {
  for (const [filename, source] of Object.entries(JSON.parse(fs.readFileSync(overrideArg.split('=')[1])))) {
    fs.writeFileSync(filename, source);
  }
}
const credentials = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(credentials, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = credentials;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const CandleProcessor = require(path.join(process.cwd(), 'core/CandleProcessor'));
const { CandleStore } = require(path.join(process.cwd(), 'core/CandleStore'));
const { SymbolTradingContext } = require(path.join(process.cwd(), 'core/SymbolTradingContext'));
const stateManager = require(path.join(process.cwd(), 'core/StateManager')).getInstance();
stateManager.set('initialBalance', 10000); // Explicit synthetic account, not a production default.
stateManager.set('activeTrades', new Map());
stateManager.set('realizedPnL', 0);
stateManager.set('position', 0);
stateManager.set('closedTrades', []);
const scope = { brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper' };
const engineConfig = { ...ConfigLoader.get('indicators.engine'), ...ConfigLoader.get('internals.indicators.engine') };
const receipts = [];
const end = Math.floor(Date.now() / 60000) * 60000;

for (const symbol of ['NVDA', 'TSLA']) {
  const timeframe = '1m';
  const store = new CandleStore({ maxCandles: 20 });
  const frame = new SymbolTradingContext(symbol, store, {
    timeframe, indicatorConfig: { ...engineConfig, tf: timeframe },
    emaCrossoverConfigProvider: () => ({ ...ConfigLoader.get('strategies.EMASMACrossover'), ...ConfigLoader.get('strategyBehavior.emaCrossover') }),
    maDynamicSRConfig: ConfigLoader.get('strategies.MADynamicSR'),
    maDynamicSRConfigProvider: () => ConfigLoader.get('strategies.MADynamicSR'),
    volumeProfileConfigProvider: () => ConfigLoader.get('strategies.VolumeProfile'),
  });
  const messages = [], ingested = [], edgeEvents = [];
  const ctx = {
    tradingPair: symbol, candleTimeframe: timeframe,
    config: { dataFeed: ConfigLoader.get('dataFeed'), assetClass: 'stocks', brokerId: 'alpaca' },
    _candleStore: store, priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {},
    indicatorEngine: frame.indicatorEngine,
    getSymbolTimeframeContext(s, tf) { assert.equal(s, symbol); assert.equal(tf, timeframe); return frame; },
    // History/selected-timeframe ownership is a separate open Stop 2 defect.
    getCandlesForTimeframe(tf) { return store.getCandles(symbol, tf); },
    strategyOrchestrator: { ingestMarketCandle(s, candle) { ingested.push({ symbol: s, candle: structuredClone(candle) }); } },
    dashboardWsConnected: true,
    dashboardWs: { readyState: 1, send(serialized) { messages.push(JSON.parse(serialized)); } },
    broadcastEdgeAnalytics(price, volume, candle) { edgeEvents.push({ price, volume, candle }); },
  };
  const processor = new CandleProcessor(ctx);
  const steps = [
    { name: 'first', t: end - 60000, close: 100, volume: 10, newest: 0 },
    { name: 'newer', t: end, close: 108, volume: 20, newest: 1 },
    { name: 'older-correction', t: end - 60000, close: 105, volume: 12, newest: 1 },
    { name: 'older-zero-volume-correction', t: end - 60000, close: 106, volume: 0, newest: 1 },
    { name: 'latest-update', t: end, close: 109, volume: 21, newest: 4 },
  ];
  for (const step of steps) {
    const beforeMessages = messages.length;
    const result = processor.handleMarketData({ ...scope, symbol, timeframe,
      data: [step.t, step.t + 60000, step.close - 1, step.close + 2, step.close - 2, step.close, step.close, step.volume, 1] });
    const emitted = messages.slice(beforeMessages);
    assert.equal(emitted.filter(message => message.type === 'error_event').length, 0, 'broadcast must not fail silently');
    const prices = emitted.filter(message => message.type === 'price');
    assert.equal(prices.length, 1, 'capture the actual serialized outgoing message');
    const packet = prices[0];
    const newest = steps[step.newest];
    const snapshot = { timestamp: frame.marketData.timestamp, price: frame.marketData.price, volume: frame.marketData.volume };
    assert.deepEqual(snapshot, { timestamp: newest.t, price: newest.close, volume: newest.volume });
    assert.equal(ctx.marketData, frame.marketData);
    assert.equal(result.acceptedAsNew, step.name === 'first' || step.name === 'newer');
    assert.equal(store.getCandles(symbol, timeframe).length, step.name === 'first' ? 1 : 2);
    assert.equal(store.getCandleAt(symbol, timeframe, step.t).v, step.volume);
    const identities = [packet, packet.data, packet.candle, packet.data.candle].map(value => ({
      timestamp: value.timestamp, close: value.close, volume: value.volume,
    }));
    const expected = { timestamp: step.t, close: step.close, volume: step.volume };
    const coherent = identities.every(value => JSON.stringify(value) === JSON.stringify(expected));
    if (!baseline) assert.ok(coherent, `${symbol} ${step.name}: correction metadata must follow its bar`);
    receipts.push({ symbol, timeframe, step: step.name, expected, identities, snapshot, coherent });
  }
  assert.equal(ingested.length, steps.length);
  assert.equal(edgeEvents.length, steps.length);
  processor.cleanup();
}
if (baseline) {
  assert.equal(receipts.filter(row => !row.coherent).length, 4, 'baseline must reproduce both older correction mismatches for both symbols');
}
const sources = ['core/CandleProcessor.js', 'core/CandleStore.js', 'core/SymbolTradingContext.js', 'foundation/ohlc-normalize.js', 'foundation/ConfigLoader.js', 'core/StateManager.js', 'config/settings.json', 'config/internals.json'];
console.log('PACKET_METADATA_RECEIPT=' + JSON.stringify({
  baseline, checks: receipts, sourceSha256: Object.fromEntries(sources.map(filename => [filename, crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')])),
  scope: 'Isolated real processor/store and serialized outgoing message; synthetic intake/account/transport; no live broker, browser or PM2 activation proof.',
}));
