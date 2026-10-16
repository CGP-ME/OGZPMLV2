'use strict';
// Executes the unchanged boundary call plus new receipt fields from immutable
// OrderExecutor source. Broker execution/applyFill are explicit fixture inputs.
const cp = require('node:child_process');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const tree = process.env.MERCURY_HARNESS_TREE;
assert.match(tree, /^[a-f0-9]{40}$/);
const source = cp.execFileSync('git', ['show', `${tree}:core/OrderExecutor.js`], {encoding:'utf8'});
const calls = [...source.matchAll(/this\.ctx\.riskManager\.recordTradeResult\(\{[\s\S]*?\}\);/g)].map(m => m[0]);
assert.equal(calls.length, 2, 'both production close directions');
module.exports = function feedExit(riskManager, trade, closeResult, options = {}) {
  const short = options.short === true;
  const context = {
    ctx: {riskManager, paperTrading: options.paper === true, backtestMode: options.backtest === true},
    isWebhookExecutionRoute: options.webhook === true,
    buyTrade: trade, shortTrade: trade, closeResult,
    symbol: trade.symbol, pnl: options.grossPnl,
    longResultPnlDollars: options.grossPnl, longResultPnlPercent: options.percent,
    longResultStrategy: trade.strategy, shortResultPnlDollars: options.grossPnl,
    shortResultStrategy: trade.strategy, completeTradeResult: {pnl: options.percent},
    _firstFiniteNumber: value => Number.isFinite(value) ? value : null,
  };
  vm.runInNewContext(calls[short ? 1 : 0], context);
  return riskManager.pnlTracker.tradeHistory.at(-1);
};
