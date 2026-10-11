'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');
const { execFileSync } = require('child_process');

const sourcePath = path.resolve(__dirname, '../../../../../../core/TRAIDecisionModule.js');
const repoRoot = path.resolve(__dirname, '../../../../../..');
const capLine = '      decision.traiConfidence = Math.max(0, Math.min(this.config.maxConfidenceOverride, decision.traiConfidence));';

function headSource() {
  return execFileSync('git', ['show', 'HEAD:core/TRAIDecisionModule.js'], {
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
  instance.config = { mode: 'passive', trackDecisions: false, minConfidenceOverride: 0.4, maxConfidenceOverride: 0.75, maxRiskTolerance: 999, emergencyStopLoss: 0.05 };
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
  return { vetoApplied: decision.vetoApplied, opinionOnly: decision.riskAssessment.opinionOnly, finalConfidence: decision.finalConfidence };
}

(async()=>{const oldLog=console.log;console.log=()=>{};try{const Cls=loadModule(execFileSync('git',['show',require('./source-receipt.json').candidate+':core/TRAIDecisionModule.js'],{cwd:repoRoot,encoding:'utf8'}));const decision=await observe(Cls,2);const risk={};const veto=Cls.prototype.checkVetoConditions(risk);require('assert').deepStrictEqual(decision,{vetoApplied:false,opinionOnly:true,finalConfidence:0.62});require('assert').strictEqual(veto,false);require('assert').strictEqual(risk.opinionOnly,true);oldLog(JSON.stringify({passed:true,decision,veto,risk}));}finally{console.log=oldLog;}})().catch(e=>{console.error(e);process.exitCode=1;});
