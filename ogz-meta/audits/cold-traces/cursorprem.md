Forensic Trade Lifecycle Report (fresh source trace)
Scope followed exactly from source: entry in TradingLoop → OrderExecutor → StateManager → exit path via ExitContractManager/MaxProfitManager → close path integrations.

Q1) BUY open: what is set, and who owns trade state
Trade open call graph (VERIFIED IN SOURCE)
TradingLoop decides entry and calls executeTrade:


TradingLoop.js
Lines 267-325
if (decision.action !== 'HOLD') {
  // ...
  decision.ledgerData = {
    // ...
  };
  await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult);
}
OrderExecutor builds open-position context and calls StateManager.openPosition(...):


OrderExecutor.js
Lines 273-286
const positionResult = await stateManager.openPosition(adjustedPositionSize, price, {
  orderId: unifiedResult.orderId,
  confidence: decision.confidence,
  patterns: patterns || [],
  entryIndicators: indicators,
  entryTime: this.ctx.marketData?.timestamp || Date.now(),
  signalBreakdown: orchResult?.signalBreakdown || null,
  bullishScore: orchResult?.bullishScore || 0,
  bearishScore: orchResult?.bearishScore || 0,
  reasoning: orchResult?.reasoning || '',
  entryStrategy: entryStrategy,
  exitContract: exitContract,
  ledgerData: decision.ledgerData || null,
});
StateManager.openPosition instantiates the trade object and stores it in activeTrades:


StateManager.js
Lines 346-362
const tradeId = context.orderId || `TRADE_${Date.now()}`;
const tradeAction = context.action || 'BUY';
const trade = {
  id: tradeId,
  action: tradeAction,
  type: tradeAction,
  direction: tradeDirection,
  sizeUsd: size,
  size: size,
  price: price,
  entryPrice: price,
  entryFee: entryFee,
  entryTime: Date.now(),
  timestamp: Date.now(),
  status: 'open',
  ...context
};

StateManager.js
Lines 383-388
if (!this.state.activeTrades) {
  this.state.activeTrades = new Map();
}
this.state.activeTrades.set(tradeId, trade);
Fields set on trade object at open (VERIFIED IN SOURCE)
Core fields from StateManager: id, action, type, direction, sizeUsd, size, price, entryPrice, entryFee, entryTime, timestamp, status.
Then merged context adds: orderId, confidence, patterns, entryIndicators, entryTime (can overwrite), signalBreakdown, bullishScore, bearishScore, reasoning, entryStrategy, exitContract, ledgerData.
If ledgerData exists, decisionLedger is attached at birth:

StateManager.js
Lines 364-381
if (context.ledgerData) {
  const { createLedgerSkeleton } = require('./dto/DecisionLedgerSchema');
  trade.decisionLedger = createLedgerSkeleton({
    tradeId,
    // ...
  });
}
Modules that hold trade references (VERIFIED IN SOURCE)
StateManager: authoritative activeTrades: Map(orderId -> trade) (StateManager constructor + openPosition).
TradingLoop: per-candle references via getAllTrades() values.

TradingLoop.js
Lines 130-132
const allTrades = stateManager.getAllTrades();
const activeTrades = allTrades.filter(t => t.action === 'BUY' || t.action === 'SELL_SHORT');
ExitContractManager / DynamicTrailingStop: receives same trade reference and mutates trade.maxProfitPercent.

ExitContractManager.js
Lines 233-235
updateMaxProfit(trade, currentPrice) {
  return this.trailingStopChecker.updateMaxProfit(trade, currentPrice);
}

DynamicTrailingStop.js
Lines 73-81
const pnlPercent = isShort ? ... : ...;
trade.maxProfitPercent = Math.max(trade.maxProfitPercent || 0, pnlPercent);
OrderExecutor: obtains references via getAllTrades() and uses buyTrade/shortTrade locals during close.
KrakenAdapterV2 also reads/writes activeTrades via StateManager (separate path, not necessarily primary execution path).
StateManager.getAllTrades() returns raw object references (not clones):

StateManager.js
Lines 794-797
getAllTrades() {
  const trades = this.get('activeTrades');
  return trades ? Array.from(trades.values()) : [];
}
Q2) Partial-exit trace: decision → execution → mutation gaps
Where partial-exit decision originates (VERIFIED IN SOURCE)
MaxProfitManager.update() emits action: 'exit_partial' with exitSize:


