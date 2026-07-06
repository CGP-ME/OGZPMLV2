#!/usr/bin/env node
/**
 * Mercury Agentic Audit Part 2 — Forward-Looking Architecture
 * Blocks M through V (38 questions)
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'ogz-meta', 'ledger', 'pre-apex-audit-v2-part2-2026-04-13.md');

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
  { title: 'BLOCK M — Multi-broker readiness', questions: [
    'List every file in brokers/ directory. For each, what class does it export and what interface does it claim to implement? Cite file:line for the class declaration and the module.exports line.',
    'Does brokers/IBrokerAdapter.js or foundation/IBrokerAdapter.js exist? If yes, paste the full method signature list it requires (all method names). Cite file:line.',
    'In core/OrderExecutor.js, search for hardcoded broker references — kraken, alpaca, BTC/USD, btc, tradingPair defaults. List every instance with file:line. Are these dead/cosmetic or do they affect routing?',
    'Where does OrderExecutor get its broker adapter from? Is it injected via ctx.orderRouter, instantiated directly, or hardcoded? Trace the call from OrderExecutor.executeTrade to the adapter method. Cite file:line for every hop.',
    'Does any OrderRouter or BrokerRouter class exist that selects which adapter to use per trade? Cite file:line or state NOT FOUND.',
    'List every broker adapter file in brokers/ directory. For each file, is it a stub (methods throw not implemented) or actually implemented with real API calls? Cite a representative method body file:line for each.',
    'Does foundation/ConfigLoader.js have any per-broker config block (different fees, different symbol formats, different position size limits per broker)? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK N — Multi-asset support', questions: [
    'In core/StateManager.js, does activeTrades Map key on tradeId only, or does it include asset/symbol? Could the bot today hold concurrent positions in TSLA + BTC + SPY without state collision? Cite file:line.',
    'In core/TradingLoop.js analyzeAndTrade, does it iterate over multiple assets per candle, or does it assume a single tradingPair? Cite file:line.',
    'Does IndicatorEngine maintain separate indicator state per symbol, or is it a singleton tracking one instrument? Cite file:line.',
    'Does pattern memory (PatternMemoryBank or UnifiedPatternMemory) namespace patterns by asset, or are all patterns mixed in one store? Trace the save/load path. Cite file:line.',
    'In core/StrategyOrchestrator.js, when a strategy fires a signal, does the signal carry an asset/symbol field, or is it inferred from a global ctx.tradingPair? Cite file:line.',
    'Are exit contract configs per-asset or global? Can RSI run on TSLA-15m and BTC-1h simultaneously with different validated exit contracts? Cite file:line for the config lookup.',
  ]},
  { title: 'BLOCK O — Cross-broker arbitrage layer', questions: [
    'Search the repo for arbitrage, cross-broker, arb, spread-arb in all JS files. List every file that mentions it. Are these in the live trading path or in standalone scripts/docs? Cite file:line.',
    'Does any module compute price differentials between two brokers for the same asset? Cite file:line or state NOT FOUND.',
    'Does OrderExecutor support simultaneous order placement on two different brokers (one buy, one sell) as an atomic operation? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK P — TRAI 9-function brain layer', questions: [
    'The GRAND-SCHEME calls out 9 TRAI functions: news crawler NLP, whale watcher, pattern modulator, trade analyst, customer service, boomer API onboarding, content gen ElevenLabs D-ID, dashboard widget, ops manager. For each function, does any implementation file exist in the repo? List file path or state NOT FOUND per function.',
    'Does any file integrate with ElevenLabs or D-ID APIs? Cite file:line or state NOT FOUND.',
    'Does any file scrape or poll news sources (RSS, Twitter, Bloomberg, Reuters, Polygon news)? Cite file:line or state NOT FOUND.',
    'In core/trai_core.js and core/TRAIDecisionModule.js, what functions are actually called from outside the TRAI module by the trading loop or other core modules? List each external caller with file:line.',
    'Is there a customer-service or chatbot endpoint that uses TRAI for non-trading queries? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK Q — Pattern memory and premium packs', questions: [
    'Does tools/harvest-pattern-pack.js exist? What does it export? Cite file path and module.exports block.',
    'Trace the pipeline from a closed trade to a pattern saved in PatternMemoryBank or UnifiedPatternMemory. Cite every hop file:line.',
    'Is there any concept of premium pattern pack vs operational pattern bank in code (separate storage, separate gating)? Cite file:line or state NOT FOUND.',
    'Does pattern memory have an export/import or serialize/deserialize format? Cite file:line for those methods.',
    'Is there pattern namespacing by ticker, timeframe, strategy, or any combination? Or is the pattern store a single global namespace? Cite file:line.',
  ]},
  { title: 'BLOCK R — Hot-swap and atomic config changes', questions: [
    'In foundation/ConfigLoader.js, are values read once at module load, or can ConfigLoader.get(key) return updated values mid-run if env vars change? Trace the implementation of get(). Cite file:line.',
    'Does any file call ConfigLoader.set() or ConfigLoader.update() to mutate config during runtime? Cite file:line or state NOT FOUND.',
    'Is there any pending changes staging area that batches config updates and applies them between candles atomically? Cite file:line or state NOT FOUND.',
    'If ConfigLoader values change mid-run, do in-flight trades inherit the new values or keep the values from when they were opened (sealed-at-birth property)? Cite file:line.',
  ]},
  { title: 'BLOCK S — Pine transpiler SaaS readiness', questions: [
    'Can a user upload a .pine file via HTTP endpoint and get a transpiled JS module back? Search for any web endpoint that accepts pine source. Cite file:line or state NOT FOUND.',
    'Is there any sandboxing on transpiled Pine strategies (resource limits, CPU time, memory caps) before they execute? Cite file:line or state NOT FOUND.',
    'Is there any user/tenant model in the codebase (User class, account ID, multi-tenancy)? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK T — Tournament to PID handoff', questions: [
    'In foundation/ConfigLoader.js, search for a pid block. Paste the full pid section if it exists. Cite file:line.',
    'Does core/PIDController.js exist? If yes, where do the clamp ranges (outputMin/outputMax for each loop) come from — hardcoded constants, ConfigLoader values, or a pid.envelopes lookup? Cite file:line for each clamp.',
    'Does any tournament tool (tools/tournament.js, tools/parallel-backtest.js) write output to a pid.envelopes block or manifest file that PID can read? Cite file:line or state NOT FOUND.',
    'Is PIDController instantiated and called anywhere in the trading loop today, or is it built-but-unwired? Cite file:line of instantiation or state NOT FOUND.',
    'Is there any persistence for PID state (integral accumulator, prevError, history) between bot restarts? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK U — Subscription / SaaS layer', questions: [
    'Does any file implement user authentication (JWT, OAuth, API key validation per user)? Cite file:line or state NOT FOUND.',
    'Is there a Stripe/Paddle/payment integration for subscriptions? Cite file:line or state NOT FOUND.',
    'Does any file enforce free-tier limits vs paid-tier features? Cite file:line or state NOT FOUND.',
  ]},
  { title: 'BLOCK V — Operational maturity', questions: [
    'Does any file implement health-check endpoints, watchdog timers beyond WebSocket heartbeat, or external monitoring hooks (Prometheus, Datadog, Sentry)? Cite file:line.',
    'Is there any structured logging (JSON output with module name, timestamp, correlation IDs) or just console.log statements? Cite representative log calls file:line.',
    'Does any file persist trade history to a real database (SQLite, Postgres, Mongo for trades not patterns)? Cite file:line or state JSON files only.',
    'Is there a kill-switch beyond ENABLE env vars — something that can immediately halt trading mid-run from outside the process (file flag, HTTP endpoint, signal handler)? Cite file:line.',
  ]},
];

let doc = `# Pre-Apex Audit V2 Part 2 — Forward-Looking Architecture
**Date:** ${new Date().toISOString().split('T')[0]}
**Mode:** Agentic (ReAct loop with grep/open_file/get_chunk/list_files)
**Purpose:** Verify what exists vs what is vapor for post-Apex roadmap
**Tool:** Mercury-2 via trai_brain/mercury-bridge/ask.js --agentic
**Blocks:** M through V (multi-broker, multi-asset, arbitrage, TRAI, patterns, hot-swap, Pine, PID, SaaS, ops)

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
