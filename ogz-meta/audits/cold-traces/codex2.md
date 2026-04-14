Forensic Report — Single Trade Lifecycle (Entry → Exit)
Scope: Source-code trace only, no docs/prior audit framing used.

Method (what I actually traced)
I traced from TradingLoop decision creation into OrderExecutor.executeTrade(), then into StateManager mutation paths, and then through exit/recording/learning modules (ExitContractManager, MaxProfitManager, BacktestRecorder, TradeJournal, TradeJournalBridge, UnifiedPatternMemory, TRAIDecisionModule).

Q1) BUY open: fields set, owners of per-trade state, modules holding references
VERIFIED IN SOURCE — Trade object fields set at open
OrderExecutor calls stateManager.openPosition(adjustedPositionSize, price, context) with a context containing orderId, confidence, patterns, indicators, entryTime, strategy fields, exitContract, and ledger data.

StateManager.openPosition() constructs and stores a trade object with:

id, action, type, direction

sizeUsd, size

price, entryPrice

entryFee

entryTime, timestamp

status

then spreads all context fields into that same object (...context).

So the resulting per-trade record in activeTrades includes the base fields above plus context extras such as exitContract, entryStrategy, patterns, entryIndicators, etc.

VERIFIED IN SOURCE — Modules owning per-trade state
StateManager: canonical open-trade map state.activeTrades (Map<orderId,trade>), persisted to disk outside backtest mode.

MaxProfitManager: separate singleton-style internal state (this.state) for one managed position at a time (active, entryPrice, remainingSize, tiers, etc.), not keyed by tradeId.

DynamicTrailingStop (inside ExitContractManager): mutates trade object field trade.maxProfitPercent; also has its own tradeState map (present but not used in shown flow).

TradeJournal: openTrades map and completed trades array (if bridge wiring reaches it).

VERIFIED IN SOURCE — Modules that hold a reference to the trade object
TradingLoop pulls activeTrades via stateManager.getAllTrades(); those are direct values from the Map (object refs), then passes each activeTrade into exit modules.

ExitContractManager.updateMaxProfit(activeTrade, price) forwards to trailing module which mutates the same object (trade.maxProfitPercent).

OrderExecutor reads buyTrades = stateManager.getAllTrades().filter(...), then uses selected trade object for close/reporting paths.

Q2) Partial exit trace: decision → execution → mutations → missing mutations
VERIFIED IN SOURCE — Exit decision origin
Partial/full profit-side exits originate from MaxProfitManager.update(...) inside TradingLoop step 1. If result action is exit_partial or exit_full, loop builds SELL/COVER decision with exitSize and exitReason.

VERIFIED IN SOURCE — Payload passed downstream
Decision contains at least:

action (SELL/COVER)

exitSize (profitResult.exitSize)

exitReason (profitResult.reason)

confidence fields.
No tradeId is attached in this MaxProfit path (unlike contract exit path).

VERIFIED IN SOURCE — What downstream does
In SELL branch, OrderExecutor determines partial close only if decision.exitSize > 0 && decision.exitSize < 1, treating exitSize as fraction, then computes partialSize = positionAmount * decision.exitSize and calls stateManager.closePosition(price, isPartialClose, partialSize, ...).

VERIFIED IN SOURCE — Key mismatch (unit contract)
MaxProfitManager emits absolute size for partials:

BE block returns exitSize: scaleOutSize where scaleOutSize = remainingSize * scaleOutFraction.

Tier block returns exitSize: tierExit.exitSize where exitSize = originalSize * tier.exit.
So emitted exitSize is not 0..1 fraction; it is absolute units (here USD-sized position units).

VERIFIED IN SOURCE — State mutated
MaxProfitManager mutates its own internal remainingSize, realizedPnL, completed tiers before emitting partial signal.

StateManager.closePosition removes the trade from activeTrades and updates aggregate position/inPosition/realizedPnL/totalPnL via updateState().

VERIFIED IN SOURCE — What is NOT mutated (but expected for real partial close)
StateManager.closePosition ignores size argument and always uses full trade size (closeSize = abs(tradeSizeUsd)).

It removes the trade from activeTrades immediately by tradeId, even when partial=true.

It does not write back reduced trade.sizeUsd or maintain leg-level remainder in active trade record. (No such mutation path exists in function body.)

Q3) Does multi-leg lifecycle exist?
VERIFIED IN SOURCE — Intent exists
There is explicit “tiered/partial” intent:

MaxProfitManager emits exit_partial.

OrderExecutor has a “partial close” branch condition.

StateManager signature has partial and size params.

VERIFIED IN SOURCE — Where it breaks down
A true multi-leg lifecycle (entry → multiple partial exits → final close) breaks due to combined contract failures:

Unit mismatch: MaxProfit emits absolute exitSize; OrderExecutor expects fractional exitSize (<1).

StateManager full-close behavior even when partial requested: ignores size, removes trade from map, closes full amount by trade size.

Single-position MaxProfit state (not per trade) while config allows multiple positions (maxPositions=3).

Net: current implementation is effectively one-shot close semantics in core state even when partial signals are emitted.

Q4) Caller vs callee contract audit
StateManager.closePosition
Caller assumption: can pass partial and size for partial closure.

Actual behavior: computes close size from full trade (trade.sizeUsd||trade.size), does not use size parameter, removes trade from active map immediately.
Status: VERIFIED IN SOURCE mismatch.

MaxProfitManager update/exit emission
Caller assumption in TradingLoop: exitSize forwarded to executor for proportional close path.

