'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');

const root = process.cwd();
const fixtureRoot = path.join(root, 'ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/fixtures');
const readFixture = (tree, file) => require('node:fs').readFileSync(path.join(fixtureRoot, tree, file), 'utf8');
const head = file => readFixture('source-baseline', file);
const candidate = file => readFixture('source-candidate', file);
const baseline = file => head(file);

function compile(file, source, stubs = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(root);
  const original = mod.require.bind(mod);
  mod.require = request => Object.hasOwn(stubs, request) ? stubs[request] : original(request);
  mod._compile(source, filename);
  return mod.exports;
}

const config = {
  featureExtraction: {
    trendBullishValue: 1, trendBearishValue: 0, neutralValue: 0.5,
    volumeMinimumCandles: 2, volumeLookback: 5, volumeRatioCeiling: 2,
    changeMultiplier: 10, macdDeltaRange: 500, longDirectionValue: 1,
    shortDirectionValue: 0, signatureQuantizationSteps: 10,
  },
  patternRecognition: { useOptimizedIndicators: true, flatCandleWickRatio: 0.5, optimizedVolatilityCeiling: 0.1 },
  internals: { patternRecognition: { signatureQuantizationSteps: 10 } },
};
const configStub = { get: key => key.split('.').reduce((v, k) => v?.[k], config) };
const traceStub = { createTraceId: () => 'fixture-trace', emitTrace: () => {} };
const validatorStub = { ContractValidator: class { } };
const candleStub = { c: x => x.close, o: x => x.open, h: x => x.high, l: x => x.low, v: x => x.volume };
const extractorStubs = {
  './CandleHelper': candleStub, './ContractValidator': validatorStub, './TraceSpine': traceStub,
  '../foundation/ConfigLoader': configStub,
};
const featureReplacements = [
  ['const bbPosition = indicators.bb?.percentB ?? indicators.bbPercentB ?? null;', 'const bbPosition = indicators.bb?.percentB\n      ?? (indicators.bbPercentB == null ? null : indicators.bbPercentB / 100);'],
  ["if (lower === 'uptrend' || lower === 'bullish')", "if (lower === 'up' || lower === 'uptrend' || lower === 'bullish')"],
  ["if (lower === 'downtrend' || lower === 'bearish')", "if (lower === 'down' || lower === 'downtrend' || lower === 'bearish')"],
  ['if (!macd) return null;', 'if (macd == null) return null;'],
];
const oldFeature = compile('core/FeatureExtractor.js', baseline('core/FeatureExtractor.js'), extractorStubs);
const newFeature = compile('core/FeatureExtractor.js', candidate('core/FeatureExtractor.js'), extractorStubs);
assert.equal(oldFeature._normalizeTrend('up'), null);
assert.equal(newFeature._normalizeTrend('up'), 1);
assert.equal(oldFeature._normalizeMacd(0, 0), null);
assert.equal(newFeature._normalizeMacd(0, 0), 0.5);
const candles = Array.from({ length: 5 }, (_, i) => ({ open: 100 + i, close: 101 + i, high: 102 + i, low: 99 + i, volume: 100 }));
const indicators = { rsi: 50, atrNormalized: 0.5, trend: 'uptrend', bbPercentB: 50, macd: { macd: 0, signal: 0 }, macdSignal: 0 };
const oldVector = oldFeature.extract({ indicators, candles });
const newVector = newFeature.extract({ indicators, candles });
assert.equal(oldVector.features[3], 1);
assert.equal(newVector.features[3], 0.5);