MaxProfitManager.js
Lines 494-509
const tierExit = this.checkProfitTiers(currentPrice, profitPercent);
if (tierExit.shouldExit) {
  this.executePartialExit(tierExit);
  return {
    action: 'exit_partial',
    price: currentPrice,
    exitSize: tierExit.exitSize,
    remainingSize: this.state.remainingSize,
    reason: `profit_tier_${tierExit.tier}`,
TradingLoop consumes that and builds decision payload:


TradingLoop.js
Lines 184-192
if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
  decision = {
    action: isClosingShort ? 'COVER' : 'SELL',
    direction: 'close',
    confidence: orchResult.confidence,
    exitSize: profitResult.exitSize,
    exitReason: profitResult.reason
  };
What downstream modules do with payload (VERIFIED IN SOURCE)
OrderExecutor interprets decision.exitSize as a fraction in (0,1):


OrderExecutor.js
Lines 592-594
const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;
const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;
const closeResult = await stateManager.closePosition(price, isPartialClose, partialSize, {
But MaxProfitManager computes exitSize as absolute units (originalSize * tier.exit), not fraction:


MaxProfitManager.js
Lines 623-624
exitSize: this.state.originalSize * tier.exit,
State mutated where (VERIFIED IN SOURCE)
MaxProfitManager mutates internal state (remainingSize, realizedPnL, completed tiers).
OrderExecutor calls StateManager.closePosition(...).
StateManager.closePosition:
looks up trade by tradeId/orderId,
computes close size from full trade size,
removes trade from activeTrades,
updates position, inPosition, realizedPnL.

StateManager.js
Lines 448-458
const tradeId = context.tradeId || context.orderId;
if (!tradeId) { ... return { success: false, error: 'tradeId required for closePosition' }; }
const trade = this.state.activeTrades?.get(tradeId);
if (!trade) { ... return { success: false, error: `Trade ${tradeId} not found` }; }

StateManager.js
Lines 462-466
const tradeSizeUsd = trade.sizeUsd || trade.size;
const closeSize = Math.abs(tradeSizeUsd);

StateManager.js
Lines 487-491
if (tradeId && this.state.activeTrades.has(tradeId)) {
  this.state.activeTrades.delete(tradeId);
State NOT mutated that you’d expect for partial exits (VERIFIED IN SOURCE)
StateManager.closePosition does not use size argument to compute partial reduction.
Trade is deleted even when partial=true.
No surviving reduced-size trade is written back.
OrderExecutor resets MaxProfitManager after SELL, ending multi-tier progression.

OrderExecutor.js
Lines 910-913
if (this.ctx.maxProfitManager) {
  this.ctx.maxProfitManager.reset();
}
Q3) Multi-leg lifecycle (one entry → multiple exits → final close)
Conclusion: NOT functional end-to-end in current code path. VERIFIED IN SOURCE.

Mechanism exists at signal layer (MaxProfitManager emits exit_partial) but breaks in execution/state layer:

exitSize unit mismatch (absolute emitted, fraction expected).
StateManager.closePosition ignores partial size and closes full trade.
Trade removed from activeTrades immediately.
MaxProfitManager reset after close.
Net behavior: one entry → one close event in state, not true multi-leg persistence.

Q4) Caller-vs-implementation contracts
StateManager.closePosition
Caller assumption: supports partial close via (partial, size).
Actual: requires tradeId/orderId; computes closeSize from full trade; removes trade; partial size not applied to close amount.
VERIFIED IN SOURCE.
MaxProfitManager update/exit emission
Caller assumption in TradingLoop: exitSize can be forwarded to OrderExecutor as partial-close hint.
Actual emission: exitSize is absolute size in manager’s unit (originalSize * exit%), not normalized fraction.
VERIFIED IN SOURCE.
TradeJournal.recordExit
Expected contract: called from bridge on trade close.
Actual integration status:
bridge exit hook only patches bot.logTrade if it exists.
runtime class wiring passes standalone logTrade function into OrderExecutor context; no this.logTrade assignment found in run-empire-v2.js.
bridge entry hook expects bot.stateManager, but class uses module-level stateManager singleton constant.
Result: journal bridge assumptions do not match bot object shape.
VERIFIED IN SOURCE, with one caveat below.
Pattern outcome learning systems
Active path: OrderExecutor writes outcomes to:
patternChecker.recordPatternResult(...)
UnifiedPatternMemory.recordOutcome(...)
TRAI.recordTradeOutcome(...) → trai_core.recordTradeResult(...) → UnifiedPatternMemory.recordOutcome(...)
Legacy path: PatternMemoryBank exists but no instantiation found.
VERIFIED IN SOURCE.
BacktestRecorder.recordTrade
Caller assumption: payload includes entry/exit prices, size, direction, strategy, reason.
Actual: computes PnL from those fields and updates independent running balance.
Mismatch observed: stop/take keys consume stopLoss / takeProfit or exitContract.stopLoss/takeProfit; caller often supplies stopLossPercent/takeProfitPercent in exitContract object.
VERIFIED IN SOURCE.
Q5) Silent emitter/consumer mismatches
Unit mismatch: partial size

Emitter: MaxProfitManager.exitSize absolute.
Consumer: OrderExecutor expects fraction <1.
VERIFIED IN SOURCE (critical).
Partial close args dropped

Emitter/forwarder sets partial + size.
StateManager.closePosition ignores size in close math, closes full trade.
VERIFIED IN SOURCE (critical).
Trade selection mismatch

TradingLoop emits decision.tradeId from selected active trade.
OrderExecutor SELL path ignores decision.tradeId, chooses oldest BUY trade.
VERIFIED IN SOURCE (high risk with multiple active trades).
Bridge API shape mismatch

TradeJournalBridge expects bot.stateManager and bot.logTrade.
Bot wiring uses module-scope stateManager and passes logTrade as context function.
VERIFIED IN SOURCE.
Type/truthy masking

partial detection: decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1 (truthy + numeric checks hide 0/NaN/path issues).
drawdown guard uses truthy account values.
VERIFIED IN SOURCE.
Q6) Independent bugs ranked by severity
Critical
Partial exits do not execute as partials (unit mismatch + full-close implementation).
VERIFIED IN SOURCE
High
Trade targeting mismatch on exits (decision.tradeId emitted but ignored in SELL/COVER selection path).
VERIFIED IN SOURCE
Trade journal bridge integration mismatch (assumes bot members not wired the same way).
VERIFIED IN SOURCE
Backtest forced close calls closePosition without required tradeId/orderId.
StateManager requires ID; backtest close passes only { reason: ... }.
VERIFIED IN SOURCE
Medium
MaxProfitManager is single shared mutable state for all trades while loop iterates trade list.
VERIFIED IN SOURCE
MaxProfitManager starts with positionSize not adjustedPositionSize (confluence-sized entry differs from tracked size).
VERIFIED IN SOURCE
Trailing activation unit inconsistency (profitPercent * 100 compared against fallback minProfit=0.003).
VERIFIED IN SOURCE
Low
MaxProfitManager.getState() returns fields not sourced from this.state (this.currentStop etc.).
VERIFIED IN SOURCE
Validation conflict: StateManager.validateState() flags negative positions though short positions are used elsewhere.
VERIFIED IN SOURCE
Q7) Intentional patterns that produce undefined behavior
Shared singleton mutable state (StateManager, ExitContractManager, UnifiedPatternMemory, and one shared MaxProfitManager) with per-trade operations layered on top; this creates cross-trade coupling hazards.
VERIFIED IN SOURCE
Shallow state exposure (getState() spread copy still exposes mutable Map reference) enables out-of-band mutation.
VERIFIED IN SOURCE
Monkey-patch integration pattern in TradeJournalBridge depends on bot shape that is not consistently present.
VERIFIED IN SOURCE
Mixed direct mutation + atomic update path in StateManager.closePosition (deletes from activeTrades before updateState() lock/update).
VERIFIED IN SOURCE
Q8) Evidence of incremental, colliding mental models
Competing unit models (USD size vs base-asset size labels/expectations) across OrderExecutor, MaxProfitManager, BacktestRecorder, TradeJournalBridge.
VERIFIED IN SOURCE
Two lifecycle models collide:
model A: one-trade-close-per-signal with immediate cleanup;
model B: tiered multi-exit lifecycle with remaining position state. Execution layer implements A; profit manager emits B.
VERIFIED IN SOURCE
Legacy/new architecture overlap:
PatternMemoryBank present but not instantiated,
unified pattern memory actively used. VERIFIED IN SOURCE
Bridge assumes bot methods/properties that are no longer class members after refactors.
VERIFIED IN SOURCE
Uncertainty notes
UNCERTAIN: whether external runtime code (outside audited files) sets bot.stateManager/bot.logTrade dynamically before bridge wiring.
What resolves it: runtime object inspection at startup or search in additional entry files.
No prior audits or planning docs were used in this report. This is strictly what the current source code does.