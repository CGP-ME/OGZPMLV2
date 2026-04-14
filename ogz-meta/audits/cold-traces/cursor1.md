FORENSIC AUDIT REPORT: OGZPMLV2 Trading Bot
Q1: Trade Object Fields at Entry
VERIFIED IN SOURCE: When a BUY signal fires, the following chain executes:

TradingLoop._analyze() (line 324) calls this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult)
OrderExecutor.executeTrade() (line 44) receives these args and creates a unifiedResult at line 159-182 with fields: orderId, action, entryPrice, entryTime, size, confidence, patterns[], indicators{}
StateManager.openPosition() (line 325) creates the trade object at lines 348-362 with fields: id, action, type, direction, sizeUsd, size, price, entryPrice, entryFee, entryTime, timestamp, status, plus all fields from context spread at line 362 (which includes orderId, confidence, patterns, entryIndicators, entryTime, signalBreakdown, bullishScore, bearishScore, reasoning, entryStrategy, exitContract, ledgerData).
Modules that hold per-trade state:

Module	Storage	Evidence
StateManager (singleton)
state.activeTrades Map, keyed by orderId
Line 387: this.state.activeTrades.set(tradeId, trade)
MaxProfitManager (single instance)
this.state — one active trade at a time
Line 277-302: this.state = { active: true, entryPrice, direction, ... }
ExitContractManager.trailingStopChecker (DynamicTrailingStop)
Mutates trade.maxProfitPercent directly on the trade object
Line 80: trade.maxProfitPercent = Math.max(...)
PatternBasedExitModel (ctx.patternExitModel)
Internal tracking started at line 328
this.ctx.patternExitModel.startTracking(...)
TradeJournalBridge → TradeJournal
this.openTrades Map
Line 140: this.openTrades.set(record.orderId, record)
OrderExecutor
this.pendingTraiDecisions Map
Line 208: this.pendingTraiDecisions.set(unifiedResult.orderId, {...})
CRITICAL FINDING: MaxProfitManager is a single instance (not per-trade). It has one this.state object. If multiple positions are open (the system supports maxPositions > 1 per TradingLoop line 132), the second BUY's maxProfitManager.start() overwrites the first trade's tracking state. VERIFIED IN SOURCE at OrderExecutor.js:304 — this.ctx.maxProfitManager.start(price, 'buy', positionSize, {...}) — no trade ID passed, no per-trade keying.

Q2: Exit Decision Through Execution
VERIFIED IN SOURCE: There are two independent exit paths that produce exits:

Path A: ExitContractManager (safety exits)
Decision origin: TradingLoop._analyze() lines 143-167. For each active trade, calls exitContractManager.checkExitConditions(activeTrade, price, context).
Payload: Returns { shouldExit: true, exitReason, details, confidence }.
Decision construction: Line 160-166 builds decision = { action: 'SELL'/'COVER', direction: 'close', confidence, exitReason, tradeId }.
Execution: Line 324 — await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult).
OrderExecutor SELL path (line 506): Finds matching BUY trade from stateManager.getAllTrades() filtered by action === 'BUY', sorted by entryTime.
StateManager.closePosition() (line 594): Called with (price, isPartialClose, partialSize, { orderId, exitReason }).
State mutations: StateManager removes trade from activeTrades (line 488-501), updates position, realizedPnL, inPosition, totalPnL (lines 538-548).
Post-close cleanup: OrderExecutor line 905 — stateManager.removeActiveTrade(buyTrade.orderId) — this is a DOUBLE DELETE. StateManager.closePosition already deleted the trade from activeTrades at line 490. This second call silently no-ops because trades.has(orderId) returns false.
Path B: MaxProfitManager (profit exits)
Decision origin: TradingLoop._analyze() lines 171-195. Calls this.ctx.maxProfitManager.update(price, {...}).
Return: { action: 'exit_full'/'exit_partial', exitSize, reason, profitPercent }.
Decision construction: Line 186-193 builds decision = { action: 'SELL'/'COVER', direction: 'close', confidence, exitSize, exitReason: profitResult.reason }.
Execution: Same path to OrderExecutor.
STATE NOT MUTATED that you would expect:

VERIFIED IN SOURCE: When MaxProfitManager returns exit_partial, decision.exitSize is set (line 190). In OrderExecutor SELL path line 592: const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1. But MaxProfitManager's exitSize at line 503 is tierExit.exitSize which equals this.state.originalSize * tier.exit (line 623) — this is an absolute unit count (e.g., 30% of 500 = 150 USD), NOT a fraction 0-1. The partial-close check decision.exitSize < 1 will be FALSE for any position larger than $1 USD. Result: all "partial" exits from MaxProfitManager become full closes. This is a critical bug.

VERIFIED IN SOURCE: After a SELL, MaxProfitManager is fully reset at line 911 (this.ctx.maxProfitManager.reset()), destroying all tier tracking. Even if partial closes worked, the reset kills the state needed for subsequent tier exits.

Q3: Multi-Leg Trade Lifecycle
VERIFIED IN SOURCE: The system has the components for multi-leg exits but they do not connect into a working pipeline. Here is the trace:

MaxProfitManager tiered exits (internal)
MaxProfitManager has a complete internal tier system: setupProfitTiers() creates 4 tiers (lines 580-629), checkProfitTiers() returns { shouldExit: true, tier, exitSize } (lines 641-666), executePartialExit() marks tiers complete and reduces remainingSize (lines 676-704). This internal accounting works correctly in isolation.

Where it breaks down
Unit mismatch kills partial closes: MaxProfitManager returns exitSize as absolute USD (e.g., 150). OrderExecutor line 592 checks decision.exitSize < 1 to determine if it's partial. For any real position, this evaluates to false, so isPartialClose = false and partialSize = null. StateManager.closePosition receives partial=false, size=null and does a full close. The entire position is closed on the first tier.

MaxProfitManager reset on any SELL: OrderExecutor line 911 calls this.ctx.maxProfitManager.reset() unconditionally after any SELL. Even if the StateManager partial close somehow worked, the MaxProfitManager forgets all tier state.

StateManager.closePosition partial logic: Line 438 accepts partial flag, but when partial=false (which it always is due to the unit mismatch), it zeroes out entryPrice, entryTime, positionCount (line 541-542), and removes the trade from activeTrades (line 490).

TRAI pending decision destroyed on first exit: OrderExecutor line 900 — this.pendingTraiDecisions.delete(buyTrade.orderId). On a partial exit, the learning data for the remaining legs is lost.

TradeJournal.recordExit deletes open trade: Line 219 — this.openTrades.delete(exit.orderId). On first exit, the trade is gone from the journal's open trades. A second exit for the same orderId would log with no matching entry (line 170-171 creates a synthetic entry).

CONCLUSION: Multi-leg trade lifecycle is architecturally present but functionally broken. Every partial exit from MaxProfitManager becomes a full close due to the unit mismatch at OrderExecutor line 592. VERIFIED IN SOURCE.

Q4: Module Contracts — Caller Assumes vs. Module Does
StateManager.closePosition
Caller assumes (OrderExecutor line 594):

stateManager.closePosition(price, isPartialClose, partialSize, { orderId, exitReason })
Passes orderId in context object.

Module actually does (StateManager line 448): Reads context.tradeId || context.orderId. OrderExecutor passes orderId, and context.tradeId is undefined, so it falls through to context.orderId. This works correctly. But: the caller passes buyTrade.orderId, which it found by filtering all trades with action === 'BUY' and taking the first (line 514-516). If there are multiple BUY trades, the oldest one is always closed, not necessarily the one that triggered the exit. VERIFIED IN SOURCE.

MaxProfitManager update/exit emission
Caller assumes (TradingLoop line 184): Returns { action: 'exit_full'|'exit_partial', exitSize, reason } where exitSize is a fraction 0-1.

Module actually returns (MaxProfitManager line 500-509): exitSize: tierExit.exitSize where exitSize = this.state.originalSize * tier.exit (line 623). The originalSize is set from the size parameter to start(). At OrderExecutor line 304: this.ctx.maxProfitManager.start(price, 'buy', positionSize, {...}) — positionSize is USD (e.g., $500). So exitSize = 500 * 0.30 = 150. This is absolute USD, not a fraction. Mismatch confirmed.

Additionally: MaxProfitManager's update() returns exit_partial for BE scale-out (line 456-466) with exitSize: scaleOutSize which is also absolute. Same mismatch.

TradeJournal.recordExit
Caller assumes (TradeJournalBridge line 138): Passes { orderId, exitPrice, reason, pnl, fees, balance, ... }.

Module actually does (TradeJournal line 162): Looks up this.openTrades.get(exit.orderId) and deletes it (line 219). No concept of partial exits. Any call to recordExit finalizes the trade.

