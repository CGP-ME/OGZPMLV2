#!/usr/bin/env node
/**
 * smoke-test.js - Isolated module observations for OGZ Prime
 *
 * Uses canonical configuration with synthetic paper inputs. Exercises module
 * loading, indicators, selected signals and an existing-position stop request.
 * Optional cached-graph inspection is reported separately. This is not proof
 * of live trading, complete strategy behavior or all bot-walk requirements.
 */

'use strict';

require('../test/helpers/require-isolation.cjs')();

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// This file runs only in the disposable helper snapshot. A file-backed fixture
// also survives this checker's deliberate ConfigLoader module-cache reloads.
process.env.PROFILE = 'paper';
fs.writeFileSync(path.join(projectRoot, '.env'), [
  'WEBSOCKET_AUTH_TOKEN=synthetic-smoke-token',
  'ALPACA_API_KEY=synthetic-smoke-alpaca-key',
  'ALPACA_API_SECRET=synthetic-smoke-alpaca-secret',
  'KRAKEN_API_KEY=synthetic-smoke-kraken-key',
  'KRAKEN_API_SECRET=synthetic-smoke-kraken-secret',
  ''
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('Smoke inputs: synthetic paper candles, positions and credentials; canonical configuration snapshot.');

// Track results
let passed = 0;
let failed = 0;
let warnings = 0;
let skipped = 0;
const failures = [];
const warningsList = [];

function test(name, fn) {
  try {
    const outcome = fn();
    if (outcome?.skipped) {
      skipped++;
      console.log(`SKIPPED ${name}: ${outcome.skipped}`);
      return;
    }
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

function warn(name, message) {
  warnings++;
  warningsList.push({ name, message });
  console.log(`WARNING ${name}: ${message}`);
}

console.log('OGZ Prime isolated module observations\n');

// ═══════════════════════════════════════════════════════════
// TEST DATA - Simulated candles for functional tests
// ═══════════════════════════════════════════════════════════
const candleCount = 300;
const baseTime = Date.UTC(2026, 10, 24) - candleCount * 15 * 60 * 1000;
const testCandles = [];
let price = 85000;

for (let i = 0; i < candleCount; i++) {
  const change = Math.sin(i / 7) * 100 + 4;
  price = Math.max(80000, Math.min(90000, price + change));
  const high = price + 100;
  const low = price - 100;
  const open = price - 10;
  const close = price + 10;
  testCandles.push({
    t: baseTime + (i * 15 * 60 * 1000),
    o: open,
    h: Math.max(open, close, high),
    l: Math.min(open, close, low),
    c: close,
    v: 100 + (i % 20) * 25,
    etime: baseTime + ((i + 1) * 15 * 60 * 1000),
    timeframe: '15m',
    symbol: 'BTC-USD'
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: DEPENDENCY CHECKS (Hidden Bug Detection)
// ═══════════════════════════════════════════════════════════
console.log('\n--- DEPENDENCY CHECKS ---\n');

test('All critical modules can be required', () => {
  const criticalModules = [
    'foundation/ConfigLoader',
    'core/StrategyOrchestrator',
    'core/OrderExecutor',
    'core/StateManager',
    'core/ExitContractManager',
    'core/indicators/IndicatorEngine',
    'core/VolumeProfile',
    'modules/EMASMACrossoverSignal',
    'modules/MADynamicSR',
    'modules/LiquiditySweepDetector',
    'modules/BreakAndRetest',
    'modules/MultiTimeframeAdapter',
  ];

  const missing = [];
  for (const mod of criticalModules) {
    try {
      require(path.join(projectRoot, mod));
    } catch (err) {
      missing.push(`${mod}: ${err.message}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing modules:\n  ${missing.join('\n  ')}`);
  }
});

test('Selected modules load in three require orders', () => {
  // This observes those load orders; it does not prove the graph is acyclic.
  const orders = [
    ['foundation/ConfigLoader', 'core/StrategyOrchestrator', 'core/OrderExecutor'],
    ['core/OrderExecutor', 'foundation/ConfigLoader', 'core/StrategyOrchestrator'],
    ['core/StateManager', 'core/ExitContractManager', 'foundation/ConfigLoader'],
  ];

  for (const order of orders) {
    // Clear require cache
    for (const mod of order) {
      const fullPath = require.resolve(path.join(projectRoot, mod));
      delete require.cache[fullPath];
    }
    // Require in order
    for (const mod of order) {
      require(path.join(projectRoot, mod));
    }
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════
console.log('\n--- CONFIGURATION VALIDATION ---\n');

test('Configured fee rates are finite and nonnegative', () => {
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const makerFee = ConfigLoader.get('fees.makerFee');
  const takerFee = ConfigLoader.get('fees.takerFee');
  const roundTrip = ConfigLoader.get('fees.totalRoundTrip');

  for (const [name, value] of Object.entries({ makerFee, takerFee, totalRoundTrip: roundTrip })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} invalid: ${value}`);
  }
});

test('Selected configured strategies expose their required keys', () => {
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));

  const configs = {
    'strategies.EMASMACrossover': ['decayBars', 'velocityWindowBars', 'elasticityMinAtr', 'baseConfidence'],
    'strategies.MADynamicSR': ['entryMaPeriod', 'srMaPeriod', 'slopeLookback'],
    'strategies.LiquiditySweep': ['sweepLookbackBars', 'atrPeriod', 'entryWindowMinutes'],
  };

  for (const [configPath, requiredKeys] of Object.entries(configs)) {
    const config = ConfigLoader.get(configPath);
    if (!config) throw new Error(`${configPath} missing`);

    for (const key of requiredKeys) {
      if (config[key] === undefined) {
        throw new Error(`${configPath}.${key} missing`);
      }
    }
  }
});

test('EMASMACrossover configured percent stop and target have valid signs', () => {
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const strategyName = 'EMASMACrossover';
  const stopLoss = ConfigLoader.get(`exitContracts.${strategyName}.stopLossPercent`);
  const takeProfit = ConfigLoader.get(`exitContracts.${strategyName}.takeProfitPercent`);

  if (!Number.isFinite(stopLoss) || stopLoss >= 0 || stopLoss < -100) {
    throw new Error(`${strategyName}.stopLossPercent invalid: ${stopLoss}`);
  }
  if (!Number.isFinite(takeProfit) || takeProfit <= 0) {
    throw new Error(`${strategyName}.takeProfitPercent invalid: ${takeProfit}`);
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION 3: INDICATOR ENGINE
// ═══════════════════════════════════════════════════════════
console.log('\n--- INDICATOR ENGINE ---\n');

test('IndicatorEngine produces finite RSI, EMA and positive ATR', () => {
  const IndicatorEngine = require(path.join(projectRoot, 'core/indicators/IndicatorEngine'));
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const engine = new IndicatorEngine({
    ...ConfigLoader.get('indicators.engine'),
    ...ConfigLoader.get('internals.indicators.engine'),
    symbol: 'BTC-USD', tf: '15m',
  });

  for (const candle of testCandles) {
    engine.updateCandle(candle);
  }

  const snap = engine.getSnapshot();
  if (!snap) throw new Error('getSnapshot() returned nothing');
  const indicators = snap.indicators;
  // RSI is a direct number
  if (!Number.isFinite(indicators.rsi)) throw new Error('RSI not calculated');
  if (indicators.rsi < 0 || indicators.rsi > 100) throw new Error(`RSI out of range: ${indicators.rsi}`);
  // EMA exists
  if (!Number.isFinite(indicators.ema20)) throw new Error('EMA not calculated');
  // ATR is a direct number
  if (!Number.isFinite(indicators.atr) || indicators.atr <= 0) throw new Error(`ATR invalid: ${indicators.atr}`);
});

// ═══════════════════════════════════════════════════════════
// SECTION 4: SIGNAL MODULES
// ═══════════════════════════════════════════════════════════
console.log('\n--- SIGNAL MODULES ---\n');

test('EMASMACrossoverSignal processes candles and returns structure', () => {
  const EMASMACrossoverSignal = require(path.join(projectRoot, 'modules/EMASMACrossoverSignal'));
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));

  const emaConfig = {
    ...ConfigLoader.get('strategies.EMASMACrossover'),
    ...ConfigLoader.get('strategyBehavior.emaCrossover'),
  };
  const signal = new EMASMACrossoverSignal(emaConfig);

  let lastResult = null;
  for (const [index, candle] of testCandles.entries()) {
    lastResult = signal.update(candle, testCandles.slice(0, index + 1));
  }

  if (!lastResult) throw new Error('update() returned nothing');
  if (typeof lastResult.confidence !== 'number') throw new Error('No confidence in result');
  if (typeof lastResult.direction !== 'string') throw new Error('No direction in result');
});

test('MADynamicSR processes candles and returns a result', () => {
  const MADynamicSR = require(path.join(projectRoot, 'modules/MADynamicSR'));
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));

  const configProvider = () => ConfigLoader.get('strategies.MADynamicSR');
  const signal = new MADynamicSR(configProvider(), configProvider);

  let lastResult = null;
  for (const [index, candle] of testCandles.entries()) {
    lastResult = signal.update(candle, testCandles.slice(0, index + 1));
  }

  if (!lastResult) throw new Error('update() returned nothing');
});

test('LiquiditySweepDetector processes candles and returns signal availability', () => {
  const LiquiditySweepDetector = require(path.join(projectRoot, 'modules/LiquiditySweepDetector'));
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));

  const detector = new LiquiditySweepDetector(
    ConfigLoader.get('strategies.LiquiditySweep'),
    null,
    testCandles[1].t - testCandles[0].t
  );

  let lastResult = null;
  for (const candle of testCandles) {
    lastResult = detector.feedCandle(candle);
  }

  if (!lastResult) throw new Error('feedCandle() returned nothing');
  if (typeof lastResult.hasSignal !== 'boolean') throw new Error('No hasSignal in result');
});

// ═══════════════════════════════════════════════════════════
// SECTION 5: ORCHESTRATOR
// ═══════════════════════════════════════════════════════════
console.log('\n--- ORCHESTRATOR ---\n');

test('StrategyOrchestrator evaluates a synthetic 15m history with its captured MTF input', () => {
  const { StrategyOrchestrator } = require(path.join(projectRoot, 'core/StrategyOrchestrator'));
  const IndicatorEngine = require(path.join(projectRoot, 'core/indicators/IndicatorEngine'));

  const orchestrator = new StrategyOrchestrator({
    mtfBaseTimeframe: '15m',
  });

  if (!orchestrator.strategies || orchestrator.strategies.length === 0) {
    throw new Error('No strategies loaded');
  }

  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const engine = new IndicatorEngine({
    ...ConfigLoader.get('indicators.engine'),
    ...ConfigLoader.get('internals.indicators.engine'),
    symbol: 'BTC-USD', tf: '15m',
  });
  for (const candle of testCandles) {
    engine.updateCandle(candle);
    orchestrator.ingestMarketCandle('BTC-USD', candle);
  }

  const indicators = engine.getSnapshot().indicators;

  // orchestrator.evaluate(indicators, patterns, regime, priceHistory, extras)
  const result = orchestrator.evaluate(indicators, [], null, testCandles, {
    price: testCandles[testCandles.length - 1].c,
    volatility: 1,
    symbol: 'BTC-USD',
    timeframe: '15m',
    mtf: orchestrator.captureDecisionMtf('BTC-USD', testCandles.at(-1)),
  });

  if (!result) throw new Error('evaluate() returned nothing');
  if (!Number.isFinite(result.confidence)) throw new Error('No finite confidence in result');
  if (typeof result.direction !== 'string') throw new Error('No direction in result');
});

// ═══════════════════════════════════════════════════════════
// SECTION 6: EXIT CONTRACT
// ═══════════════════════════════════════════════════════════
console.log('\n--- EXIT CONTRACT ---\n');

test('ExitContractManager requests a stop for a fully specified long position', () => {
  const { getInstance } = require(path.join(projectRoot, 'core/ExitContractManager'));
  const manager = getInstance();

  if (!manager) throw new Error('getInstance() returned nothing');
  if (typeof manager.checkExitConditions !== 'function') throw new Error('checkExitConditions not a function');

  const lastCandle = testCandles[testCandles.length - 1];
  const exitContract = manager.getDefaultContract('EMASMACrossover', { timeframe: '15m' });
  const mockTrade = {
    id: 'synthetic-smoke-stop', symbol: 'BTC-USD', direction: 'long',
    entryStrategy: 'EMASMACrossover', entryPrice: 85000, size: 0.01,
    entryTime: lastCandle.etime - 30 * 60 * 1000,
    maxProfitPercent: 0, exitContract,
  };
  const stopPrice = mockTrade.entryPrice * (1 + exitContract.stopLossPercent / 100) - 1;
  const result = manager.checkExitConditions(mockTrade, stopPrice, {
    candle: lastCandle, currentTime: lastCandle.etime,
    indicators: { rsi: 55, atr: 500 }, priceHistory: testCandles,
  });
  if (result?.shouldExit !== true || result.exitReason !== 'stop_loss') {
    throw new Error(`Expected strategy stop request, got ${JSON.stringify(result)}`);
  }
  console.log(`Observed synthetic long exit request: ${result.exitReason}`);
});

// ═══════════════════════════════════════════════════════════
// SECTION 7: BOMBARDIER - HIDDEN BUG DETECTION
// ═══════════════════════════════════════════════════════════
console.log('\n--- BOMBARDIER ANALYSIS ---\n');

test('Optional Bombardier cached-graph diagnostic', () => {
  let Bombardier;
  try {
    const bombardierModule = require(path.join(projectRoot, 'ogz-meta/bombardier'));
    Bombardier = bombardierModule.Bombardier;
  } catch (err) {
    // Bombardier may not work without tree-sitter installed
    return { skipped: `Bombardier could not load: ${err.message}` };
  }

  const bombardier = new Bombardier();

  // Inspect an existing cache only; do not turn a smoke run into a graph build.
  try {
    if (!bombardier.loadCache() || bombardier.callGraph.size === 0) {
      return { skipped: 'No current call-graph cache in isolated snapshot; orphan detection not performed' };
    }
  } catch (err) {
    return { skipped: `Call-graph cache unavailable: ${err.message}` };
  }

  // Check for orphans in critical paths
  const criticalFunctions = [
    'evaluateSignals',
    'update',
    'feedCandle',
    'evaluatePosition',
  ];

  for (const funcName of criticalFunctions) {
    const result = bombardier.getBlastRadius(funcName);
    if (!result.found) {
      warn('Bombardier', `Function "${funcName}" not found in call graph`);
    }
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION 8: INTEGRATION SANITY
// ═══════════════════════════════════════════════════════════
console.log('\n--- INTEGRATION SANITY ---\n');

test('Strategy evaluation and an explicitly owned position produce separate outcomes', () => {
  const { StrategyOrchestrator } = require(path.join(projectRoot, 'core/StrategyOrchestrator'));
  const { getInstance } = require(path.join(projectRoot, 'core/ExitContractManager'));
  const IndicatorEngine = require(path.join(projectRoot, 'core/indicators/IndicatorEngine'));

  const orchestrator = new StrategyOrchestrator({
    mtfBaseTimeframe: '15m',
  });

  const exitManager = getInstance();
  const ConfigLoader = require(path.join(projectRoot, 'foundation/ConfigLoader'));
  const engine = new IndicatorEngine({
    ...ConfigLoader.get('indicators.engine'),
    ...ConfigLoader.get('internals.indicators.engine'),
    symbol: 'BTC-USD', tf: '15m',
  });

  for (const candle of testCandles) {
    engine.updateCandle(candle);
    orchestrator.ingestMarketCandle('BTC-USD', candle);
  }

  const indicators = engine.getSnapshot().indicators;
  const lastCandle = testCandles[testCandles.length - 1];

  // Step 1: Get signal using orchestrator.evaluate()
  const signalResult = orchestrator.evaluate(indicators, [], null, testCandles, {
    price: lastCandle.c,
    volatility: 1,
    symbol: 'BTC-USD',
    timeframe: '15m',
    mtf: orchestrator.captureDecisionMtf('BTC-USD', lastCandle),
  });

  // This existing-position exercise is independent of whether the candles
  // produce an entry. Do not invent a winning strategy when no entry exists.
  const exitContract = exitManager.getDefaultContract('EMASMACrossover', { timeframe: '15m' });
  const mockTrade = {
    id: 'synthetic-smoke-position', symbol: 'BTC-USD', direction: 'long',
    entryPrice: lastCandle.c, size: 0.01,
    entryTime: lastCandle.etime - 15 * 60 * 1000,
    maxProfitPercent: 0, entryStrategy: 'EMASMACrossover', exitContract,
  };
  const exitPrice = mockTrade.entryPrice * (1 + exitContract.stopLossPercent / 100) - 1;
  const exitResult = exitManager.checkExitConditions(mockTrade, exitPrice, {
    candle: lastCandle, currentTime: lastCandle.etime, indicators, priceHistory: testCandles,
  });
  if (!signalResult || !Number.isFinite(signalResult.confidence)
      || typeof signalResult.direction !== 'string') throw new Error('Invalid strategy observation');
  if (exitResult?.shouldExit !== true || exitResult.exitReason !== 'stop_loss') {
    throw new Error(`Invalid existing-position stop observation: ${JSON.stringify(exitResult)}`);
  }
  console.log(`Synthetic strategy observation: action=${signalResult.action} direction=${signalResult.direction}; independent existing-position exit=${exitResult.exitReason}`);
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${warnings} warnings`);

if (warningsList.length > 0) {
  console.log('\nWarnings:');
  warningsList.forEach(w => console.log(`  WARNING ${w.name}: ${w.message}`));
}

if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  FAIL ${f.name}: ${f.error}`));
  process.exit(1);
}

console.log('\nRequired isolated smoke observations completed. This does not verify live orders, complete strategy behavior or the bot walk.');
process.exit(0);
