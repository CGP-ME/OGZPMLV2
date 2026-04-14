Forensic Trade-Lifecycle Report (Source-Only, Fresh Read)
I traced one concrete path: BUY entry → active trade state → SELL/COVER exit path(s) across TradingLoop, OrderExecutor, StateManager, exit managers, and recorders.
I did not use prior audits/docs; this is from code flow only.

Entry-to-Exit Call Graph (what literally runs)
TradingLoop._analyze() builds a decision, then calls ctx.executeTrade(...) when action is not HOLD. decision.ledgerData is attached before dispatch. 

run-empire-v2 delegates executeTrade(...) to OrderExecutor.executeTrade(...). 

OrderExecutor.executeTrade(...) simulates/routes order, builds unifiedResult, and on BUY calls stateManager.openPosition(...) with rich context including exitContract, entryStrategy, indicators/patterns, ledger data. 

StateManager.openPosition(...) creates trade object, stores it in state.activeTrades Map, updates scalar/account fields (position, positionCount, entryPrice, realizedPnL, inPosition, etc.). 

On later candles, TradingLoop iterates activeTrades, runs exitContractManager.updateMaxProfit(...), then checks exitContractManager.checkExitConditions(...), then optionally maxProfitManager.update(...); either can produce close decisions. 

OrderExecutor handles exit action (SELL/COVER), picks trade from stateManager.getAllTrades(), records telemetry/analytics, and calls stateManager.closePosition(...). 

StateManager.closePosition(...) requires tradeId/orderId, computes PnL from selected trade, deletes trade from active map, updates state fields, writes decision ledger outcome if present. 

Q1) BUY open: fields set, state owners, who holds references
Trade fields set at open (VERIFIED IN SOURCE)
StateManager.openPosition constructs:

IDs/identity: id, action, type, direction

sizing/price/time: sizeUsd, size, price, entryPrice, entryFee, entryTime, timestamp

lifecycle/status: status: 'open'

plus all context spread (...context) from caller (includes orderId, confidence, patterns, entryIndicators, entryStrategy, exitContract, ledgerData, etc.). 

If ledgerData exists, it also attaches trade.decisionLedger = createLedgerSkeleton(...). 

Modules owning per-trade state (VERIFIED IN SOURCE)
Primary owner: StateManager.state.activeTrades (Map(orderId -> trade object)). 

Scalar compatibility state (position, entryPrice, etc.) also updated in StateManager.state. 

MaxProfitManager has single internal position state, not per-trade map. 

Who holds references to the same trade object (VERIFIED IN SOURCE)
StateManager.activeTrades holds canonical object. 

getAllTrades() returns Array.from(values()) (no clone), so callers receive object references. 

TradingLoop iterates those references as activeTrade and passes to exit managers; updateMaxProfit mutates the object (trade.maxProfitPercent). 

OrderExecutor also pulls these references via getAllTrades() before close paths. 

Q2) Partial exit trace (decision → execution → mutation)
Where partial exit originates (VERIFIED IN SOURCE)
In TradingLoop, partial-capable signal comes from maxProfitManager.update(...) when action is exit_partial or exit_full. Decision payload sets:

action: SELL or COVER

exitSize: profitResult.exitSize

exitReason: profitResult.reason 

MaxProfitManager.update emits exit_partial from:

BE scale-out path (be_scaleout) returning exitSize: scaleOutSize

tier path (profit_tier_n) returning exitSize: tierExit.exitSize 

Payload semantics downstream (VERIFIED IN SOURCE)
In OrderExecutor SELL path:

Partial is detected only if decision.exitSize > 0 && decision.exitSize < 1.

Then partialSize = positionAmount * decision.exitSize.

Calls stateManager.closePosition(price, isPartialClose, partialSize, ...). 

State mutated where (VERIFIED IN SOURCE)
StateManager.closePosition computes with closeSize = abs(tradeSizeUsd) (full trade size), deletes trade from map, updates position, realizedPnL, etc. 

What is NOT mutated but expected (VERIFIED IN SOURCE)
Requested partial size is ignored. size param is never used for closeSize; full trade size is always used. 

Partial flag does not preserve trade in active map. trade is deleted unconditionally by tradeId branch. 

exitSize unit mismatch: MaxProfit emits absolute size, but executor treats partial only if <1 (fraction). Large USD exits become full closes. 

Q3) Does multi-leg lifecycle exist?
Verdict: No, not end-to-end (VERIFIED IN SOURCE)
There is an intentional multi-leg design in MaxProfitManager (tiers, remaining size, completed tiers), but the execution/state pipeline collapses it into full close behavior.

Breakpoints:

Emission supports partial (exit_partial, remainingSize, tiers). 

Executor partial check expects fractional exitSize < 1, not absolute quantity. 

StateManager.closePosition ignores passed partial size and closes full trade record. 

TradeJournal.recordExit is one-shot per orderId and deletes open trade entry on exit event. 

So: one entry + multiple exits is modeled in one module, but not preserved through execution/state/journal contracts.

Q4) Caller-vs-callee contracts
A) StateManager.closePosition
Caller assumes: supports partial by passing (partial, size). 

Actually does: requires tradeId; computes close on full trade size (closeSize = tradeSizeUsd), deletes trade, ignores size arg in PnL/close amount. 

VERIFIED IN SOURCE