Pattern Memory / Learning System
Caller assumes (OrderExecutor lines 717-740): Calls patternChecker.recordPatternResult(features, { pnl, holdDurationMs, exitReason }) AND getUnifiedPatternMemory().recordOutcome(features, { pnl, pnlPercent, holdTimeMs, exitReason, strategy }).

Module actually does: Both calls use the trade's total pnl at the time of exit. If multi-leg exits worked, the first partial exit would record a partial PnL, and subsequent exits would record their own PnL. Each call creates a separate pattern outcome entry. No deduplication. VERIFIED IN SOURCE: UnifiedPatternMemory.recordOutcome (line 218-265) has no tradeId parameter and no concept of aggregating multiple outcomes for the same trade.

BacktestRecorder.recordTrade
Caller assumes (OrderExecutor line 565): Passes { entryTime, exitTime, direction, entryPrice, exitPrice, size, strategyName, confidence, exitReason, holdTimeMinutes, exitContract }.

Module actually does (BacktestRecorder line 36): Independently calculates P&L from entryPrice/exitPrice/direction/size. Updates its own this.balance. Does NOT read from StateManager. The BacktestRecorder has its own shadow balance that can drift from StateManager if fee calculations differ. BacktestRecorder uses this.feePerSide (line 43-44) uniformly, while StateManager.closePosition uses TradingConfig.get('fees.takerFee') (line 485). If makerFee !== takerFee, the balances diverge. VERIFIED IN SOURCE.

Q5: Silent Mismatches
1. Unit mismatch: exitSize (fraction vs absolute) — SEVERITY: CRITICAL
VERIFIED IN SOURCE:

MaxProfitManager returns exitSize as absolute USD (line 623: this.state.originalSize * tier.exit)
OrderExecutor line 592 treats it as fraction: decision.exitSize < 1
Result: All partial exits become full closes
2. Field name assumption: tradeId vs orderId — SEVERITY: LOW (works by fallback)
VERIFIED IN SOURCE: StateManager.closePosition line 448 reads context.tradeId || context.orderId. OrderExecutor passes orderId. Works via fallback. But the double-lookup means someone could break this by passing both.

3. Lifecycle assumption: MaxProfitManager is one-shot per trade — SEVERITY: HIGH
VERIFIED IN SOURCE: MaxProfitManager.start() (line 277) completely replaces this.state. It's a singleton instance shared across all trades. The system supports maxPositions > 1 (TradingLoop line 132), but MaxProfitManager can only track one position. Opening a second position silently destroys the first position's profit tracking.

4. Dual balance tracking: StateManager vs BacktestRecorder — SEVERITY: MEDIUM
VERIFIED IN SOURCE:

TradingLoop line 151: accountBalance: this.ctx.backtestRecorder?.balance — uses BacktestRecorder's balance for exit decisions.
StateManager has its own balance via getEquity().
BacktestRecorder.balance is updated by recordTrade() with its own fee math (line 62).
StateManager.balance is updated by closePosition() with different fee math.
In backtest mode, the account drawdown circuit breaker at StopLossChecker line 54 reads from BacktestRecorder's balance. The two balances can and will diverge.
5. Type coercion: confidence percentage vs decimal — SEVERITY: LOW
VERIFIED IN SOURCE: OrderExecutor line 63: const tradeConfidence = (rawConfidence > 1 ? rawConfidence / 100 : rawConfidence). This normalizes confidence to 0-1. But MaxProfitManager.start() at OrderExecutor line 306 passes confidence: decision.confidence / 100 where decision.confidence is already a percentage (e.g., 75). So MaxProfitManager gets 0.75. This is fine but fragile — one caller passes percentage, another normalizes. No consistent convention.

6. PnL calculation: percentage vs dollar — SEVERITY: LOW (currently consistent)
VERIFIED IN SOURCE: OrderExecutor line 546: pnl = ((price - buyTrade.entryPrice) / buyTrade.entryPrice) * 100 — percentage. Line 558: pnlDollars = buyTrade.size * ((price - buyTrade.entryPrice) / buyTrade.entryPrice) — dollars. Both are computed and passed downstream. BacktestRecorder (line 49-55) computes its own independently. Values match.