const optimized = {
  calculateMACD: () => ({ macdLine: 1, signalLine: 0 }), calculateRSI: () => 50,
  determineTrend: () => 'up', calculateBollingerBands: () => ({ width: 0.01 }),
  calculateVolatility: () => 0.01,
};
const enhancedStubs = {
  './OptimizedIndicators': optimized, './CandleHelper': candleStub,
  './UnifiedPatternMemory': { getInstance: () => ({}) }, './TraceSpine': traceStub,
  '../foundation/ConfigLoader': configStub,
};
const enhancedReplacements = [
  ["const trendEncoded = calculatedTrend?.toLowerCase?.() === 'uptrend' ? 1 : calculatedTrend?.toLowerCase?.() === 'downtrend' ? -1 : 0;", "const trendName = calculatedTrend.toLowerCase();\n      const trendEncoded = ['up', 'uptrend'].includes(trendName) ? 1 : ['down', 'downtrend'].includes(trendName) ? -1 : 0;"],
];
const enhancedCandidate = candidate('core/EnhancedPatternRecognition.js');
const enhanced = compile('core/EnhancedPatternRecognition.js', enhancedCandidate, enhancedStubs);
const enhancedVector = enhanced.FeatureExtractor.extract({ candles, trend: 'up', macd: 1, signal: 0, rsi: 50 });
assert.equal(enhancedVector[2], 1);
for (const [trend, expected] of [['up',1],['down',-1],['sideways',0],['uptrend',1],['downtrend',-1]]) {
  assert.equal(enhanced.FeatureExtractor.extract({candles,trend,macd:0,signal:0,rsi:50,useOptimizedIndicators:false})[2],expected);
  assert.equal(enhanced.FeatureExtractor.extract({candles,trend,macd:0,signal:0,rsi:50,useOptimizedIndicators:true})[2],expected);
}


const plannerStubs = { './exit/TakeProfitChecker': class { check() { return { shouldExit: false }; } } };
const plannerReplacements = [
  ['  if (!config || config.enabled !== true) {\n    return null;\n  }\n  const status', '  if (!config || config.enabled !== true) {\n    return null;\n  }\n  const exitFraction = usesContractPartial ? config.fraction : config.scaleOutFraction;\n  if (exitFraction === 0) return null;\n  const status'],
  ['usesContractPartial ? config.fraction : config.scaleOutFraction,', 'exitFraction,'],
  ['return sum + requireFraction(candidate.exitFraction, `tier.${candidate.name || index}.exitFraction`);', 'return candidate.exitFraction === 0 ? sum : sum + requireFraction(candidate.exitFraction, `tier.${candidate.name || index}.exitFraction`);'],
  ["if (status !== 'idle') {", "if (status !== 'idle' || tier.exitFraction === 0) {"],
];
const planner = compile('core/ProfitExitPlanner.js', candidate('core/ProfitExitPlanner.js'), plannerStubs);
const snapshot = { entryPrice: 100, currentPrice: 102, direction: 'long', remainingOrderQuantity: 10, entryOrderQuantity: 10, tradeRevision: 0, intentId: 'fixture', pendingExitIntent: null, beScaleOutState: { status: 'idle' }, tierStates: [], frozenExitPolicy: { policyHash: 'x', contract: { stopLossPercent: -1, takeProfitPercent: null, partialExit: null }, profitManagement: { beScaleOut: { enabled: true, triggerType: 'fixed_percent', fixedPercentTrigger: 0.01, scaleOutFraction: 0 }, tieredExit: { enabled: false } } } };
const oldPlanner = compile('core/ProfitExitPlanner.js', head('core/ProfitExitPlanner.js'), plannerStubs);
assert.throws(() => oldPlanner.plan(snapshot), /scaleOutFraction/);
assert.equal(planner.plan(snapshot).action, 'none');
const tiersSnapshot = structuredClone(snapshot);
tiersSnapshot.frozenExitPolicy.profitManagement.beScaleOut.enabled = false;
tiersSnapshot.frozenExitPolicy.profitManagement.tieredExit = {
  enabled: true, allocationBasis: 'open_tier_weight',
  tiers: [{ name: 'tier1', targetProfitMove: 0.01, exitFraction: 0 },
    { name: 'tier2', targetProfitMove: 0.015, exitFraction: 0.25 },
    { name: 'final', targetProfitMove: 0.03, exitFraction: 0.75 }],
};
tiersSnapshot.tierStates = [{ status: 'idle' }, { status: 'idle' }, { status: 'idle' }];
const tierPlan = planner.plan(tiersSnapshot);
assert.equal(tierPlan.action, 'exit_partial');
assert.equal(tierPlan.exitFraction, 0.25);
assert.equal(tierPlan.tierIndex, 1);
const allZero = structuredClone(tiersSnapshot);
allZero.frozenExitPolicy.profitManagement.tieredExit.tiers.forEach(tier => { tier.exitFraction = 0; });
assert.equal(planner.plan(allZero).action, 'none');


