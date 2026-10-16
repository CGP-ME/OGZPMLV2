'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const mode = process.argv[2];
if (!mode) throw new Error('mode required baseline|candidate');
const root = path.resolve(__dirname, mode);
const settings = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8'));
const TwoPole = require(path.join(root, 'core/TwoPoleOscillator.js'));
const poleConfig = { ...settings.indicators.optimized.twoPole };
const pole = new TwoPole(poleConfig);
const zones = [1, -1, 0.5, -0.5, 0.25, -0.25, 0];
const zoneOutputs = zones.map(value => pole.calculateSignalConfidence(value, value));
if (mode === 'candidate') assert.equal(Object.hasOwn(pole, 'confidenceBase'), false);
if (mode === 'baseline') assert.equal(pole.confidenceBase, 40);
assert.deepEqual(zoneOutputs, [85,85,65,65,50,50,35]);
if (mode === 'candidate') {
 assert.equal(Object.hasOwn(settings.confidence, 'regimeMinConfidence'), false);
 assert.equal(Object.hasOwn(settings.confidence, 'confluenceMinScore'), false);
 assert.equal(Object.hasOwn(poleConfig, 'confidenceBase'), false);
}
const originalLoad = Module._load;
const loader = {
  load: () => ({ fingerprint: 'fixture-fingerprint' }),
  get: key => {
    if (key === 'confidence.minStrategyConfidence') return 0.35;
    if (key === 'regimeBoosts' || key === 'volumeProfileBoosts') return {};
    if (key === 'orchestrator.mtfConfluenceBooster' || key === 'orchestrator.strategyMtfConfluence') return { enabled: false };
    if (key === 'strategyBehavior.trendRegimeGate.enabled') return false;
    if (key === 'strategyBehavior.trendRegimeGate.minConfidence') return 0;
    if (key === 'strategyBehavior.trendRegimeGate.strategies') return [];
    if (key === 'strategyBehavior.atrContracts.enabled') return false;
    if (key === 'strategyBehavior.atrContracts.stopMultiplier' || key === 'strategyBehavior.atrContracts.trailMultiplier' || key === 'strategyBehavior.atrContracts.trailingActivationR') return 1;
    return null;
  },
  getEntrySizingInput: () => ({ issues: [], multipliers: { fixture: 1 } }),
};
Module._load = function(request, parent, isMain) {
  if (request === '../foundation/ConfigLoader') return loader;
  if (request === './ExitContractManager') return { getInstance: () => ({ createExitContract: () => ({}) }) };
  if (request === './TradeNarrator') return { getNarrator: () => ({ enabled: false }) };
  if (request === './TraceSpine') return { createTraceId: () => 'fixture-trace', emitTrace: () => {} };
  if (request === './CandleHelper') return { c: {} };
  if (request === './IndicatorCalculator') return { IndicatorCalculator: class {} };
  if (request.includes('/modules/') || request.startsWith('../modules/') || request === './MAExtensionFilter') return class {};
  if (request === './OgzTpoIntegration') return class {};
  return originalLoad.call(this, request, parent, isMain);
};
const { StrategyOrchestrator: Orch } = require(path.join(root, 'core/StrategyOrchestrator.js'));
Module._load = originalLoad;
const orch = Object.create(Orch.prototype);
const strategy = { name: 'fixture', evaluate: () => ({ direction: 'long', confidence: 0.5, action: 'BUY', timeframe: '15m', overrideLevels: { stopLossPercent: 1, takeProfitPercent: 2 } }) };
Object.assign(orch, {
  pipelineConfiguration: 'fixture-fingerprint', evalCount: 0,
  registeredStrategies: [strategy], strategies: [strategy], builtinStrategies: new Set(),
  strategyDiagnostics: false, mtfEvaluationCache: null,
  _applyPipelineToggles() {}, _recordLatestCandleTimeframeAbsence() {},
  _recordStrategyUnavailable(input) { return { strategyName: input.strategyName, reason: input.reason, errorMessage: input.error?.message || '' }; },
});
let decision;
try {
  decision = orch.evaluate({ atr: 1 }, [], null, [], { price: 100, timeframe: '15m' });
} catch (error) {
  throw new Error(`actual StrategyOrchestrator.evaluate fixture failed: ${error.stack}`);
}
assert.equal(decision.winnerStrategy, 'fixture');
assert.equal(decision.confidence, 50);
assert.equal(orch.minStrategyConfidence, 0.35);
console.log(JSON.stringify({ mode, revision: settings.revision, zoneOutputs, confidenceBaseOwnProperty: Object.hasOwn(pole, 'confidenceBase'), orchestratorDecision: { action: decision.action, direction: decision.direction, confidence: decision.confidence, minStrategyConfidence: orch.minStrategyConfidence } }));