Actual emission: exitSize is absolute size; manager mutates its own internal size regardless of StateManager outcome.
Status: VERIFIED IN SOURCE mismatch.

TradeJournal.recordExit
Caller assumption (bridge): exit record has type==='exit', id/orderId, reason, etc., then journal consumes and removes open trade on that orderId.

Actual upstream in OrderExecutor: logTrade payload sets type from completeTradeResult.action (spread from buy trade, usually 'BUY'), not 'exit', so bridge exit interception condition can fail silently.
Status: VERIFIED IN SOURCE mismatch.

Pattern memory / learning outcome recording
UnifiedPatternMemory: called once in SELL full-close path with reconstructed features and outcome; keyed by feature signature, no tradeId dedupe semantics in recordOutcome.

TRAI module: learning feedback path keyed via pending map in OrderExecutor using buyTrade.orderId; consumed and deleted on first close path invocation.
Status: VERIFIED IN SOURCE; no multi-leg-aware dedupe/aggregation found in these paths.

BacktestRecorder.recordTrade
Caller assumption: called on close event with full trade summary.

Actual behavior: each call appends standalone trade record, increments tradeNumber, updates balance immediately; no parent-trade leg aggregation or partial leg merging mechanism present.
Status: VERIFIED IN SOURCE.

Q5) Silent emitter/consumer mismatches
Unit mismatch (fraction vs absolute): MaxProfit exitSize absolute, OrderExecutor partial gate expects fraction <1.

Field/lifecycle mismatch: TradingLoop sometimes sets tradeId for contract exits, but MaxProfit exit decision omits it; OrderExecutor SELL ignores decision.tradeId and picks oldest BUY trade anyway.

Event shape mismatch: TradeJournalBridge only records exit when exitRecord.type==='exit'; OrderExecutor sends different type semantics (often 'BUY' inherited).

Type-coercion gate: decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1 drops valid absolute sizes >1 into full-close path without explicit warning.

All above are VERIFIED IN SOURCE.

Q6) Bugs found (ranked)
Critical
Partial close pipeline non-functional end-to-end (unit + close semantics).

**StateManager closes/removes full trade even on partial request.**

Multi-position wrong-trade close risk: SELL path closes earliest BUY, ignores explicit trade selection fields.

High
**Global MaxProfitManager state used while multiple positions allowed (max 3).**

**Trade journal exit interception likely bypassed by payload type mismatch.**

Medium
Inconsistent position-size feed into MaxProfitManager start: manager started with positionSize while actual opened size is adjustedPositionSize (confluence multiplier).

Q7) Intentional patterns producing undefined behavior
Shared singleton/global manager pattern for per-trade logic: MaxProfitManager has one mutable state, but loop iterates per trade; behavior becomes ambiguous with concurrent trades.

Dual state systems for same lifecycle concepts: trade-level maxProfitPercent on trade objects (ExitContract path) vs internal maxProfitPercent/remainingSize in MaxProfitManager; coordination is implicit and not reconciled at close.。

Both are VERIFIED IN SOURCE.

Q8) Evidence of incremental design collisions
One-shot close model vs tiered/multi-leg model coexistence without unified contract: signatures and comments suggest partial support, but concrete close code is full-trade-centric.

**Telemetry/journal integrations patched by bridge monkey-patching bot.logTrade and bot.executeTrade, while core executor emits payloads in another schema.**

Multiple mental models of “size”: USD scalar in StateManager and BacktestRecorder, but legacy comments/fields still imply asset units/BTC in some journal formatting and logging math.。

All VERIFIED IN SOURCE.

Contradiction statement
I did not use prior audits. Based on source alone, I can state explicitly: the current code does not implement a reliable multi-leg partial-exit lifecycle despite modules that appear to intend it. That conclusion is from actual call-path and mutation behavior above, not prior framing.

UNCERTAINTIES (what would resolve)
Runtime wiring certainty for TradeJournalBridge exit path depends on actual bot.logTrade implementation attached at runtime (bridge patches whatever is present). Static source shows a likely schema mismatch, but live object wiring could alter behavior. Resolvable by runtime trace logs around bridge interception and payload shape.

Testing / checks run

✅ rg --files | head -n 200

✅ rg -n "OrderExecutor|StateManager|MaxProfitManager|TradeJournal|BacktestRecorder|closePosition|recordExit|recordTrade|exitSize" ...

✅ nl -ba core/OrderExecutor.js | sed -n '1,1120p'

✅ nl -ba core/TradingLoop.js | sed -n '120,280p'

✅ nl -ba core/StateManager.js | sed -n '1,980p'

✅ nl -ba core/MaxProfitManager.js | sed -n '1,1140p'

✅ nl -ba core/ExitContractManager.js | sed -n '1,360p'

✅ nl -ba core/exit/StopLossChecker.js | sed -n '1,260p'

✅ nl -ba core/exit/BreakEvenManager.js | sed -n '1,260p'

✅ nl -ba core/exit/DynamicTrailingStop.js | sed -n '1,280p'

✅ nl -ba core/TradeJournal.js | sed -n '1,320p'

✅ nl -ba core/TradeJournalBridge.js | sed -n '1,300p'

✅ nl -ba core/BacktestRecorder.js | sed -n '1,360p'

✅ nl -ba core/UnifiedPatternMemory.js | sed -n '180,320p'

✅ nl -ba core/TRAIDecisionModule.js | sed -n '800,1080p'

✅ git status --short (no code changes made).