const donchianStubs = { '../core/CandleHelper': { c: x => x.close }, '../core/IndicatorCalculator': { IndicatorCalculator: { calculateATR: () => 1, calculateDonchian: () => ({ upper: 100, lower: 90 }) } } };
const donchian = compile('modules/DonchianBreakout.js', candidate('modules/DonchianBreakout.js'), donchianStubs);
const d = new donchian({ entryPeriod: 2, atrPeriod: 14, allowShorts: false }, { atrStopMult: 2, trailChannelBars: 3, stopType: 'structural', trailType: 'channel', tpMode: 'off', maxHoldMode: 'off', partialExit: {}, invalidationConditions: [] });
assert.equal(d._signal('buy', 0.7, 1, { upper: 100, lower: 90 }, 'x').exitContractHint.atrPeriod, 14);

const tradingSource = candidate('core/TradingLoop.js');
const tradingAst = require('acorn').parse(tradingSource, { ecmaVersion: 'latest' });
let gatherNode;
function collectGather(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'MethodDefinition' && node.key?.name === '_gatherData') gatherNode = node.value;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collectGather);
    else if (value && typeof value === 'object' && value.type) collectGather(value);
  }
}
collectGather(tradingAst);
assert.ok(gatherNode, 'actual TradingLoop._gatherData must be extracted from candidate source');
const gather = vm.runInNewContext(`({ _gatherData${tradingSource.slice(gatherNode.start, gatherNode.end)} })._gatherData`, {
  FeatureExtractor: { extractArray: () => [] },
  ConfigLoader: { get: key => key === 'confidence.candlePatternMinConfidence' ? 0 : false },
  RegimeDetector: class { detect() { return { regime: 'ranging', confidence: 1, details: {} }; } },
  candlePatternDetector: { detect: (candles, input) => { globalThis.candleInput = input; return []; } },
  stampPatternMaturity: () => {},
  _o: c => c.open, _h: c => c.high, _l: c => c.low, _c: c => c.close,
}, { filename: 'TradingLoop._gatherData.fixture.js' });
let patternInput;
const snapshotIndicators = { ema9: 9, ema20: 20, atr: 1.2, bbWidth: 0.42, bbPercentB: 0.5, macd: 0, macdSignal: 0, superTrendDirection: 'uptrend', rsi: 50 };
const context = {
  patternChecker: { analyzePatterns: input => { patternInput = input; return []; } },
  backtestFast: true, regimeDetection: {}, broadcastPatternAnalysis: () => {}, ogzTpo: null,
};
const gatherOwner = { ctx: context, _patternScope: () => ({}), _nearestStructure: () => null };
const gathered = gather.call(gatherOwner, 100, { priceHistory: [{ open: 99, high: 101, low: 98, close: 100 }], indicatorEngine: { getSnapshot: () => ({ indicators: { ...snapshotIndicators } }) }, fibonacciDetector: null }, 'TEST', { volume: 10 }, '15m');
assert.equal(gathered.indicators.bbWidth, 0.42);
assert.equal(gathered.indicators.volatility, 1.2);
assert.equal(gathered.indicators.trend, 'uptrend');
assert.equal(patternInput.macd, 0);
assert.equal(patternInput.macdSignal, 0);
assert.equal(Object.hasOwn(gathered.indicators, 'ema12'), false);
assert.equal(Object.hasOwn(gathered.indicators, 'ema26'), false);
assert.equal(Object.hasOwn(gathered.indicators, 'bollingerBands'), false);
const strategySource = candidate('core/StrategyOrchestrator.js');
const strategyAst = require('acorn').parse(strategySource, { ecmaVersion: 'latest' });
const strategyFns = new Map();
function collectStrategy(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && ['requireExitHintEnum', 'validateExitHintFamilyShape', 'normalizeExitHintPartialExit', 'normalizeExitContractHint'].includes(node.id.name)) {
    strategyFns.set(node.id.name, strategySource.slice(node.start, node.end));
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collectStrategy);
    else if (value && typeof value === 'object' && value.type) collectStrategy(value);
  }
}
collectStrategy(strategyAst);
assert.equal(strategyFns.size, 4);
const normalizedExit = vm.runInNewContext(`(function(){${[...strategyFns.values()].join('\n')}\nreturn normalizeExitContractHint;})()`, {})(
  { stopLossPercent: -1, stopType: 'percent', trailType: 'percent', tpMode: 'percent', maxHoldMode: 'minutes', takeProfitPercent: 1, trailingStopPercent: 0, trailingActivation: 0, maxHoldTimeMinutes: 5, rsiPeriod: 14 }, 'fixture'
);
assert.equal(normalizedExit.trailingStopPercent, 0);
assert.equal(normalizedExit.trailingActivation, 0);
assert.equal(normalizedExit.rsiPeriod, 14);
const ledger = compile('core/dto/DecisionLedgerSchema.js', candidate('core/dto/DecisionLedgerSchema.js'));
const nullableExit = ledger.ExitContractSchema.safeParse({ strategyName: 'DonchianBreakout', stopLossPercent: -1, takeProfitPercent: null, maxHoldTimeMinutes: null });
assert.equal(nullableExit.success, true);

