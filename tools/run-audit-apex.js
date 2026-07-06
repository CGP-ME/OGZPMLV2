require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const auditDoc = path.join(__dirname, '..', 'ogz-meta', 'ledger', 'apex-readiness-audit-2026-04-12.md');

function askMercury(question) {
  try {
    const result = execSync(
      `node trai_brain/mercury-bridge/ask.js "${question.replace(/"/g, '\\"').replace(/'/g, "\\'")}"`,
      { cwd: '/opt/ogzprime/OGZPMLV2', timeout: 120000, encoding: 'utf8' }
    );
    const answerMatch = result.match(/═══ ANSWER ═══\n([\s\S]*?)(?:\[latency:|$)/);
    return answerMatch ? answerMatch[1].trim() : 'No answer extracted';
  } catch (e) {
    return 'ERROR: ' + e.message.substring(0, 300);
  }
}

let doc = '# OGZPrime Apex Readiness Audit\\n';
doc += '**Date:** 2026-04-12\\n';
doc += '**Purpose:** Apex evaluation deployment readiness — single-account reliability, risk, durability\\n';
doc += '**Tool:** Mercury-2 RAG\\n\\n---\\n\\n';

const sections = [
  { title: 'SECTION 1 — SINGLE-ACCOUNT EXECUTION RELIABILITY', questions: [
    'In the full trading loop from market data ingestion to order placement, are there any unhandled promise rejections or async operations without error handling that could crash the loop?',
    'What happens in TradingLoop when the broker WebSocket disconnects mid-cycle? Does the loop recover automatically or hang?',
    'What happens in OrderExecutor when an order placement API call times out? Does the order state get reconciled correctly?',
    'Are there any process.exit() calls in the core trading path? List each one and its trigger condition',
    'Does the bot handle SIGINT and SIGTERM cleanly — flush state, close positions, disconnect broker, exit without corrupting state files?',
  ]},
  { title: 'SECTION 2 — STATE PERSISTENCE AND RECOVERY', questions: [
    'How does StateManager persist state between bot runs? File location, format, write frequency, crash-safety',
    'If the bot crashes during an open position, does it recover the position from broker state plus local state on restart?',
    'Is there any in-memory state in the trading path that is not persisted to disk?',
    'Are balance and positions reconciled against the broker on startup, or does the bot trust its local state file only?',
  ]},
  { title: 'SECTION 3 — ALPACA ADAPTER DEPTH', questions: [
    'Does AlpacaAdapter handle Alpaca order status lifecycle — new, accepted, filled, partially_filled, canceled, rejected, expired? Are all states mapped?',
    'What does AlpacaAdapter do when Alpaca returns a 429 rate limit response?',
    'Does isTradeableNow() correctly block trades outside regular trading hours for stocks?',
  ]},
  { title: 'SECTION 4 — RISK MANAGEMENT AND DRAWDOWN', questions: [
    'Where is max account drawdown enforced? Is there a hard circuit breaker that halts trading before a configurable drawdown limit?',
    'What happens if StateManager reports a drawdown exceeding the configured threshold? Does the bot stop trading or just warn?',
    'Is daily loss limit enforced separately from total drawdown limit?',
    'Is there logic for trailing drawdown where the high-water-mark moves up and the drawdown line chases it?',
  ]},
  { title: 'SECTION 5 — STRATEGY STACK VALIDATION', questions: [
    'Which strategies in the StrategyOrchestrator have validated exit contracts in ConfigLoader?',
    'Is there a way to restrict the orchestrator to only run a curated subset of strategies via SOLO_STRATEGY env var?',
    'Do validated exit contracts persist across restarts without drift?',
  ]},
  { title: 'SECTION 6 — BACKTEST FRAMEWORK HONESTY', questions: [
    'Does the backtest engine use the same code path as live trading for strategy evaluation and exit contract resolution?',
    'Does the backtester simulate fees and slippage correctly for stock trading?',
    'Is the per-trade equity accounting from the March 28 refactor propagated through both backtest and live code paths?',
  ]},
  { title: 'SECTION 7 — MULTI-WEEK OPERATIONAL DURABILITY', questions: [
    'Are there any unbounded data structures in the running bot that grow forever and could cause memory issues over weeks?',
    'Does the bot log to disk with rotation or bounded log size?',
    'Does the WebSocket reconnection logic have exponential backoff with a ceiling?',
    'Is there a heartbeat or health check mechanism that alerts if the bot silently stops trading?',
  ]},
  { title: 'SECTION 8 — APEX-SPECIFIC RULES', questions: [
    'Does the bot enforce any consistency rule limiting single-day profit contribution percentage?',
    'Does the bot respect prohibited strategy types like martingale or grid trading?',
    'Is there a configuration surface for Apex parameters like daily loss limit, max drawdown, minimum trading days, and profit target?',
  ]},
  { title: 'SECTION 9 — PATTERN MEMORY DURING EVAL', questions: [
    'Does pattern memory write to disk during live trading or only in-memory?',
    'Does logPatternResult currently capture realized R-multiple data?',
    'Is pattern memory write safe under concurrent access?',
  ]},
  { title: 'SECTION 10 — CLONEABILITY', questions: [
    'List every singleton or process-global state in the codebase that would collide if two bot instances ran simultaneously',
    'Are there hardcoded file paths that would prevent running two instances on the same machine?',
  ]},
];

let qNum = 0;
const totalQ = sections.reduce((s,sec) => s + sec.questions.length, 0);

for (const sec of sections) {
  doc += '## ' + sec.title + '\\n\\n';
  for (const q of sec.questions) {
    qNum++;
    console.log('[' + qNum + '/' + totalQ + '] ' + q.substring(0, 80) + '...');
    const answer = askMercury(q);
    doc += '### Q' + qNum + ': ' + q + '\\n\\n' + answer + '\\n\\n---\\n\\n';
    fs.writeFileSync(auditDoc, doc.replace(/\\n/g, '\n'));
  }
}

doc += '\\n## AUDIT COMPLETE\\n\\n**Total questions:** ' + qNum + '\\n**Generated:** ' + new Date().toISOString() + '\\n';
fs.writeFileSync(auditDoc, doc.replace(/\\n/g, '\n'));
console.log('\\nApex audit complete. ' + qNum + ' questions. Saved to ' + auditDoc);