B) MaxProfitManager update/exit emission
Caller assumes: update can drive full/partial exits, returns exitSize usable by executor. 

Actually does: returns absolute size (scaleOutSize / tier.exitSize), with internal single-position state (this.state), not keyed per trade. 

VERIFIED IN SOURCE

C) TradeJournal.recordExit
Caller assumption via bridge: exit events will be passed in and recorded. 

Actually in bridge: only records when exitRecord.type === 'exit'. 

But executor sends type as action (BUY from original trade object fallback), not 'exit'. 

Also, recordExit is terminal per orderId (deletes open trade entry). 

VERIFIED IN SOURCE

D) Pattern memory / learning outcome recording
patternChecker.recordPatternResult(...) and UnifiedPatternMemory.recordOutcome(...) are called on SELL path after close. 

TRAI memory (recordTradeOutcome) is called only if pending TRAI decision exists for this orderId. 

PatternMemoryBank.recordTradeOutcome updates aggregate stats and appends telemetry. 

VERIFIED IN SOURCE

E) BacktestRecorder.recordTrade
Caller sends: stopLoss: exitContract.stopLossPercent, takeProfit: ...takeProfitPercent. 

Recorder fallback reads: trade.exitContract?.stopLoss / takeProfit (different names) if direct fields absent. 

VERIFIED IN SOURCE (mismatch is masked when caller passes direct stopLoss field).

Q5) Silent mismatches found
Unit mismatch (fraction vs absolute) in partial close (exitSize).

MaxProfit returns absolute size; executor interprets partial only if <1.

Result: most partial intents treated as full close.
VERIFIED IN SOURCE. 

Field-name mismatch (stopLossPercent vs stopLoss) in BacktestRecorder fallback path.
VERIFIED IN SOURCE. 

Lifecycle mismatch (multi-leg intent vs one-shot close).

Multi-tier engine exists, but state/journal close semantics are terminal per trade id.
VERIFIED IN SOURCE. 

Type/truthiness fragility: isPartialClose = decision.exitSize && ... depends on truthy numeric and <1 heuristic; not explicit type/unit contract.
VERIFIED IN SOURCE. 

Q6) Bugs found (ranked)
Critical
Partial close is functionally broken in state layer (size ignored, full trade always closed).

VERIFIED IN SOURCE

Single MaxProfitManager instance used across potentially multiple active trades (maxPositions supports >1).

One mutable this.state; trading loop iterates trades but calls same manager state.

VERIFIED IN SOURCE

Live order routing can reject short/cover actions (sell_short/cover invalid in router expecting buy/sell).

VERIFIED IN SOURCE

High
TradeJournalBridge exit capture likely never fires (type==='exit' gate mismatched with emitted payload).

VERIFIED IN SOURCE

Backtest forced close call omits required tradeId/orderId, so close can fail at end-of-backtest.

VERIFIED IN SOURCE

Medium
MaxProfit-driven exit decision in TradingLoop does not attach tradeId, while exit-contract path does; in multi-position scenarios close target can drift to oldest trade in executor.

VERIFIED IN SOURCE

Q7) Intentional patterns that create undefined behavior
Shared singleton managers with mutable internal state in a loop over multiple trades (StateManager, ExitContractManager, MaxProfitManager).
MaxProfitManager is especially non-keyed per trade. 
VERIFIED IN SOURCE

Mixed ownership model (per-trade object in map + global scalar position/account compatibility fields) creates ambiguous source of truth. 
VERIFIED IN SOURCE

Q8) Evidence of incremental-build model collisions
Two mental models of size units coexist (USD absolute vs fraction-of-position expectations).

VERIFIED IN SOURCE

Exit ownership split: comments/config imply strategy-owned contracts + MaxProfit ownership, but runtime has both ECM and MPM issuing exits with different payload styles and targeting assumptions. 
VERIFIED IN SOURCE

Bridge/journal pipeline assumptions diverge from trade logger payload shape. 
VERIFIED IN SOURCE

Notes on “contradicting prior audits”
I did not consume any prior audits in this run, so I cannot directly “diff” against them. What I can assert is that the above findings are directly evidenced in current source lines.

Summary
BUY entry path is coherent into StateManager.openPosition, with rich trade context persisted in active trade map and optional decision ledger. 

Multi-leg/tiered exits are modeled but not reliably executed as multi-leg due to unit/contract mismatches and close semantics. 

Several cross-module contracts are silently mismatched (partial exits, journal exit capture, live short routing, backtest end-close call). 

Testing / checks run

✅ rg -n "closePosition|recordExit|MaxProfitManager|..."

✅ nl -ba core/TradingLoop.js | sed -n '1,430p'

✅ nl -ba core/OrderExecutor.js | sed -n '1,1250p'

✅ nl -ba core/StateManager.js | sed -n '260,620p'

✅ nl -ba core/MaxProfitManager.js | sed -n '1,1160p'

✅ nl -ba core/ExitContractManager.js | sed -n '1,340p'

✅ nl -ba core/TradeJournalBridge.js | sed -n '56,220p'

✅ nl -ba core/TradeJournal.js | sed -n '96,240p'

✅ nl -ba core/BacktestRecorder.js | sed -n '1,170p'

✅ nl -ba core/BacktestRunner.js | sed -n '108,140p'

✅ nl -ba core/OrderRouter.js | sed -n '96,190p'

No code changes were made.