console.log(JSON.stringify({ pass: true, source: 'fixtures/source-baseline and fixtures/source-candidate pinned to HEAD 101399e1', actualConsumers: ['FeatureExtractor', 'EnhancedPatternRecognition.FeatureExtractor', 'ProfitExitPlanner.plan', 'DonchianBreakout._signal', 'StrategyOrchestrator.normalizeExitContractHint'], limits: ['TradingLoop constructor not loaded; candidate producer AST-extracted', 'No credentials/network/state/PM2'] }));

function methods(file,names) {
 const source=candidate(file), ast=require('acorn').parse(source,{ecmaVersion:'latest'}), found=[];
 function walk(n) {if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&names.includes(n.key?.name)) found.push(n.key.name+source.slice(n.value.start,n.value.end));for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}
 walk(ast);assert.equal(found.length,names.length);return vm.runInNewContext('({'+found.join(',')+'})');
}
const traiDecision=methods('core/TRAIDecisionModule.js',['_firstFiniteNumber','_extractPatternMemoryFeatures']);
const traiCore=methods('core/trai_core.js',['_extractFeatures']);
for(const [trend,expected] of [['up',1],['down',-1],['sideways',0],['uptrend',1],['downtrend',-1]]) {
 const indicators={rsi:50,macd:0,macdSignal:0,bbWidth:0.42};
 const a=traiDecision._extractPatternMemoryFeatures({indicators,trend,volatility:0.01});
 const b=traiCore._extractFeatures(indicators,trend,0.01);
 assert.equal(a[2],expected);assert.equal(b[2],expected);assert.equal(a[3],0.42);assert.equal(b[3],0.42);
}
console.log(JSON.stringify({activatedFeatureConsumers:true,optimizedAndProvidedBranches:true,traiDecisionAndCore:true}));
