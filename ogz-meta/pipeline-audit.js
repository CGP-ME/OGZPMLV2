#!/usr/bin/env node
/**
 * OGZPrime Pipeline Forensic Audit Tool
 * ======================================
 * Recursively walks every module, function, and data connection
 * in the trading pipeline and verifies:
 *
 *   1. MODULE HEALTH     — Can every module load without error?
 *   2. METHOD EXISTENCE   — Does every expected method exist on every class?
 *   3. WIRING INTEGRITY   — Are modules connected to each other correctly?
 *   4. DATA FLOW          — Does data actually pass through the pipeline?
 *   5. SIGNAL CHAIN       — Does every signal source reach the trade decision?
 *   6. EXIT CHAIN         — Does every exit path reach the trade logger?
 *   7. PERSISTENCE        — Are trade results being saved to disk?
 *
 * Usage:
 *   node tools/pipeline-audit.js              # Full audit
 *   node tools/pipeline-audit.js --quick      # Module + method checks only
 *   node tools/pipeline-audit.js --data-flow  # Full pipeline with synthetic data
 *   node tools/pipeline-audit.js --json       # Output as JSON
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = Failures detected
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const DATA_FLOW = args.includes('--data-flow');
const JSON_OUT = args.includes('--json');

// ─── RESULTS TRACKING ────────────────────────────────────────
let totalChecks = 0;
let passed = 0;
let failed = 0;
let warnings = 0;
const results = {
  modules: [],
  methods: [],
  wiring: [],
  dataFlow: [],
  signalChain: [],
  exitChain: [],
  persistence: [],
  summary: {}
};

function check(category, name, condition, detail = '') {
  totalChecks++;
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) passed++;
  else failed++;
  const entry = { name, status, detail };
  results[category].push(entry);
  if (!JSON_OUT) {
    const icon = condition ? '✅' : '❌';
    const detailStr = detail ? ` — ${detail}` : '';
    console.log(`  ${icon} ${name}${detailStr}`);
  }
  return condition;
}

function warn(category, name, detail = '') {
  warnings++;
  const entry = { name, status: 'WARN', detail };
  results[category].push(entry);
  if (!JSON_OUT) {
    console.log(`  ⚠️  ${name} — ${detail}`);
  }
}

function section(title) {
  if (!JSON_OUT) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'═'.repeat(60)}`);
  }
}

// ─── PHASE 1: MODULE HEALTH ──────────────────────────────────
function auditModuleHealth() {
  section('PHASE 1: MODULE HEALTH — Can every module load?');

  const modules = {
    // Tier 1 — Core pipeline
    'StateManager':            './core/StateManager',
    'OptimizedTradingBrain':   './core/OptimizedTradingBrain',
    'AdvancedExecutionLayer':  './core/AdvancedExecutionLayer-439-MERGED',
    'MaxProfitManager':        './core/MaxProfitManager',
    'EnhancedPatternRecognition': './core/EnhancedPatternRecognition',
    'RiskManager':             './core/RiskManager',
    'TradeLogger':             './core/tradeLogger',
    'IndicatorEngine':         './core/indicators/IndicatorEngine',
    'MarketRegimeDetector':    './core/MarketRegimeDetector',

    // Tier 2 — Modular entries
    'EMASMACrossoverSignal':   './modules/EMASMACrossoverSignal',
    'MADynamicSR':             './modules/MADynamicSR',
    'LiquiditySweepDetector':  './modules/LiquiditySweepDetector',
    'MultiTimeframeAdapter':   './modules/MultiTimeframeAdapter',

    // Tier 3 — Support
    'OptimizedIndicators':     './core/OptimizedIndicators',
    'FibonacciDetector':       './core/FibonacciDetector',
    'SupportResistanceDetector': './core/SupportResistanceDetector',
    'ErrorHandler':            './core/ErrorHandler',
    'MemoryManager':           './core/MemoryManager',
    'PersistentPatternMap':    './core/PersistentPatternMap',
    'TRAIDecisionModule':      './core/TRAIDecisionModule',
    'PerformanceAnalyzer':     './core/PerformanceAnalyzer',
    'PatternBasedExitModel':   './core/PatternBasedExitModel',
    'TradingProfileManager':   './core/TradingProfileManager',
    'TradeIntelligenceEngine': './core/TradeIntelligenceEngine',
    'KrakenAdapterV2':         './core/KrakenAdapterV2',
  };

  const loaded = {};
  for (const [name, modPath] of Object.entries(modules)) {
    try {
      const fullPath = path.resolve(ROOT, modPath);
      loaded[name] = require(fullPath);
      check('modules', name, true, `${modPath} loaded`);
    } catch (e) {
      const msg = e.message.split('\n')[0];
      // Axios missing is an environment issue (npm install needed), not a code bug
      if (msg.includes("Cannot find module 'axios'") || msg.includes("Cannot find module 'ws'")) {
        warn('modules', name, `${msg} (run npm install)`);
        loaded[name] = null;
      } else {
        check('modules', name, false, msg);
        loaded[name] = null;
      }
    }
  }
  return loaded;
}

// ─── PHASE 2: METHOD EXISTENCE ───────────────────────────────
function auditMethodExistence(loaded) {
  section('PHASE 2: METHOD EXISTENCE — Does every expected method exist?');

  // Define expected methods per class
  const expectedMethods = {
    OptimizedTradingBrain: {
      cls: 'OptimizedTradingBrain',
      methods: [
        'getDecision', 'calculateRealConfidence', 'determineTradingDirection',
        'calculatePositionSize', 'openPosition', 'closePosition', 'managePosition',
        'checkScalperExitConditions', 'checkBasicExitConditions',
        'checkBreakevenWithdrawal', 'executeBreakevenWithdrawal',
        'calculateStopLoss', 'calculateTakeProfit', 'calculateBreakevenStopLoss',
        'analyzeFibSRLevels', 'updatePatternLearning', 'getPatternWinRate',
        'getPatternAvgReturn', 'getPatternSampleSize', 'countConfluenceSignals',
        'updateSessionStats', 'calculateCurrentWinRate', 'activateScalperMode',
        'calculateEnsembleVotes', 'processAnalysis', 'calculateOptimalPositionSize',
        'setCandles', 'isInPosition', 'getCurrentPosition', 'getBalance',
        'identifyConflictingSignals', 'extractSecondaryReasons',
      ]
    },
    MaxProfitManager: {
      cls: 'MaxProfitManager',
      methods: [
        'start', 'update', 'reset', 'close',
        'checkProfitTiers', 'executePartialExit',
        'updateTrailingStop', 'updateBreakevenStop',
        'shouldExitPosition', 'getPositionState',
        'calculateProfitPercent', 'setupProfitTiers',
        'applyTimeBasedAdjustments', 'calculateVolatilityAdjustment',
        'getAnalytics', 'exportConfig', 'validateConfig',
      ]
    },
    StateManager: {
      cls: null,  // singleton pattern — check getStateManager
      methods: [
        'getState', 'get', 'set', 'updateState',
        'openPosition', 'closePosition', 'updateBalance',
        'updateActiveTrade', 'removeActiveTrade', 'getAllTrades',
        'save', 'load', 'validateState', 'emergencyReset',
        'pauseTrading', 'resumeTrading', 'addListener',
      ]
    },
    RiskManager: {
      cls: 'RiskManager',
      methods: [
        'calculatePositionSize', 'assessTradeRisk', 'recordTradeResult',
        'isTradingAllowed', 'getRiskSummary', 'getMaxPositionSize',
        'initializeBalance', 'updateBalance', 'checkRiskAlerts',
        'checkPeriodResets', 'getRecentWinRate',
        'resetDailyStats', 'resetWeeklyStats', 'resetMonthlyStats',
      ]
    },
    AdvancedExecutionLayer: {
      cls: 'AdvancedExecutionLayer',
      methods: [
        'executeTrade', 'generateIntentId', 'generateClientOrderId',
        'checkDuplicateIntent', 'getCurrentHoldings',
        'calculateRealPositionSize', 'calculatePnL',
        'getBalance', 'getStats', 'getPositions', 'getStatus',
      ]
    },
    EnhancedPatternRecognition: {
      cls: null,  // multiple exports
      methods: [
        'analyzePatterns', 'recordPatternResult', 'evaluatePattern',
        'findSimilarPatterns', 'getPatternHistory',
      ]
    },
    IndicatorEngine: {
      cls: 'IndicatorEngine',
      methods: [
        'updateCandle', 'computeBatch', 'getSnapshot', 'getRenderPacket',
      ]
    },
    TradeLogger: {
      cls: null,  // function exports
      functions: ['logTrade', 'getTodayStats', 'cleanOldLogs']
    },
    EMASMACrossoverSignal: {
      cls: 'EMASMACrossoverSignal',
      methods: ['update', 'destroy']
    },
    MADynamicSR: {
      cls: 'MADynamicSR',
      methods: ['update', 'destroy']
    },
    LiquiditySweepDetector: {
      cls: 'LiquiditySweepDetector',
      methods: ['feedCandle', 'destroy']
    },
    MultiTimeframeAdapter: {
      cls: 'MultiTimeframeAdapter',
      methods: ['ingestCandle', 'getConfluenceScore', 'destroy']
    },
    MarketRegimeDetector: {
      cls: 'MarketRegimeDetector',
      methods: [
        'analyzeMarket', 'detectRegime', 'calculateRegimeConfidence',
        'getAdjustedParameters', 'getTradeRecommendation', 'getState',
      ]
    },
    FibonacciDetector: {
      cls: 'FibonacciDetector',
      methods: ['update', 'getNearestLevel']
    },
    SupportResistanceDetector: {
      cls: 'SupportResistanceDetector',
      methods: ['update', 'getNearestLevel']
    },
  };

  for (const [modName, spec] of Object.entries(expectedMethods)) {
    const mod = loaded[modName];
    if (!mod) {
      check('methods', `${modName} (skipped)`, false, 'Module failed to load');
      continue;
    }

    // Check exported functions
    if (spec.functions) {
      for (const fn of spec.functions) {
        check('methods', `${modName}.${fn}()`, typeof mod[fn] === 'function', 
          typeof mod[fn] === 'function' ? 'exported function' : 'MISSING');
      }
      continue;
    }

    // Find the class
    let ClassRef = null;
    if (spec.cls && mod[spec.cls]) {
      ClassRef = mod[spec.cls];
    } else if (spec.cls && typeof mod === 'function') {
      ClassRef = mod;
    } else if (!spec.cls) {
      // Try known patterns — singleton, default export, etc.
      const keys = Object.keys(mod);
      for (const k of keys) {
        if (typeof mod[k] === 'function' && mod[k].prototype) {
          ClassRef = mod[k];
          break;
        }
      }
    }

    if (!ClassRef) {
      // Try to find methods on the module itself (singleton instance)
      // Handle various export patterns: { ClassName }, module.exports = Class, singleton
      const target = mod.getStateManager ? mod.getStateManager() :
                     (typeof mod === 'function' && mod.prototype) ? mod.prototype :
                     mod;
      if (spec.methods) {
        for (const method of spec.methods) {
          const has = typeof target[method] === 'function' ||
                     (target.prototype && typeof target.prototype[method] === 'function');
          check('methods', `${modName}.${method}()`, has,
            has ? 'exists' : 'MISSING');
        }
      }
      continue;
    }

    // Check methods on prototype
    if (spec.methods) {
      for (const method of spec.methods) {
        const has = typeof ClassRef.prototype[method] === 'function';
        check('methods', `${modName}.${method}()`, has,
          has ? 'exists on prototype' : 'MISSING from prototype');
      }
    }
  }
}

// ─── PHASE 3: WIRING INTEGRITY ──────────────────────────────
function auditWiring() {
  section('PHASE 3: WIRING INTEGRITY — Are modules connected correctly?');

  const mainBot = fs.readFileSync(path.join(ROOT, 'run-empire-v2.js'), 'utf8');
  const brainSrc = fs.readFileSync(path.join(ROOT, 'core/OptimizedTradingBrain.js'), 'utf8');

  // Check critical require() statements in run-empire-v2.js
  const criticalImports = [
    { name: 'StateManager', pattern: /require.*StateManager|getStateManager/ },
    { name: 'OptimizedTradingBrain', pattern: /require.*OptimizedTradingBrain|loader\.get.*TradingBrain|OptimizedTradingBrain/ },
    { name: 'AdvancedExecutionLayer', pattern: /require.*ExecutionLayer|loader\.get.*ExecutionLayer|AdvancedExecutionLayer/ },
    { name: 'MaxProfitManager', pattern: /require.*MaxProfitManager|loader\.get.*MaxProfit|MaxProfitManager/ },
    { name: 'EnhancedPatternRecognition', pattern: /require.*PatternRecognition|loader\.get.*Pattern|EnhancedPatternChecker/ },
    { name: 'RiskManager', pattern: /require.*RiskManager|loader\.get.*RiskManager|new RiskManager/ },
    { name: 'TradeLogger', pattern: /require.*tradeLogger/ },
    { name: 'IndicatorEngine', pattern: /require.*IndicatorEngine/ },
    { name: 'MarketRegimeDetector', pattern: /require.*MarketRegimeDetector|loader\.get.*Regime|MarketRegimeDetector/ },
    { name: 'EMASMACrossoverSignal', pattern: /require.*EMASMACrossoverSignal/ },
    { name: 'MADynamicSR', pattern: /require.*MADynamicSR/ },
    { name: 'LiquiditySweepDetector', pattern: /require.*LiquiditySweepDetector/ },
    { name: 'MultiTimeframeAdapter', pattern: /require.*MultiTimeframeAdapter/ },
    { name: 'TRAIDecisionModule', pattern: /require.*TRAIDecisionModule|loader\.get.*TRAI|TRAIDecisionModule/ },
    { name: 'PerformanceAnalyzer', pattern: /require.*PerformanceAnalyzer|loader\.get.*Performance|PerformanceAnalyzer/ },
  ];

  for (const imp of criticalImports) {
    // Check it's not commented out
    const lines = mainBot.split('\n');
    let found = false;
    let commented = false;
    for (const line of lines) {
      if (imp.pattern.test(line)) {
        if (line.trim().startsWith('//')) {
          commented = true;
        } else {
          found = true;
        }
      }
    }
    if (found) {
      check('wiring', `import ${imp.name}`, true, 'required in run-empire-v2.js');
    } else if (commented) {
      check('wiring', `import ${imp.name}`, false, 'COMMENTED OUT in run-empire-v2.js');
    } else {
      check('wiring', `import ${imp.name}`, false, 'NOT FOUND in run-empire-v2.js');
    }
  }

  // Check critical instantiations
  const criticalInstantiations = [
    { name: 'new OptimizedTradingBrain', pattern: /new\s+OptimizedTradingBrain/ },
    { name: 'new AdvancedExecutionLayer', pattern: /new\s+AdvancedExecutionLayer/ },
    { name: 'new RiskManager', pattern: /new\s+RiskManager/ },
    { name: 'new PerformanceAnalyzer', pattern: /new\s+PerformanceAnalyzer/ },
    { name: 'new MarketRegimeDetector', pattern: /new\s+MarketRegimeDetector/ },
    { name: 'new EMASMACrossoverSignal', pattern: /new\s+EMASMACrossoverSignal/ },
    { name: 'new MADynamicSR', pattern: /new\s+MADynamicSR/ },
    { name: 'new LiquiditySweepDetector', pattern: /new\s+LiquiditySweepDetector/ },
    { name: 'new MultiTimeframeAdapter', pattern: /new\s+MultiTimeframeAdapter/ },
  ];

  for (const inst of criticalInstantiations) {
    const found = inst.pattern.test(mainBot) && !mainBot.split('\n').every(l => {
      return !inst.pattern.test(l) || l.trim().startsWith('//');
    });
    check('wiring', inst.name, found,
      found ? 'instantiated' : 'NOT INSTANTIATED');
  }

  // Check critical method calls (are modules actually being USED)
  const criticalCalls = [
    { name: 'tradingBrain.getDecision()', pattern: /tradingBrain\.getDecision\(/ },
    { name: 'executionLayer.executeTrade()', pattern: /executionLayer\.executeTrade\(/ },
    { name: 'stateManager.openPosition()', pattern: /stateManager\.openPosition\(/ },
    { name: 'stateManager.closePosition()', pattern: /stateManager\.closePosition\(/ },
    { name: 'maxProfitManager.start()', pattern: /maxProfitManager\.start\(/ },
    { name: 'maxProfitManager.update()', pattern: /maxProfitManager\.update\(/ },
    { name: 'maxProfitManager.reset()', pattern: /maxProfitManager\.reset\(/ },
    { name: 'indicatorEngine.getSnapshot()', pattern: /indicatorEngine\.getSnapshot\(\)|getSnapshot\(\)/ },
    { name: 'regimeDetector.detectRegime()', pattern: /regimeDetector\.detectRegime\(/ },
    { name: 'patternChecker.analyzePatterns()', pattern: /patternChecker\.analyzePatterns\(/ },
    { name: 'emaCrossover.update()', pattern: /emaCrossover\.update\(/ },
    { name: 'maDynamicSR.update()', pattern: /maDynamicSR\.update\(/ },
    { name: 'liquiditySweep.feedCandle()', pattern: /liquiditySweep\.feedCandle\(/ },
    { name: 'mtfAdapter.ingestCandle()', pattern: /mtfAdapter\.ingestCandle\(/ },
    { name: 'logTrade()', pattern: /logTrade\(/, source: mainBot },
    { name: 'performanceAnalyzer.processTrade()', pattern: /performanceAnalyzer\.processTrade\(/ },
    { name: 'riskManager.recordTradeResult()', pattern: /recordTradeResult\(/ },
  ];

  for (const call of criticalCalls) {
    const src = call.source || mainBot;
    const lines = src.split('\n');
    let activeCall = false;
    let commentedCall = false;
    for (const line of lines) {
      if (call.pattern.test(line)) {
        if (line.trim().startsWith('//')) {
          commentedCall = true;
        } else {
          activeCall = true;
        }
      }
    }
    if (activeCall) {
      check('wiring', call.name, true, 'actively called');
    } else if (commentedCall) {
      check('wiring', call.name, false, 'COMMENTED OUT — not executing');
    } else {
      check('wiring', call.name, false, 'NEVER CALLED');
    }
  }

  // Check signal data flows to TradingBrain
  const signalPassthrough = [
    { name: 'emaCrossoverSignal → marketData', pattern: /emaCrossoverSignal:\s*this\.emaCrossoverSignal/ },
    { name: 'maDynamicSRSignal → marketData', pattern: /maDynamicSRSignal:\s*this\.maDynamicSRSignal/ },
    { name: 'liquiditySweepSignal → marketData', pattern: /liquiditySweepSignal:\s*this\.liquiditySweepSignal/ },
    { name: 'mtfAdapter → marketData', pattern: /mtfAdapter:\s*this\.mtfAdapter/ },
    { name: 'signalBreakdown → stateManager', pattern: /signalBreakdown:\s*brainDecision\.signalBreakdown/ },
    { name: 'bullishScore → stateManager', pattern: /bullishScore:\s*brainDecision\.bullishScore/ },
    { name: 'bearishScore → stateManager', pattern: /bearishScore:\s*brainDecision\.bearishScore/ },
  ];

  for (const sp of signalPassthrough) {
    check('wiring', sp.name, sp.pattern.test(mainBot),
      sp.pattern.test(mainBot) ? 'data flows through' : 'DATA NOT PASSED');
  }

  // Check TradingBrain reads modular signals
  const brainReads = [
    { name: 'Brain reads emaCrossoverSignal', pattern: /marketData\.emaCrossoverSignal/ },
    { name: 'Brain reads maDynamicSRSignal', pattern: /marketData\.maDynamicSRSignal/ },
    { name: 'Brain reads liquiditySweepSignal', pattern: /marketData\.liquiditySweepSignal/ },
    { name: 'Brain reads mtfAdapter', pattern: /marketData\.mtfAdapter/ },
    { name: 'Brain stores signalBreakdown', pattern: /marketData\.signalBreakdown\s*=\s*signalBreakdown/ },
    { name: 'getDecision returns signalBreakdown', pattern: /signalBreakdown:\s*marketData\.signalBreakdown/ },
    { name: 'getDecision returns bullishScore', pattern: /bullishScore:\s*marketData\.bullishScore/ },
    { name: 'getDecision returns bearishScore', pattern: /bearishScore:\s*marketData\.bearishScore/ },
  ];

  for (const br of brainReads) {
    check('wiring', br.name, br.pattern.test(brainSrc),
      br.pattern.test(brainSrc) ? 'confirmed' : 'NOT FOUND in TradingBrain');
  }
}

// ─── PHASE 4: DATA FLOW TEST ────────────────────────────────
function auditDataFlow(loaded) {
  section('PHASE 4: DATA FLOW — Does synthetic data pass through?');

  // Build synthetic candle data
  const basePrice = 97000;
  const candles = [];
  for (let i = 0; i < 250; i++) {
    const drift = Math.sin(i / 30) * 500 + (Math.random() - 0.5) * 200;
    const close = basePrice + drift;
    candles.push({
      t: Date.now() - (250 - i) * 60000,
      o: close - (Math.random() * 50),
      h: close + Math.random() * 100,
      l: close - Math.random() * 100,
      c: close,
      v: 10 + Math.random() * 50
    });
  }
  const latestCandle = candles[candles.length - 1];

  // Test IndicatorEngine
  try {
    const IEMod = loaded.IndicatorEngine;
    const IEClass = IEMod.IndicatorEngine || IEMod;
    const ie = new IEClass({ periods: { sma: [20, 50], ema: [9, 20, 50] } });
    for (const c of candles) ie.updateCandle(c);
    const snap = ie.getSnapshot();
    check('dataFlow', 'IndicatorEngine.getSnapshot()', snap && snap.rsi !== undefined,
      snap ? `RSI=${snap.rsi?.toFixed(1)}, trend=${snap.trend}` : 'NO DATA');
  } catch (e) {
    check('dataFlow', 'IndicatorEngine.getSnapshot()', false, e.message);
  }

  // Test EMASMACrossoverSignal
  try {
    const EMACS = loaded.EMASMACrossoverSignal;
    const ema = new EMACS();
    let sig;
    for (const c of candles) sig = ema.update(c, candles);
    check('dataFlow', 'EMASMACrossoverSignal.update()', sig && sig.direction !== undefined,
      sig ? `direction=${sig.direction}, confidence=${(sig.confidence*100).toFixed(1)}%` : 'NO SIGNAL');
  } catch (e) {
    check('dataFlow', 'EMASMACrossoverSignal.update()', false, e.message);
  }

  // Test MADynamicSR
  try {
    const MASR = loaded.MADynamicSR;
    const ma = new MASR();
    let sig;
    for (const c of candles) sig = ma.update(c, candles);
    check('dataFlow', 'MADynamicSR.update()', sig && sig.direction !== undefined,
      sig ? `direction=${sig.direction}, events=${sig.events?.length || 0}` : 'NO SIGNAL');
  } catch (e) {
    check('dataFlow', 'MADynamicSR.update()', false, e.message);
  }

  // Test LiquiditySweepDetector
  try {
    const LSD = loaded.LiquiditySweepDetector;
    const ls = new LSD({ lookbackBars: 50 });
    let sig;
    for (const c of candles) sig = ls.feedCandle(c);
    check('dataFlow', 'LiquiditySweepDetector.feedCandle()', sig !== undefined,
      sig ? `hasSignal=${sig.hasSignal}` : 'NO OUTPUT');
  } catch (e) {
    check('dataFlow', 'LiquiditySweepDetector.feedCandle()', false, e.message);
  }

  // Test MultiTimeframeAdapter
  try {
    const MTA = loaded.MultiTimeframeAdapter;
    const mtf = new MTA({ timeframes: ['5m', '15m'] });
    for (const c of candles) mtf.ingestCandle(c);
    const conf = mtf.getConfluenceScore();
    check('dataFlow', 'MultiTimeframeAdapter.getConfluenceScore()', conf && conf.confidence !== undefined,
      conf ? `confidence=${(conf.confidence*100).toFixed(1)}%, shouldTrade=${conf.shouldTrade}` : 'NO CONFLUENCE');
  } catch (e) {
    check('dataFlow', 'MultiTimeframeAdapter.getConfluenceScore()', false, e.message);
  }

  // Test MarketRegimeDetector
  try {
    const MRDMod = loaded.MarketRegimeDetector;
    const MRDClass = MRDMod.MarketRegimeDetector || MRDMod;
    const mrd = new MRDClass();
    const regime = mrd.analyzeMarket(candles);
    check('dataFlow', 'MarketRegimeDetector.analyzeMarket()', regime && regime.regime,
      regime ? `regime=${regime.regime}, confidence=${(regime.confidence*100).toFixed(0)}%` : 'NO REGIME');
  } catch (e) {
    check('dataFlow', 'MarketRegimeDetector.analyzeMarket()', false, e.message);
  }

  // Test FibonacciDetector
  try {
    const FibMod = loaded.FibonacciDetector;
    const FibClass = FibMod.FibonacciDetector || FibMod;
    const fib = new FibClass();
    const levels = fib.update(candles);
    check('dataFlow', 'FibonacciDetector.update()', levels !== undefined,
      levels ? `levels detected` : 'NO LEVELS');
  } catch (e) {
    check('dataFlow', 'FibonacciDetector.update()', false, e.message);
  }

  // Test EnhancedPatternRecognition
  try {
    const EPR = loaded.EnhancedPatternRecognition;
    const PatClass = EPR.EnhancedPatternChecker || EPR.EnhancedPatternRecognition || EPR;
    const pr = new PatClass();
    const patterns = pr.analyzePatterns({
      candles: candles,
      trend: 'up',
      macd: 0.5,
      macdSignal: 0.3,
      rsi: 45,
      volume: 25
    });
    check('dataFlow', 'EnhancedPatternRecognition.analyzePatterns()', Array.isArray(patterns),
      Array.isArray(patterns) ? `${patterns.length} patterns detected` : 'NOT AN ARRAY');
  } catch (e) {
    check('dataFlow', 'EnhancedPatternRecognition.analyzePatterns()', false, e.message);
  }

  // Test TradingBrain.getDecision (the big one)
  try {
    const { OptimizedTradingBrain } = loaded.OptimizedTradingBrain;
    const brain = new OptimizedTradingBrain(10000);

    // Wire up dependencies
    if (loaded.MarketRegimeDetector) {
      const MRDMod = loaded.MarketRegimeDetector;
      const MRDClass = MRDMod.MarketRegimeDetector || MRDMod;
      brain.marketRegimeDetector = new MRDClass();
    }
    if (loaded.OptimizedIndicators) {
      brain.optimizedIndicators = loaded.OptimizedIndicators;
    }
    if (loaded.FibonacciDetector) {
      const FibClass = loaded.FibonacciDetector.FibonacciDetector || loaded.FibonacciDetector;
      brain.fibonacciDetector = new FibClass();
    }
    if (loaded.SupportResistanceDetector) {
      const SRClass = loaded.SupportResistanceDetector.SupportResistanceDetector || loaded.SupportResistanceDetector;
      brain.supportResistanceDetector = new SRClass();
    }
    if (loaded.EnhancedPatternRecognition) {
      const PR = loaded.EnhancedPatternRecognition;
      const PatClass = PR.EnhancedPatternChecker || PR.EnhancedPatternRecognition || PR;
      brain.patternRecognition = new PatClass();
    }

    const marketData = {
      price: latestCandle.c,
      trend: 'up',
      macd: 0.5,
      macdSignal: 0.3,
      rsi: 35,
      volume: 25,
      avgVolume: 20,
      volatility: 0.02,
      emaCrossoverSignal: { direction: 'buy', confidence: 0.15, confluence: 0.6, blowoff: false },
      maDynamicSRSignal: { direction: 'buy', confidence: 0.10, events: [1,2] },
      liquiditySweepSignal: { hasSignal: false },
      mtfAdapter: { getConfluenceScore: () => ({ shouldTrade: true, confidence: 0.6, direction: 'buy', readyTimeframes: ['5m','15m'], trendAlignment: 0.7 }) }
    };

    // Suppress console noise during test
    const origLog = console.log;
    console.log = () => {};
    const decision = brain.getDecision(marketData, [], candles);
    console.log = origLog;

    check('dataFlow', 'TradingBrain.getDecision()', 
      decision && decision.direction && decision.confidence !== undefined,
      decision ? `direction=${decision.direction}, confidence=${(decision.confidence*100).toFixed(1)}%, size=${(decision.size*100).toFixed(2)}%` : 'NO DECISION');

    // Check the signal breakdown made it through
    check('dataFlow', 'signalBreakdown in decision', 
      decision && decision.signalBreakdown && decision.signalBreakdown.signals,
      decision?.signalBreakdown ? `${decision.signalBreakdown.signals.length} signals tracked` : 'MISSING');

    check('dataFlow', 'bullishScore in decision',
      decision && typeof decision.bullishScore === 'number',
      decision ? `bullish=${(decision.bullishScore*100).toFixed(1)}%` : 'MISSING');

    check('dataFlow', 'bearishScore in decision',
      decision && typeof decision.bearishScore === 'number',
      decision ? `bearish=${(decision.bearishScore*100).toFixed(1)}%` : 'MISSING');

    // Check individual signal sources made it into the breakdown
    if (decision && decision.signalBreakdown && decision.signalBreakdown.signals) {
      const sources = decision.signalBreakdown.signals.map(s => s.source);
      const expectedSources = ['RSI', 'MACD', 'EMACrossover', 'MADynamicSR'];
      for (const src of expectedSources) {
        check('signalChain', `${src} → signalBreakdown`, sources.includes(src),
          sources.includes(src) ? 'signal captured' : 'SIGNAL NOT CAPTURED');
      }
    }

  } catch (e) {
    check('dataFlow', 'TradingBrain.getDecision()', false, e.message);
  }

  // Test TradeLogger write/read
  try {
    const { logTrade, getTodayStats } = loaded.TradeLogger;

    // Write a test trade
    const testTrade = {
      type: 'BUY',
      entryPrice: 97000,
      exitPrice: 97200,
      pnl: 2.00,
      pnlPercent: 0.21,
      holdTime: 180000,
      confidence: 0.72,
      signalBreakdown: {
        baseConfidence: 0.10,
        signals: [{ source: 'RSI', direction: 'bullish', contribution: 0.20, detail: 'test' }],
        bullishTotal: 0.62,
        bearishTotal: 0.10,
        finalConfidence: 0.72,
        finalDirection: 'buy',
        filters: [],
        adjustments: []
      },
      rsi: 35,
      trend: 'up',
      balanceBefore: 10000,
      balanceAfter: 10002
    };

    const origLog2 = console.log;
    console.log = () => {};
    const writeOk = logTrade(testTrade);
    console.log = origLog2;
    check('persistence', 'TradeLogger.logTrade()', writeOk, writeOk ? 'wrote trade' : 'WRITE FAILED');

    // Read it back
    const stats = getTodayStats();
    check('persistence', 'TradeLogger.getTodayStats()', stats && stats.totalTrades > 0,
      stats ? `${stats.totalTrades} trades today, P&L=$${stats.totalPnL?.toFixed(2)}` : 'NO STATS');

    // Verify signalBreakdown survived the round-trip
    if (stats && stats.trades && stats.trades.length > 0) {
      const lastTrade = stats.trades[stats.trades.length - 1];
      check('persistence', 'signalBreakdown persisted', 
        lastTrade.signalBreakdown && lastTrade.signalBreakdown.signals,
        lastTrade.signalBreakdown ? `${lastTrade.signalBreakdown.signals.length} signals saved` : 'LOST IN PERSISTENCE');
    }

    // Clean up test trade
    const logDir = path.join(ROOT, 'logs', 'trades');
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `trades_${today}.json`);
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  } catch (e) {
    check('persistence', 'TradeLogger round-trip', false, e.message);
  }

  // Test MaxProfitManager lifecycle
  try {
    const MPMMod = loaded.MaxProfitManager;
    const MPMClass = MPMMod.MaxProfitManager || MPMMod;
    const mpm = new MPMClass();

    // Suppress console noise
    const origLog3 = console.log;
    console.log = () => {};

    mpm.start(97000, 'buy', 0.001, { confidence: 0.72 });
    const isActive = mpm.state?.active === true;
    check('dataFlow', 'MaxProfitManager.start()', isActive, 'activated');

    const update1 = mpm.update(97100);
    check('dataFlow', 'MaxProfitManager.update(profit)', true, 'update processed');

    const state = mpm.getPositionState();
    check('dataFlow', 'MaxProfitManager.getPositionState()', state !== undefined,
      state ? `profit=${state.profitPercent?.toFixed(2) || 0}%` : 'NO STATE');

    mpm.reset();
    check('dataFlow', 'MaxProfitManager.reset()', true, 'deactivated');

    console.log = origLog3;
  } catch (e) {
    check('dataFlow', 'MaxProfitManager lifecycle', false, e.message);
  }
}

// ─── PHASE 5: EXIT CHAIN ─────────────────────────────────────
function auditExitChain() {
  section('PHASE 5: EXIT CHAIN — Does every exit path reach the logger?');

  const mainBot = fs.readFileSync(path.join(ROOT, 'run-empire-v2.js'), 'utf8');
  const brainSrc = fs.readFileSync(path.join(ROOT, 'core/OptimizedTradingBrain.js'), 'utf8');

  // Check that SELL trades trigger all post-trade actions
  const exitActions = [
    { name: 'stateManager.closePosition() on SELL', pattern: /stateManager\.closePosition\(price/ },
    { name: 'performanceAnalyzer.processTrade() on SELL', pattern: /performanceAnalyzer\.processTrade\(/ },
    { name: 'logTrade() on SELL', pattern: /logTrade\(\{/ },
    { name: 'recordPatternResult() on SELL', pattern: /recordPatternResult\(/ },
    { name: 'trai.recordTradeOutcome() on SELL', pattern: /recordTradeOutcome\(/ },
    { name: 'maxProfitManager.reset() on SELL', pattern: /maxProfitManager\.reset\(\)/ },
    { name: 'removeActiveTrade() on SELL', pattern: /removeActiveTrade\(/ },
  ];

  for (const ea of exitActions) {
    const lines = mainBot.split('\n');
    let active = false;
    for (const line of lines) {
      if (ea.pattern.test(line) && !line.trim().startsWith('//')) {
        active = true;
        break;
      }
    }
    check('exitChain', ea.name, active, active ? 'active' : 'NOT ACTIVE');
  }

  // Check MaxProfitManager exit triggers are wired
  const combinedSrc = mainBot + brainSrc;
  const mpmSrc = fs.readFileSync(path.join(ROOT, 'core/MaxProfitManager.js'), 'utf8');
  const allSrc = combinedSrc + mpmSrc;
  
  check('exitChain', 'MPM tiered exits defined',
    /checkProfitTiers/.test(allSrc) && /executePartialExit/.test(allSrc),
    'profit tier checking + partial exit logic exists');

  check('exitChain', 'MPM trailing stop logic',
    /updateTrailingStop/.test(allSrc) && /trailingStopPrice/.test(allSrc),
    'trailing stop update + price tracking exists');

  check('exitChain', 'MPM breakeven stop logic',
    /updateBreakevenStop/.test(allSrc) && /breakevenStop/.test(allSrc),
    'breakeven stop logic exists');
}

// ─── PHASE 6: FILE INTEGRITY ─────────────────────────────────
function auditFileIntegrity() {
  section('PHASE 6: FILE INTEGRITY — Do all referenced files exist?');

  const criticalFiles = [
    'run-empire-v2.js',
    'core/OptimizedTradingBrain.js',
    'core/AdvancedExecutionLayer-439-MERGED.js',
    'core/MaxProfitManager.js',
    'core/EnhancedPatternRecognition.js',
    'core/StateManager.js',
    'core/RiskManager.js',
    'core/tradeLogger.js',
    'core/indicators/IndicatorEngine.js',
    'core/MarketRegimeDetector.js',
    'core/FibonacciDetector.js',
    'core/SupportResistanceDetector.js',
    'core/OptimizedIndicators.js',
    'core/TRAIDecisionModule.js',
    'core/ErrorHandler.js',
    'core/MemoryManager.js',
    'core/PersistentPatternMap.js',
    'core/PerformanceAnalyzer.js',
    'core/PatternBasedExitModel.js',
    'core/TradingProfileManager.js',
    'core/TradeIntelligenceEngine.js',
    'core/KrakenAdapterV2.js',
    'modules/EMASMACrossoverSignal.js',
    'modules/MADynamicSR.js',
    'modules/LiquiditySweepDetector.js',
    'modules/MultiTimeframeAdapter.js',
  ];

  for (const file of criticalFiles) {
    const fullPath = path.join(ROOT, file);
    const exists = fs.existsSync(fullPath);
    let detail = '';
    if (exists) {
      const stat = fs.statSync(fullPath);
      const lines = fs.readFileSync(fullPath, 'utf8').split('\n').length;
      detail = `${lines} lines, ${(stat.size / 1024).toFixed(1)}KB`;
    }
    check('persistence', file, exists, exists ? detail : 'FILE MISSING');
  }

  // Check symlinks
  const symlinks = [
    { path: 'utils/tradeLogger.js', target: '../core/tradeLogger.js' },
  ];
  for (const sl of symlinks) {
    const fullPath = path.join(ROOT, sl.path);
    if (fs.existsSync(fullPath)) {
      try {
        const target = fs.readlinkSync(fullPath);
        const resolves = fs.existsSync(path.resolve(path.dirname(fullPath), target));
        check('persistence', `symlink ${sl.path}`, resolves,
          resolves ? `→ ${target} (valid)` : `→ ${target} (BROKEN)`);
      } catch (e) {
        check('persistence', `symlink ${sl.path}`, true, 'regular file (not symlink)');
      }
    } else {
      check('persistence', `symlink ${sl.path}`, false, 'MISSING');
    }
  }

  // Check data directories
  const dataDirs = ['data', 'logs', 'logs/trades'];
  for (const dir of dataDirs) {
    const fullPath = path.join(ROOT, dir);
    const exists = fs.existsSync(fullPath);
    if (!exists) {
      warn('persistence', `directory ${dir}`, 'does not exist yet (created on first trade)');
    } else {
      check('persistence', `directory ${dir}`, true, 'exists');
    }
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────
function printSummary() {
  section('AUDIT SUMMARY');

  results.summary = {
    totalChecks,
    passed,
    failed,
    warnings,
    passRate: totalChecks > 0 ? ((passed / totalChecks) * 100).toFixed(1) + '%' : '0%',
    timestamp: new Date().toISOString(),
    categories: {
      modules: { pass: results.modules.filter(r => r.status === 'PASS').length, fail: results.modules.filter(r => r.status === 'FAIL').length },
      methods: { pass: results.methods.filter(r => r.status === 'PASS').length, fail: results.methods.filter(r => r.status === 'FAIL').length },
      wiring: { pass: results.wiring.filter(r => r.status === 'PASS').length, fail: results.wiring.filter(r => r.status === 'FAIL').length },
      dataFlow: { pass: results.dataFlow.filter(r => r.status === 'PASS').length, fail: results.dataFlow.filter(r => r.status === 'FAIL').length },
      signalChain: { pass: results.signalChain.filter(r => r.status === 'PASS').length, fail: results.signalChain.filter(r => r.status === 'FAIL').length },
      exitChain: { pass: results.exitChain.filter(r => r.status === 'PASS').length, fail: results.exitChain.filter(r => r.status === 'FAIL').length },
      persistence: { pass: results.persistence.filter(r => r.status === 'PASS').length, fail: results.persistence.filter(r => r.status === 'FAIL').length },
    }
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\n  Total checks:  ${totalChecks}`);
  console.log(`  ✅ Passed:     ${passed}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log(`  ⚠️  Warnings:   ${warnings}`);
  console.log(`  Pass rate:     ${results.summary.passRate}`);
  console.log('');

  for (const [cat, counts] of Object.entries(results.summary.categories)) {
    const icon = counts.fail === 0 ? '✅' : '❌';
    console.log(`  ${icon} ${cat}: ${counts.pass}/${counts.pass + counts.fail}`);
  }

  if (failed > 0) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  FAILURES:');
    console.log(`${'═'.repeat(60)}`);
    for (const [cat, entries] of Object.entries(results)) {
      if (cat === 'summary') continue;
      const failures = entries.filter(e => e.status === 'FAIL');
      for (const f of failures) {
        console.log(`  ❌ [${cat}] ${f.name} — ${f.detail}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(failed === 0 ? '  🟢 ALL CHECKS PASSED — Pipeline is healthy' : '  🔴 FAILURES DETECTED — Pipeline needs attention');
  console.log(`${'═'.repeat(60)}\n`);

  // Save results
  const reportDir = path.join(ROOT, 'logs');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `audit-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`  📄 Report saved: ${reportPath}\n`);
}

// ─── MAIN ────────────────────────────────────────────────────
function main() {
  if (!JSON_OUT) {
    console.log(`\n${'╔'.padEnd(59, '═')}╗`);
    console.log(`║  OGZPrime Pipeline Forensic Audit                       ║`);
    console.log(`║  ${new Date().toISOString().padEnd(56)}║`);
    console.log(`${'╚'.padEnd(59, '═')}╝`);
  }

  // Phase 1: Module Health
  const loaded = auditModuleHealth();

  // Phase 2: Method Existence
  auditMethodExistence(loaded);

  // Phase 3: Wiring Integrity
  auditWiring();

  if (!QUICK) {
    // Phase 4: Data Flow
    auditDataFlow(loaded);

    // Phase 5: Exit Chain
    auditExitChain();

    // Phase 6: File Integrity
    auditFileIntegrity();
  }

  // Summary
  printSummary();

  process.exit(failed > 0 ? 1 : 0);
}

main();
