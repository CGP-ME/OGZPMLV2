#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sourceRoot = path.resolve(process.argv[2]);
const baselineMode = process.argv.includes('--baseline');
if (!fs.existsSync(path.join(sourceRoot, 'core/CandleProcessor.js'))) throw new Error('source root required');
process.chdir(sourceRoot);
Object.assign(process.env, {
  PROFILE: 'paper', EXECUTION_MODE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token',
  ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret',
  KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret',
  DOTENV_CONFIG_PATH: path.join(sourceRoot, 'fixture-no-dotenv'),
});
const ConfigLoader = require(path.join(sourceRoot, 'foundation/ConfigLoader'));
const loaded = ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
const CandleProcessor = require(path.join(sourceRoot, 'core/CandleProcessor'));
const { CandleStore } = require(path.join(sourceRoot, 'core/CandleStore'));
const { SymbolTradingContext } = require(path.join(sourceRoot, 'core/SymbolTradingContext'));
const IndicatorEngine = require(path.join(sourceRoot, 'core/indicators/IndicatorEngine'));
const { StrategyOrchestrator } = require(path.join(sourceRoot, 'core/StrategyOrchestrator'));

const canonicalMaxCandles = ConfigLoader.get('internals.candleStore.maxCandles');
assert.strictEqual(canonicalMaxCandles, 250, 'fixture measures the configured canonical CandleStore bound');
const store = new CandleStore({ maxCandles: canonicalMaxCandles });
const engineConfig = symbol => ({ ...ConfigLoader.get('indicators.engine'), ...ConfigLoader.get('internals.indicators.engine'), symbol });
const makeContext = (symbol, timeframe) => new SymbolTradingContext(symbol, store, {
  timeframe, indicatorConfig: { ...engineConfig(symbol), tf: timeframe },
  emaCrossoverConfigProvider: () => ({ ...ConfigLoader.get('strategies.EMASMACrossover'), ...ConfigLoader.get('strategyBehavior.emaCrossover') }),
  maDynamicSRConfig: ConfigLoader.get('strategies.MADynamicSR'), maDynamicSRConfigProvider: () => ConfigLoader.get('strategies.MADynamicSR'),
  volumeProfileConfigProvider: () => ConfigLoader.get('strategies.VolumeProfile'), fibonacciConfig: ConfigLoader.get('fibonacci'),
});
const contexts = new Map([
  ['TSLA', new Map([['15m', makeContext('TSLA', '15m')]])],
  ['SPY', new Map([['1m', makeContext('SPY', '1m')]])],
]);
const root = {
  config: { ...loaded.config, enableBacktestMode: true, assetClass: 'stocks', brokerId: 'alpaca' },
  tradingPair: 'TSLA', candleTimeframe: '15m', priceHistory: [], indicatorEngine: new IndicatorEngine(engineConfig('TSLA')),
  _candleStore: store, strategyOrchestrator: new StrategyOrchestrator({ mtfBaseTimeframe: '1m' }), candleSaveCounter: 0,
  saveCandleHistory: () => { throw new Error('fixture must not persist'); },
  getSymbolTimeframeContext: (symbol, timeframe) => contexts.get(symbol)?.get(timeframe),
};
const processor = new CandleProcessor(root);
const interval = { '1m': 60_000, '15m': 900_000 };
function build(symbol, timeframe, index, base) {
  const c = base + Math.sin(index / 4) * 3 + index * 0.15;
  const t = 1_700_000_000_000 + index * interval[timeframe];
  return { symbol, timeframe, t, etime: t + interval[timeframe], o: c - .2, h: c + .7, l: c - .8, c, v: 1000 + index,
    brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper' };
}
function expectedIndicators(symbol, history) { const engine = new IndicatorEngine(engineConfig(symbol)); engine.computeBatch(history); return engine.getSnapshot().indicators; }
function revisionCase(symbol, timeframe, base) {
  const originalLog = console.log; console.log = () => {};
  try { for (let i = 0; i < 300; i += 1) assert.equal(processor.processNewCandle(build(symbol, timeframe, i, base), { persist: false }), true); }
  finally { console.log = originalLog; }
  const frameCtx = root.getSymbolTimeframeContext(symbol, timeframe);
  const revision = build(symbol, timeframe, 299, base);
  revision.o += 2; revision.h += 6; revision.l += 1; revision.c += 5; revision.v += 500;
  assert.equal(processor.processNewCandle(revision, { persist: false }), false, `${symbol}/${timeframe} revision takes UPDATE`);
  assert.equal(frameCtx.priceHistory.length, canonicalMaxCandles, `${symbol}/${timeframe} canonical history remains deduplicated`);
  if (baselineMode) {
    assert.equal(frameCtx.indicatorEngine.candles.length, 301, `${symbol}/${timeframe} baseline appends a revision duplicate`);
  } else {
    assert.equal(frameCtx.indicatorEngine.candles.length, 300, `${symbol}/${timeframe} indicator state has no append duplicate`);
    assert.deepEqual(frameCtx.indicatorEngine.getSnapshot().indicators, expectedIndicators(symbol, [...Array.from({ length: 299 }, (_, index) => build(symbol, timeframe, index, base)), revision]), `${symbol}/${timeframe} indicator equals independent corrected history rebuild`);
  }
  return frameCtx;
}
const primary = revisionCase('TSLA', '15m', 100);
assert.equal(root.priceHistory.length, canonicalMaxCandles, 'root mirror remains primary/base history');
if (baselineMode) {
  assert.equal(root.indicatorEngine.candles.length, 301, 'baseline root mirror appends a revision duplicate');
} else {
  assert.equal(root.indicatorEngine.candles.length, 300, 'root mirror indicator state has no append duplicate');
  assert.deepEqual(root.indicatorEngine.getSnapshot().indicators, expectedIndicators('TSLA', [...Array.from({ length: 299 }, (_, index) => build('TSLA', '15m', index, 100)), root.priceHistory.at(-1)]), 'root mirror indicator equals corrected primary history rebuild');
}
const nonPrimary = revisionCase('SPY', '1m', 500);
assert.equal(root.priceHistory.length, canonicalMaxCandles, 'non-primary revision does not alter root mirror');
assert.equal(root.priceHistory.at(-1).symbol, 'TSLA', 'root mirror stays primary symbol');
assert.equal(primary.priceHistory.at(-1).symbol, 'TSLA'); assert.equal(nonPrimary.priceHistory.at(-1).symbol, 'SPY');

process.stdout.write('PASS actual CandleProcessor latest revision: 300 bars; canonical store250; root and two symbol/frame contexts; full-history indicator oracle.\n');
