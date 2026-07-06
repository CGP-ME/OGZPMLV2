require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const auditDoc = path.join(__dirname, '..', 'ogz-meta', 'ledger', 'pre-refactor-audit-2026-04-12.md');

function askMercury(question) {
  try {
    const result = execSync(
      `node trai_brain/mercury-bridge/ask.js "${question.replace(/"/g, '\\"')}"`,
      { cwd: '/opt/ogzprime/OGZPMLV2', timeout: 120000, encoding: 'utf8' }
    );
    const answerMatch = result.match(/═══ ANSWER ═══\n([\s\S]*?)(?:\[latency:|$)/);
    return answerMatch ? answerMatch[1].trim() : 'No answer extracted';
  } catch (e) {
    return `ERROR: ${e.message.substring(0, 200)}`;
  }
}

let doc = `# OGZPrime Pre-Refactor Full-System Audit
**Date:** 2026-04-12
**Branch:** broker/alpaca-integration
**Purpose:** Complete system diagnostic before multi-asset refactor
**Tool:** Mercury-2 RAG (${new Date().toISOString()})

---

`;

const passes = [
  { title: 'PASS 1 — BROKER LAYER INTEGRITY', questions: [
    'List every adapter file in brokers/. For each one, which IBrokerAdapter methods are implemented vs stubs that throw?',
    'Is AlpacaAdapter registered in BrokerRegistry.js? What entry format does BrokerRegistry expect?',
    'Do all broker adapters return candles in the same shape {t,o,h,l,c,v} with timestamp in milliseconds?',
  ]},
  { title: 'PASS 2 — DATA INGESTION', questions: [
    'Where does candle data enter the system from brokers? List every ingestion point in run-empire-v2.js and CandleProcessor.js',
    'Where is CandleHelper _c(candle) pattern used vs bypassed with direct candle.c access?',
  ]},
  { title: 'PASS 3 — INDICATOR ENGINE', questions: [
    'Is IndicatorEngine.getSnapshot() the single source of truth for indicators? Are there places computing RSI or EMA inline?',
    'Is IndicatorEngine a singleton that assumes one symbol state, or does it support per-symbol state?',
  ]},
  { title: 'PASS 4 — STRATEGY LAYER', questions: [
    'List every strategy registered in StrategyOrchestrator. Does each implement evaluate() with the same return shape?',
    'Are there strategy files in modules/ that exist but are NOT registered with the orchestrator?',
  ]},
  { title: 'PASS 5 — STRATEGY ORCHESTRATOR', questions: [
    'Does StrategyOrchestrator.evaluate() populate allResults, winnerStrategy, confluence, confidence, sizingMultiplier in every return path?',
    'Is confluence affecting position sizing only, or does it gate entry anywhere?',
  ]},
  { title: 'PASS 6 — TRADING LOOP', questions: [
    'Walk through TradingLoop.analyzeAndTrade() step by step. What order do indicator snapshot, pattern detection, strategy evaluation, and order execution happen?',
    'Do any emitter broadcasts happen BEFORE the strategy decision is locked in TradingLoop?',
  ]},
  { title: 'PASS 7 — STATE MANAGER', questions: [
    'Is StateManager the single source of truth for balance, equity, and open positions? Any reads from other places?',
    'Is per-symbol position isolation possible in the current StateManager, or is it singleton-shaped?',
  ]},
  { title: 'PASS 8 — ORDER EXECUTOR', questions: [
    'List every place in OrderExecutor.js that hardcodes BTC-USD or BTC/USD as a default symbol',
    'Does OrderExecutor route orders through the broker adapter interface or call Kraken directly?',
  ]},
  { title: 'PASS 9 — EXIT PIPELINE', questions: [
    'Does ExitContractManager own every trade from fill to close? What order do exit checkers fire per tick?',
    'Are exit contracts per-strategy locked via ConfigLoader, or can global env vars override them?',
  ]},
  { title: 'PASS 10 — PATTERN MEMORY', questions: [
    'Where is logPatternResult called from? Does it currently capture realized R-multiple data?',
    'Is pattern memory keyed by pattern shape only, or by pattern-plus-symbol?',
  ]},
  { title: 'PASS 11 — TRAI', questions: [
    'Is TRAI wired into the trade evaluation pipeline in TradingLoop, or is it only a dashboard widget?',
  ]},
  { title: 'PASS 12 — DASHBOARD EMITTERS', questions: [
    'List every dashboardWs.send() packet type across the codebase. Are all wrapped in try-catch?',
  ]},
  { title: 'PASS 13 — ENTRY POINT', questions: [
    'How many places in run-empire-v2.js hardcode BTC-USD or tradingPair to a specific symbol?',
  ]},
  { title: 'PASS 14 — CONFIG', questions: [
    'Which env vars in .env are ghost vars never consumed by ConfigLoader.js or any runtime code?',
  ]},
  { title: 'PASS 17 — MULTI-ASSET READINESS', questions: [
    'Can multiple IBrokerAdapter instances coexist in the same process? Is there singleton state preventing two brokers running simultaneously?',
    'How many call sites reference tradingPair as a singular string that would need to change for multi-symbol support?',
  ]},
];

let questionNum = 0;
const totalQ = passes.reduce((s,p) => s + p.questions.length, 0);

for (const pass of passes) {
  doc += `## ${pass.title}\n\n`;
  for (const q of pass.questions) {
    questionNum++;
    console.log(`[${questionNum}/${totalQ}] ${q.substring(0, 80)}...`);
    const answer = askMercury(q);
    doc += `### Q${questionNum}: ${q}\n\n${answer}\n\n---\n\n`;
    fs.writeFileSync(auditDoc, doc);
  }
}

doc += `\n## AUDIT COMPLETE\n\n**Total questions:** ${questionNum}\n**Generated:** ${new Date().toISOString()}\n`;
fs.writeFileSync(auditDoc, doc);
console.log(`\nAudit complete. ${questionNum} questions. Saved to ${auditDoc}`);
