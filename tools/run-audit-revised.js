#!/usr/bin/env node
/**
 * Mercury Agentic Audit — Pre-Apex Revised Spec
 * Runs all questions in --agentic mode through Mercury's ReAct loop.
 * Each question gets full tool access (grep, open_file, get_chunk, list_files).
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'ogz-meta', 'ledger', 'pre-apex-revised-audit-2026-04-13.md');

function askMercuryAgentic(question) {
  try {
    const result = execSync(
      `node trai_brain/mercury-bridge/ask.js --agentic --quiet "${question.replace(/"/g, '\\"')}"`,
      { cwd: '/opt/ogzprime/OGZPMLV2', timeout: 180000, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }
    );
    const answerMatch = result.match(/═══ ANSWER ═══\n([\s\S]*?)(?:\[iterations:|$)/);
    const metaMatch = result.match(/\[iterations: (\d+) \| termination: (\w+) \| latency: (\d+)ms\]/);
    return {
      answer: answerMatch ? answerMatch[1].trim() : 'No answer extracted',
      iterations: metaMatch ? parseInt(metaMatch[1]) : 0,
      termination: metaMatch ? metaMatch[2] : 'unknown',
      latency: metaMatch ? parseInt(metaMatch[3]) : 0,
    };
  } catch (e) {
    return { answer: `ERROR: ${e.message.substring(0, 500)}`, iterations: 0, termination: 'error', latency: 0 };
  }
}

const blocks = [
  { title: 'BLOCK A — Partial-close pipeline', questions: [
    'In core/OrderExecutor.js SELL/COVER path, show the exact lines that read decision.exitFraction and build the exit plan. Does execution sizing derive from active remaining quantity, not a legacy exitSize field? Cite file:line. Show 3-5 lines of verbatim code.',
    'In core/ProfitExitPlanner.js, show every return statement that emits exitFraction. For each, is the value a 0-1 fraction of current remaining quantity? Cite file:line + 3 lines context.',
    'In core/PolicyBuilder.js normalizeTieredExit, what is the shape of each tier object? Is exitFraction already 0-1 fractional, or is it a percent like 30? Cite file:line.',
    'Confirm the BE scale-out block in core/ProfitExitPlanner.js returns scaleOutFraction semantics through exitFraction. Cite file:line with verbatim code.',
    'In core/StateManager.js, show closePosition signature and body. Does it accept a size parameter, and if so, does it actually reduce position or always close full? Cite file:line for every branch.',
    'Does core/StateManager.js have any method named reducePosition, partialClose, or equivalent today? If yes cite file:line; if no state explicitly NOT FOUND.',
  ]},
  { title: 'BLOCK B — Trade lifecycle accounting', questions: [
    'In core/BacktestRecorder.js recordTrade, does the method accumulate legs per tradeId, or does it record every exit event as a standalone trade? Cite file:line with verbatim code.',
    'Does core/BacktestRecorder.js have any concept of recordPartialExit or leg accumulation? Cite file:line or state NOT FOUND.',
    'In core/TradeJournal.js recordExit, does it remove the open trade on the first exit event, or does it wait for remainingSize === 0? Cite file:line.',
    'In core/TradeJournalBridge.js, trace how a multi-leg trade would flow through. Does the bridge call recordExit once or multiple times per parent trade? Cite file:line.',
    'In core/UnifiedPatternMemory.js recordOutcome, is the call per-exit-event or per-parent-trade? Does any dedupe by tradeId exist? Cite file:line.',
    'In core/TRAIDecisionModule.js, trace the outcome learning path. Is it keyed by orderId or tradeId? On a multi-leg exit, does the first leg consume the learning record? Cite file:line.',
  ]},
  { title: 'BLOCK C — Schema coupling (orthogonality check)', questions: [
    'In core/exit/BreakEvenManager.js, list every field it reads from the trade object (e.g. trade.maxProfitPercent, trade.exitContract). Cite file:line for each.',
    'In core/exit/StopLossChecker.js, list every field it reads from the trade or context object. Cite file:line for each.',
    'In core/ExitContractManager.js invalidationConditions, what fields does it read from the trade (entryIndicators, customMetadata, etc)? Cite file:line.',
    'For each field found in Q13-Q15, would moving that field under trade.exitState or trade.exitEnv break the reader silently (returns undefined), loudly (throws), or not at all?',
  ]},
  { title: 'BLOCK D — Crash recovery / in-flight trade rehydration', questions: [
    'Does any module persist trade state to disk between candles or on shutdown? Search for SessionStateManager, persisted state files, writeFileSync on trade objects. Cite file:line or state NOT FOUND.',
    'On bot restart, is there any rehydration path that reads persisted trades back into activeTrades? Cite file:line or state NOT FOUND.',
    'If no rehydration exists, confirm that the current system always starts from a clean activeTrades state on restart. State explicitly.',
  ]},
  { title: 'BLOCK E — Live-mode readiness (Alpaca)', questions: [
    'In brokers/AlpacaAdapter.js, is the trading/account WebSocket stream (_ensureDataStream or subscribeToAccount) actually wired, or is it a stub? Cite file:line.',
    'Is there any WebSocket reconnect logic on the Alpaca adapter close or error events, or does it just log? Cite file:line.',
    'Does AlpacaAdapter getOrderBook return real bid/ask size, or does it return size=0? Cite file:line.',
    'In TradingLoop or OrderExecutor, is live mode gated behind a feature flag today, or will it execute the moment EXECUTION_MODE=live is set? Cite file:line.',
    'Trace the live SELL path end-to-end on a partial close. Does it call the same OrderExecutor code as backtest, or a different path? Cite file:line.',
  ]},
  { title: 'BLOCK F — Fee / slippage modeling on partials', questions: [
    'In core/BacktestRecorder.js, show the fee calculation. Does it apply fees per leg or amortize across the parent trade? Cite file:line with verbatim code.',
    'Is there any minimum-leg-capital threshold anywhere in the codebase (e.g. dont partial if remaining < $X)? Cite file:line or state NOT FOUND.',
    'Does backtest model slippage at all, or does it assume exit price = signal price? Cite file:line.',
  ]},
  { title: 'BLOCK G — $970.71 regression anchor reproducibility', questions: [
    'In foundation/ConfigLoader.js exitContracts block, paste the current values for RSI, EMASMACrossover, MADynamicSR, LiquiditySweep. Confirm _validated dates are present. Cite file:line.',
    'Does ExitContractManager.createExitContract actually pull from ConfigLoader.BASE_CONFIG.exitContracts, or is there a fallback to global exits.stopLossPercent? Cite file:line for both paths.',
    'Does tools/parallel-backtest.js worker spawn block set ENABLE_SMS=true and SMS_VP_RTH_ONLY=true? Cite file:line.',
    'In core/exit/StopLossChecker.js:49-52, is the drawdown bypass calc fix applied (uses getEquity or equivalent), or does it still double-count via accountBalance + positionValue? Cite file:line.',
    'In core/TradingLoop.js:149-150, does accountBalance read from stateManager.getEquity(price) or from stateManager.get(balance)? Cite file:line.',
  ]},
  { title: 'BLOCK H — Config system duplication', questions: [
    'foundation/ConfigLoader.js and foundation/ConfigLoader.js both exist. For STOP_LOSS_PERCENT, MIN_TRADE_CONFIDENCE, RISK_MANAGER_BYPASS, ACCOUNT_DRAWDOWN_BYPASS — which file defines each, what default, and which consumers read from which? Full cross-reference with file:line.',
    'In production (backtest + live), which config source wins when the two disagree? Trace a specific read of MIN_TRADE_CONFIDENCE from TradingLoop back to its source. Cite file:line.',
  ]},
  { title: 'BLOCK I — Orphan code (potential free alpha)', questions: [
    'In core/MAExtensionFilter.js:246 and :267, the functions shouldTakeLong / shouldTakeShort are defined. Is either ever called? Search the repo and cite callers file:line, or confirm orphan.',
    'In core/trai_core.js:688, integrateWithBot — is it ever called? Cite caller file:line, or confirm orphan.',
    'In core/CandlePatternDetector.js, is it imported anywhere in TradingLoop or StrategyOrchestrator today? Cite file:line or confirm still-orphan.',
  ]},
  { title: 'BLOCK J — Position sizing', questions: [
    'In core/OrderExecutor.js:55-81, show the current confidence multiplier formula and the cap. Confirm the stack is base x confidence x confluence. Cite file:line with verbatim code.',
    'What is maxPositionSize in ConfigLoader.js, and does OrderExecutor use basePositionSize (1%) or maxPositionSize (5%) as the starting point? Cite file:line.',
    'Is DynamicPositionSizer instantiated and wired, or is it still null per run-empire-v2.js:615? Cite file:line.',
  ]},
  { title: 'BLOCK K — PID controller readiness', questions: [
    'Does foundation/ConfigLoader.js have a pid block defined today (even empty)? Cite file:line or confirm NOT FOUND.',
    'Is PIDController.js created as a module yet, or does only the spec exist? Cite file path or confirm NOT FOUND.',
  ]},
  { title: 'BLOCK L — Pine transpiler state', questions: [
    'pine-transpiler/ directory — list all files present. Does PineFeatureScanner.js exist as a separate file, or is it embedded?',
    'Is the Pine transpiler wired into StrategyOrchestrator via _registerPineStrategies(), or is it standalone tooling? Cite file:line.',
  ]},
];

let doc = `# Pre-Apex Revised Spec Audit — Mercury Agentic
**Date:** ${new Date().toISOString().split('T')[0]}
**Mode:** Agentic (ReAct loop with grep/open_file/get_chunk/list_files)
**Purpose:** First-party verification of every claim before writing revised architecture spec
**Tool:** Mercury-2 via trai_brain/mercury-bridge/ask.js --agentic
**Index:** 6738 chunks (reindexed ${new Date().toISOString().split('T')[0]})

---

`;

const totalQ = blocks.reduce((s, b) => s + b.questions.length, 0);
let questionNum = 0;
let totalIterations = 0;
let totalLatency = 0;

for (const block of blocks) {
  doc += `## ${block.title}\n\n`;
  for (const q of block.questions) {
    questionNum++;
    const shortQ = q.substring(0, 80);
    console.log(`[${questionNum}/${totalQ}] ${shortQ}...`);

    const result = askMercuryAgentic(q);
    totalIterations += result.iterations;
    totalLatency += result.latency;

    doc += `### Q${questionNum}: ${q}\n\n`;
    doc += `**[${result.iterations} iterations | ${result.termination} | ${(result.latency/1000).toFixed(1)}s]**\n\n`;
    doc += `${result.answer}\n\n---\n\n`;

    // Write after each question (crash-safe)
    fs.writeFileSync(OUTPUT, doc);
    console.log(`  → ${result.iterations} iters, ${(result.latency/1000).toFixed(1)}s, ${result.termination}`);
  }
}

doc += `\n## AUDIT COMPLETE\n\n`;
doc += `**Total questions:** ${questionNum}\n`;
doc += `**Total Mercury iterations:** ${totalIterations}\n`;
doc += `**Total latency:** ${(totalLatency/1000).toFixed(1)}s\n`;
doc += `**Average iterations/question:** ${(totalIterations/questionNum).toFixed(1)}\n`;
doc += `**Average latency/question:** ${(totalLatency/questionNum/1000).toFixed(1)}s\n`;
doc += `**Generated:** ${new Date().toISOString()}\n`;

fs.writeFileSync(OUTPUT, doc);
console.log(`\nAudit complete. ${questionNum} questions, ${totalIterations} total iterations. Saved to ${OUTPUT}`);
