#!/usr/bin/env node
'use strict';

/*
 * Isolated candidate proof. It imports CandleProcessor, CandleStore,
 * SymbolTradingContext, IndicatorEngine, and StrategyOrchestrator from an
 * exported source tree. It constructs no broker or network client.
 *
 * The candidate runner derives StrategyOrchestrator.mtfBaseTimeframe from the
 * shortest configured evaluation frame, so all configured delivery frames are
 * valid MTF inputs. The fixture also calls actual TradingLoop._analyze and
 * _gatherData through actual StrategyOrchestrator.evaluate for every hydrated
 * symbol/frame. Pattern presentation is empty and dashboard frames are captured
 * in memory; a fixture-only risk deny boundary plus executeTrade throw prevents
 * evaluation from becoming an order attempt.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', 'runs', 'candle-context-draftsource'));
if (!fs.existsSync(path.join(sourceRoot, 'core', 'CandleProcessor.js'))) {
  throw new Error(`source root missing CandleProcessor: ${sourceRoot}`);
}
process.chdir(sourceRoot);
Object.assign(process.env, {
  PROFILE: 'paper',
  EXECUTION_MODE: 'paper',
  ALPACA_API_KEY: 'fixture-alpaca-key',
  ALPACA_SECRET_KEY: 'fixture-alpaca-secret',
  ALPACA_API_SECRET: 'fixture-alpaca-secret',
  KRAKEN_API_KEY: 'fixture-kraken-key',
  KRAKEN_PRIVATE_KEY: 'fixture-kraken-private',
  KRAKEN_API_SECRET: 'fixture-kraken-private',
  WEBSOCKET_AUTH_TOKEN: 'fixture-websocket-token',
  DOTENV_CONFIG_PATH: path.join(sourceRoot, 'fixture-no-dotenv'),
});

const ConfigLoader = require(path.join(sourceRoot, 'foundation', 'ConfigLoader'));
const loadedConfig = ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
const CandleProcessor = require(path.join(sourceRoot, 'core', 'CandleProcessor'));
const { CandleStore } = require(path.join(sourceRoot, 'core', 'CandleStore'));
const { SymbolTradingContext } = require(path.join(sourceRoot, 'core', 'SymbolTradingContext'));
const IndicatorEngine = require(path.join(sourceRoot, 'core', 'indicators', 'IndicatorEngine'));
const { StrategyOrchestrator } = require(path.join(sourceRoot, 'core', 'StrategyOrchestrator'));
const TradingLoop = require(path.join(sourceRoot, 'core', 'TradingLoop'));

const frames = ConfigLoader.get('orchestrator.mtfTimeframes');
const runnerSource = fs.readFileSync(path.join(sourceRoot, 'run-empire-v2.js'), 'utf8');
assert.match(runnerSource, /mtfBaseTimeframe:\s*\[\.\.\.this\.evaluationTimeframes\]\.sort/, 'candidate runner derives MTF base from configured frames');
assert.match(runnerSource, /getSymbolTimeframeContext\(symbol, timeframe\)/, 'candidate runner exposes pair-context lookup consumed by CandleProcessor');
assert.deepStrictEqual(frames, ['1m', '5m', '15m', '1h', '4h'], 'fixture requires configured five-frame set');
const primary = 'TSLA';
const base = '15m';
const symbols = ['TSLA', 'SPY'];
const store = new CandleStore({ maxCandles: 500 });
const frameMsForBase = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
const mtfBaseTimeframe = frames.slice().sort((left, right) => frameMsForBase[left] - frameMsForBase[right])[0];
const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe });
const rootIndicator = new IndicatorEngine({
  ...ConfigLoader.get('indicators.engine'),
  ...ConfigLoader.get('internals.indicators.engine'),
  symbol: primary,
});
const contexts = new Map();
for (const symbol of symbols) {
  const byFrame = new Map();
  for (const timeframe of new Set([base, ...frames])) {
    byFrame.set(timeframe, new SymbolTradingContext(symbol, store, {
      timeframe,
      indicatorConfig: {
        ...ConfigLoader.get('indicators.engine'),
        ...ConfigLoader.get('internals.indicators.engine'),
        tf: timeframe,
      },
      emaCrossoverConfigProvider: () => ({
        ...ConfigLoader.get('strategies.EMASMACrossover'),
        ...ConfigLoader.get('strategyBehavior.emaCrossover'),
      }),
      maDynamicSRConfig: ConfigLoader.get('strategies.MADynamicSR'),
      maDynamicSRConfigProvider: () => ConfigLoader.get('strategies.MADynamicSR'),
      volumeProfileConfigProvider: () => ConfigLoader.get('strategies.VolumeProfile'),
      fibonacciConfig: ConfigLoader.get('fibonacci'),
    }));
  }
  contexts.set(symbol, byFrame);
}

const root = {
  config: { ...loadedConfig.config, enableBacktestMode: true, assetClass: 'stocks', brokerId: 'alpaca' },
  tradingPair: primary,
  candleTimeframe: base,
  priceHistory: [],
  indicatorEngine: rootIndicator,
  _candleStore: store,
  strategyOrchestrator: orchestrator,
  candleSaveCounter: 0,
  saveCandleHistory() { throw new Error('fixture must not persist candle history'); },
  getSymbolTimeframeContext(symbol, timeframe) {
    return contexts.get(symbol)?.get(timeframe);
  },
};
const processor = new CandleProcessor(root);
const ms = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
const origin = 1_700_000_000_000;
function candle(symbol, timeframe, index, basePrice) {
  const t = origin + index * ms[timeframe];
  const c = basePrice + index * 0.2;
  return {
    symbol, timeframe, t, etime: t + ms[timeframe], o: c - 0.1, h: c + 0.3,
    l: c - 0.4, c, v: 1000 + index,
    brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture',
    assetClass: 'stocks', executionMode: 'paper',
  };
}

const originalLog = console.log;
console.log = () => {};
try {
  for (const [symbol, basePrice] of [['TSLA', 100], ['SPY', 500]]) {
    for (const timeframe of frames) {
      for (let index = 0; index < 60; index += 1) {
        assert.strictEqual(processor.processNewCandle(candle(symbol, timeframe, index, basePrice), { persist: false }), true);
      }
    }
  }
} finally {
  console.log = originalLog;
}

for (const [symbol, basePrice] of [['TSLA', 100], ['SPY', 500]]) {
  for (const timeframe of frames) {
    const frameCtx = root.getSymbolTimeframeContext(symbol, timeframe);
    assert.strictEqual(frameCtx.priceHistory.length, 60, `${symbol}/${timeframe} history`);
    assert.strictEqual(store.getCandleCount(symbol, timeframe), 60, `${symbol}/${timeframe} candle store`);
    assert.strictEqual(frameCtx.indicatorEngine.candles.length, 60, `${symbol}/${timeframe} indicator ingestion`);
    assert.strictEqual(frameCtx.priceHistory.at(-1).c, basePrice + 59 * 0.2, `${symbol}/${timeframe} latest close`);
  }
  const adapter = orchestrator._getMtfConfluenceAdapter(symbol);
  assert.deepStrictEqual(adapter.config.activeTimeframes, frames, `${symbol} MTF configured frames`);
  assert.strictEqual(adapter.readyTimeframes.size, 5, `${symbol} MTF ready frames`);
  for (const timeframe of frames) assert.strictEqual(adapter.getCandles(timeframe).length, 60, `${symbol}/${timeframe} MTF ingress`);
}
assert.notStrictEqual(root.getSymbolTimeframeContext('TSLA', '1m'), root.getSymbolTimeframeContext('TSLA', '5m'));
assert.notStrictEqual(root.getSymbolTimeframeContext('TSLA', '15m').indicatorEngine, root.getSymbolTimeframeContext('SPY', '15m').indicatorEngine);
assert.strictEqual(root.priceHistory.length, 60, 'root mirror contains primary/base only');
assert.strictEqual(root.priceHistory.at(-1).symbol, 'TSLA');
assert.strictEqual(root.priceHistory.at(-1).timeframe, '15m');
assert.strictEqual(rootIndicator.candles.length, 60, 'root indicator contains primary/base only');

const revised = candle('TSLA', '1m', 59, 101);
revised.c += 7; revised.h += 7; revised.l += 7; revised.o += 7;
assert.strictEqual(processor.processNewCandle(revised, { persist: false }), false, 'same etime is an update');
const tslaMtf = orchestrator._getMtfConfluenceAdapter('TSLA');
assert.strictEqual(tslaMtf.getCandles('1m').length, 60, 'candidate MTF upsert keeps a revised bar bounded');
assert.strictEqual(tslaMtf.getCandles('1m').at(-1).c, revised.c, 'candidate MTF stores revised bar');

async function verifyActualTradingLoopEvaluation() {
  const dashboardFrames = [];
  const evaluationsBefore = orchestrator.evalCount;
  const loopCtx = {
    ...root,
    backtestFast: true,
    marketData: null,
    regimeDetection: loadedConfig.config.regimeDetection,
    patternChecker: { analyzePatterns: () => [], memory: null },
    broadcastPatternAnalysis: () => {},
    dashboardWs: { readyState: 1, send: serialized => dashboardFrames.push(JSON.parse(serialized)) },
    runner: {
      isSessionRoutingActive: () => false,
      getCandleScopeEnvelope: ({ timeframe }) => ({
        brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture',
        assetClass: 'stocks', executionMode: 'paper', timeframe,
      }),
    },
    // A fixture-only external-risk boundary prevents an accidental strategy
    // signal from becoming an execution attempt. _analyze, _gatherData, and
    // StrategyOrchestrator.evaluate remain the actual candidate implementations.
    riskManager: { isTradingAllowed: () => ({ allowed: false, reason: 'fixture_execution_disabled', riskGates: [] }) },
    executeTrade: () => { throw new Error('fixture must not execute orders'); },
  };
  const loop = new TradingLoop(loopCtx);
  const originalLogForAnalysis = console.log;
  console.log = () => {};
  try {
    for (const symbol of symbols) {
      for (const timeframe of frames) {
        const symCtx = loopCtx.getSymbolTimeframeContext(symbol, timeframe);
        const latest = symCtx.priceHistory.at(-1);
        symCtx.marketData = {
          symbol, price: latest.c, volume: latest.v, timestamp: latest.etime,
          eventTimeMs: latest.etime, receivedAtMs: latest.etime, priceSource: 'fixture_candle',
        };
        await loop._analyze(symbol, `fixture-${symbol}-${timeframe}`, timeframe);
      }
    }
  } finally {
    console.log = originalLogForAnalysis;
  }
  assert.strictEqual(orchestrator.evalCount - evaluationsBefore, symbols.length * frames.length, 'actual orchestrator evaluated every hydrated symbol/frame');
  assert.strictEqual(dashboardFrames.filter(frame => frame.type === 'signal_analysis').length, symbols.length * frames.length, 'actual TradingLoop emitted one analysis frame per symbol/frame');
  for (const frame of dashboardFrames.filter(frame => frame.type === 'signal_analysis')) {
    assert(frames.includes(frame.timeframe), `dashboard timeframe ${frame.timeframe}`);
    assert(symbols.includes(frame.symbol), `dashboard symbol ${frame.symbol}`);
  }
  return dashboardFrames.length;
}

verifyActualTradingLoopEvaluation().then((dashboardFrameCount) => {
  const receipt = {
    sourceRoot,
    frames,
    symbols,
    candlesPerSymbolFrame: 60,
    rootMirror: { symbol: primary, timeframe: base, count: root.priceHistory.length },
    mtfBaseTimeframeForIngressProof: mtfBaseTimeframe,
    tradingLoopActualEvaluations: symbols.length * frames.length,
    dashboardFrameCount,
    network: 'not constructed',
    persistence: 'persist:false; source cwd isolated',
  };
  process.stdout.write(`PASS candle-context-mtf ${JSON.stringify(receipt)}\n`);
}).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