Q6: Bugs Found by Source Reading (Ranked by Severity)
BUG 1: Partial exits always become full closes — CRITICAL
File: OrderExecutor.js:592 Evidence: decision.exitSize < 1 is always false for real positions because exitSize is absolute USD (e.g., 150), not a fraction. Impact: The entire tiered exit system (4 profit tiers, BE scale-out) is dead code in practice. Every exit closes 100% of the position.

BUG 2: MaxProfitManager is a singleton that can only track one position — HIGH
File: MaxProfitManager.js:277, OrderExecutor.js:304 Evidence: maxProfitManager.start() replaces this.state entirely. System supports maxPositions > 1 via TradingConfig. Impact: Second position's entry destroys first position's profit tracking. The first position loses trailing stops, tier targets, and breakeven management.

BUG 3: MaxProfitManager reset after any SELL destroys state for remaining tiers — HIGH
File: OrderExecutor.js:911 Evidence: this.ctx.maxProfitManager.reset() called unconditionally after any SELL, even if it was supposed to be partial. Impact: Even if Bug 1 were fixed, the reset eliminates all tier state after the first exit.

BUG 4: SELL path always closes the oldest BUY, not the intended trade — MEDIUM
File: OrderExecutor.js:514-516 Evidence: buyTrades = stateManager.getAllTrades().filter(t => t.action === 'BUY').sort((a, b) => a.entryTime - b.entryTime); buyTrade = buyTrades[0] Impact: With multiple open positions, the exit always closes the oldest BUY. The decision.tradeId from TradingLoop line 165 is set but never used in the SELL path of OrderExecutor. OrderExecutor doesn't look at decision.tradeId — it does its own filter.

BUG 5: Double delete of activeTrade on close — LOW
File: OrderExecutor.js:905 vs StateManager.js:490 Evidence: stateManager.closePosition() already removes the trade from activeTrades at line 490. Then stateManager.removeActiveTrade(buyTrade.orderId) is called again at line 905. Impact: Silent no-op. Harmless but indicates confusion about ownership.

BUG 6: StateManager lock is not reentrant — MEDIUM
File: StateManager.js:1005-1026 Evidence: acquireLock() sets this.locked = true and queues waiters. releaseLock() at line 1021 sets this.locked = false then calls next(), which will re-acquire the lock. But next() resolves the promise, and then line 1015 sets this.locked = true after the waiter's code may have already started running. Impact: Under high concurrency (multiple rapid state updates), there's a race window between releaseLock calling next() and the next waiter setting this.locked = true. In Node.js single-threaded event loop this is less dangerous but can still cause issues with await interleavings.

BUG 7: value_usd calculation at OrderExecutor line 366 — LOW
Evidence: value_usd: positionSize * price. Since positionSize is already USD, this creates USD² (e.g., $500 × $90,000 = $45M). This is only for the proof logger, not trading logic. Impact: Proof logs have wildly inflated position values. Cosmetic/logging bug only.

BUG 8: TradeJournalBridge exit wiring uses wrong condition — MEDIUM
File: TradeJournalBridge.js:132 Evidence: if (exitRecord && exitRecord.type === 'exit') — but OrderExecutor's logTrade() (line 793-850) passes type: completeTradeResult.action || 'BUY', which is always 'BUY'. Never 'exit'. So the journal exit recording never fires through this bridge. Impact: TradeJournal receives entries but never receives exits. The journal's openTrades map grows forever, and trades array (completed) is never populated via the bridge. Dashboard journal stats show zero completed trades.

Q7: Architectural Patterns Producing Undefined Behavior
1. Shared singleton MaxProfitManager in a multi-position system
VERIFIED IN SOURCE: MaxProfitManager is constructed once (in run-empire-v2.js) and passed via ctx. TradingConfig allows maxPositions > 1. When two positions are open, maxProfitManager.update() in TradingLoop line 173 runs for the first active trade only (due to break at line 193 after an exit signal), but the MPM state belongs to whoever called start() last. The break-even, trailing, and tier logic for the non-last trade is silently lost.

2. Stale closure in TradeJournalBridge
VERIFIED IN SOURCE: TradeJournalBridge._wireTradeEvents() (line 70) captures bot.executeTrade via originalExecuteTrade = bot.executeTrade.bind(bot) and replaces it. If anything else later replaces bot.executeTrade, the bridge's interceptor becomes stale. The bridge also reads from bot.stateManager inside the wrapper (line 76), but bot.stateManager may not exist — the runner stores it differently as require('./StateManager').getInstance().

