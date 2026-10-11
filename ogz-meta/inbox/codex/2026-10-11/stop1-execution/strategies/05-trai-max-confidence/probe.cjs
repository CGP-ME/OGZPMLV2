'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');
const { execFileSync } = require('child_process');

const sourcePath = path.resolve(__dirname, '../../../../../../../core/TRAIDecisionModule.js');
const repoRoot = path.resolve(__dirname, '../../../../../../..');
const capLine = '      decision.traiConfidence = Math.max(0, Math.min(this.config.maxConfidenceOverride, decision.traiConfidence));';

function headSource() {
  return execFileSync('git', ['show', require('./source-receipt.json').base + ':core/TRAIDecisionModule.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function loadModule(source) {
  delete require.cache[sourcePath];
  const originalExtension = Module._extensions['.js'];
  Module._extensions['.js'] = (loadedModule, filename) => {
    if (filename !== sourcePath) return originalExtension(loadedModule, filename);
    loadedModule._compile(source, filename);
  };
  try {
    return require(sourcePath);
  } finally {
    Module._extensions['.js'] = originalExtension;
    delete require.cache[sourcePath];
  }
}

async function observe(TRAIDecisionModule, confidenceMultiplier) {
  const instance = Object.create(TRAIDecisionModule.prototype);
  instance.config = { mode: 'passive', enableVetoPower: false, trackDecisions: false, minConfidenceOverride: 0.4, maxConfidenceOverride: 0.75, maxRiskTolerance: 999, emergencyStopLoss: 0.05 };
  instance.state = { totalDecisions: 0 };
  instance.decisionHistory = [];
  instance.patternMemory = new Map();
  instance.patternIntegration = { evaluate: () => ({ matchedPatterns: [], matchedAntiPatterns: [], confidenceMultiplier }) };
  instance.calculateConfidence = async () => 0.9;
  instance.analyzeMarketConditions = async () => ({ volatility: 0, trend: 'flat', sentiment: 'neutral' });
  instance.assessRisk = async () => ({ riskScore: 0, approved: true, factors: [], opinionOnly: true });
  instance.storeDecision = () => {};
  instance.logDecision = () => {};
  instance.emit = () => {};
  instance.broadcastChainOfThought = () => {};
  instance.traiCore = null;
  const decision = await instance.processDecision({ action: 'BUY', confidence: 0.62, patterns: [], symbol: 'TSLA', timeframe: '15m' }, { symbol: 'TSLA', timeframe: '15m', price: 100, volatility: 0, indicators: {} });
  return { traiConfidence: decision.traiConfidence, finalConfidence: decision.finalConfidence };
}

(async () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    const beforeSource = headSource();
    const afterSource = execFileSync('git', ['show', require('./source-receipt.json').candidate + ':core/TRAIDecisionModule.js'], { cwd: repoRoot, encoding: 'utf8' });
    if (beforeSource.includes(capLine)) throw new Error('HEAD baseline unexpectedly already includes the cap');
    if (!afterSource.includes(capLine)) throw new Error('worktree candidate no longer includes the exact cap line');
    const before = await observe(loadModule(beforeSource), 2);
    const after = await observe(loadModule(afterSource), 2);
    const beforeNoMultiplier = await observe(loadModule(beforeSource), 1);
    const afterNoMultiplier = await observe(loadModule(afterSource), 1);
    const result = { before, after, beforeNoMultiplier, afterNoMultiplier };
    if (before.traiConfidence !== 1 || before.finalConfidence !== 0.62 || after.traiConfidence !== 0.75 || after.finalConfidence !== 0.62
      || beforeNoMultiplier.traiConfidence !== 0.9 || beforeNoMultiplier.finalConfidence !== 0.62
      || afterNoMultiplier.traiConfidence !== 0.75 || afterNoMultiplier.finalConfidence !== 0.62) {
      throw new Error(`unexpected before/after result: ${JSON.stringify(result)}`);
    }
    originalLog(JSON.stringify(result, null, 2));
  } finally {
    console.log = originalLog;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