3. Async race: TRAI decision stored after trade may have already closed
VERIFIED IN SOURCE: TradingLoop line 103 calls _runTRAI() which is fire-and-forget (.then().catch()). The TRAI decision arrives asynchronously and is stored in this.ctx._lastTraiDecision. OrderExecutor line 206 reads it. If the TRAI response is slow and the trade exits before TRAI responds, the decision gets stored on the next trade, creating a cross-trade attribution error.

4. ExitContractManager and MaxProfitManager both manage exits independently
VERIFIED IN SOURCE: TradingLoop runs ECM checks first (line 146-154), then MPM checks (line 171-195). Both can return exit signals. Only the first break wins. If ECM says "hold" but MPM says "exit_partial", the partial exit fires. But if ECM says "exit" first, MPM never gets checked. These two systems have no coordination — they don't know about each other's decisions, stops, or state.

Q8: Colliding Mental Models
1. Per-trade equity accounting vs. global position scalar
VERIFIED IN SOURCE: StateManager maintains BOTH a position scalar (lines 88, 392, 399) AND per-trade entries in activeTrades Map. The position scalar is summed (positive for long, negative for short) while activeTrades stores individual trades. closePosition() line 530-534 tries to reconcile: finalPosition = noActiveTradesRemaining ? 0 : calculatedPosition. This is two mental models: one where position is a single number, and one where positions are individual tracked trades.

2. "No balance movement" accounting vs. legacy balance tracking
VERIFIED IN SOURCE: StateManager.openPosition (line 395-396) comments say "only entryFee affects realizedPnL on open - NO principal movement" (per-trade equity accounting model). But the system still has state.balance, state.totalBalance, state.inPosition — legacy balance tracking. validateState() at line 603 checks expectedTotal = balance + inPosition but balance never changes on open/close (only fees change realizedPnL). This means totalBalance drifts from reality.

3. OrderExecutor as both entry AND exit handler
VERIFIED IN SOURCE: OrderExecutor.executeTrade() handles BUY (line 219), SELL_SHORT (line 374), SELL (line 506), and COVER (line 929) in one 1100-line method. The SELL path (close long) re-derives the matching trade by filtering all active trades (line 514), while TradingLoop already knows which trade triggered the exit (decision.tradeId at line 165). The information is passed but ignored.

4. Three separate recording systems for the same trade
Three independent systems record trade outcomes:

BacktestRecorder (line 564-582): Own balance, own P&L math
TradeJournal via Bridge (line 70-176): Own open trades map, own stats
StateManager (line 594): Authoritative state
These were clearly built at different times. BacktestRecorder was built for backtesting, TradeJournal for live/dashboard, StateManager as "single source of truth." In practice, all three compute P&L independently and can disagree.

5. Two pattern memory systems
VERIFIED IN SOURCE: PatternMemoryBank (used by TRAI, this.ctx.trai.recordTradeOutcome() at line 860) and UnifiedPatternMemory (used by pipeline, getUnifiedPatternMemory().recordOutcome() at line 731) both record pattern outcomes on trade close. They use different hashing algorithms (PatternMemoryBank: JSON-serialize bucketed values; UnifiedPatternMemory: MD5 of quantized feature vector). The same trade creates two separate learning entries in two separate stores. The UnifiedPatternMemory header comments (lines 7-8) say it "REPLACES PatternMemorySystem and PatternMemoryStore" but PatternMemoryBank still exists and is still called.

Summary of Highest-Impact Findings
#	Finding	Severity	Evidence
1
Partial exits always become full closes (unit mismatch)
CRITICAL
OrderExecutor.js:592, MaxProfitManager.js:623
2
MaxProfitManager singleton can't track multiple positions
HIGH
MaxProfitManager.js:277, TradingLoop.js:132
3
MaxProfitManager reset after SELL kills remaining tier state
HIGH
OrderExecutor.js:911
4
SELL always closes oldest BUY, ignores decision.tradeId
MEDIUM
OrderExecutor.js:514-516, TradingLoop.js:165
5
TradeJournalBridge exit never fires (wrong type check)
MEDIUM
TradeJournalBridge.js:132
6
Dual balance systems can diverge (BacktestRecorder vs StateManager)
MEDIUM
TradingLoop.js:151, BacktestRecorder.js:62
7
Two competing pattern memory stores, both active, incompatible formats
MEDIUM
OrderExecutor.js:731 vs :860
8
Proof logger value_usd is USD² (cosmetic)
LOW
OrderExecutor.js:366