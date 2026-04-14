# Cold Trace Cross-Verification — Mercury
**Date:** 2026-04-14
**Mode:** Agentic (37 iterations, 37.2s)
**Input:** 7 independent AI cold traces from ogz-meta/audits/cold-traces/
**Method:** Each finding verified against actual source code at cited lines

---

**Verdict 1 – TradingLoop decision → executeTrade**  
*Claim*: TradingLoop._analyze builds a decision and calls `ctx.executeTrade` when the action is not HOLD.  
*Result*: **Matches** – the call is present.  
*Evidence*: `core/TradingLoop.js` line 324 (`await this.ctx.executeTrade(decision, …)`).

---

**Verdict 2 – OrderExecutor creates unifiedResult**  
*Claim*: OrderExecutor.executeTrade builds a `unifiedResult` object containing `orderId, action, entryPrice, entryTime, size, confidence, patterns, indicators`.  
*Result*: **Matches** – the object is constructed exactly as described.  
*Evidence*: `core/OrderExecutor.js` lines 158‑181 (definition of `unifiedResult`).

---

**Verdict 3 – OrderExecutor calls StateManager.openPosition with full context**  
*Claim*: `stateManager.openPosition(adjustedPositionSize, price, {...})` receives a context that includes `orderId, confidence, patterns, entryIndicators, entryTime, signalBreakdown, bullishScore, bearishScore, reasoning, entryStrategy, exitContract, ledgerData`.  
*Result*: **Matches** – the call passes all those fields.  
*Evidence*: `core/OrderExecutor.js` lines 273‑286 (call to `openPosition` with the listed context properties).

---

**Verdict 4 – StateManager.openPosition creates trade object with expected fields**  
*Claim*: The trade object contains `id, action, type, direction, sizeUsd, size, price, entryPrice, entryFee, entryTime, timestamp, status` plus all context fields spread into it.  
*Result*: **Matches** – the constructor builds exactly those properties.  
*Evidence*: `core/StateManager.js` lines 348‑362 (trade object literal) and lines 364‑366 (ledger attachment).

---

**Verdict 5 – StateManager stores trade in `activeTrades` Map**  
*Claim*: `StateManager.state.activeTrades` holds the canonical trade object.  
*Result*: **Matches** – the map is populated on open.  
*Evidence*: `core/StateManager.js` line 387 (`this.state.activeTrades.set(tradeId, trade);`).

---

**Verdict 6 – MaxProfitManager is a singleton, not per‑trade**  
*Claim*: Only one `MaxProfitManager` instance exists for the whole bot, so it cannot track multiple trades.  
*Result*: **Matches** – it is instantiated once in the main runner.  
*Evidence*: `run-empire-v2.js` line 610 (`this.maxProfitManager = new MaxProfitManager();`).

---

**Verdict 7 – MaxProfitManager internal state is not keyed by trade**  
*Claim*: `MaxProfitManager.state` holds a single position (`active, entryPrice, direction …`).  
*Result*: **Matches** – the state object is created once per `start()` call.  
*Evidence*: `core/MaxProfitManager.js` lines 277‑302 (definition of `this.state`).

---

**Verdict 8 – MaxProfitManager emits absolute `exitSize` (USD), not a fraction**  
*Claim*: `exitSize` is calculated as `originalSize * tier.exit` (or similar) and is an absolute amount.  
*Result*: **Matches** – the code returns absolute units.  
*Evidence*: `core/MaxProfitManager.js` lines 460 (`exitSize: scaleOutSize`), 504 (`exitSize: tierExit.exitSize`), 623 (`exitSize: this.state.originalSize * tier.exit`).

---

**Verdict 9 – OrderExecutor treats `exitSize` as a fraction for partial closes**  
*Claim*: Partial close is detected with `decision.exitSize < 1`.  
*Result*: **Matches** – the check uses a fractional threshold.  
*Evidence*: `core/OrderExecutor.js` line 592 (`const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;`).

---

**Verdict 10 – StateManager.closePosition ignores the supplied size argument and always closes the full trade**  
*Claim*: The `size` argument is never used; `closeSize` is derived from the stored trade.  
*Result*: **Matches** – the implementation computes `closeSize` from `tradeSizeUsd`.  
*Evidence*: `core/StateManager.js` line 465 (`const closeSize = Math.abs(tradeSizeUsd);`) – no reference to the `size` argument.

---

**Verdict 11 – StateManager.closePosition removes the trade from `activeTrades`**  
*Claim*: The trade is deleted from the map during close.  
*Result*: **Matches** – the map entry is deleted.  
*Evidence*: `core/StateManager.js` line 490 (`this.state.activeTrades.delete(tradeId);`).

---

**Verdict 12 – OrderExecutor performs a double‑delete of the trade**  
*Claim*: After `closePosition`, it calls `stateManager.removeActiveTrade`.  
*Result*: **Matches** – the extra delete occurs.  
*Evidence*: `core/OrderExecutor.js` line 905 (`stateManager.removeActiveTrade(buyTrade.orderId);`).

---

**Verdict 13 – TradeJournalBridge expects `exitRecord.type === 'exit'`**  
*Claim*: The bridge only records exits when `type` equals `'exit'`.  
*Result*: **Matches** – the conditional is present.  
*Evidence*: `core/TradeJournalBridge.js` line 132 (`if (exitRecord && exitRecord.type === 'exit') { … }`).

---

**Verdict 14 – OrderExecutor logs exits with `type` set to the trade action (e.g., `'SELL'`)**  
*Claim*: `type` is taken from `completeTradeResult.action`.  
*Result*: **Matches** – the payload uses the action string.  
*Evidence*: `core/OrderExecutor.js` line 795 (`type: completeTradeResult.action || 'BUY',`).

*Contradiction*: Traces that claim the bridge will capture exits (e.g., codex1) are contradicted by the actual payload (`type` ≠ `'exit'`).

---

**Verdict 15 – BacktestRecorder.recordTrade receives `stopLoss`/`takeProfit` fields that are not defined in its schema**  
*Claim*: OrderExecutor passes `stopLoss: buyTrade.exitContract?.stopLossPercent` and `takeProfit: buyTrade.exitContract?.takeProfitPercent`.  
*Result*: **Matches** (the fields are passed) but **mismatch** – `BacktestRecorder.recordTrade` does not have corresponding parameters; it simply records the trade data it receives.  
*Evidence*: OrderExecutor lines 571‑572 (payload) and BacktestRecorder lines 36‑45 (no explicit `stopLoss`/`takeProfit` handling).

---

**Verdict 16 – MaxProfitManager is reset after any SELL**  
*Claim*: `maxProfitManager.reset()` is called unconditionally after a sell.  
*Result*: **Matches** – the reset occurs.  
*Evidence*: `core/OrderExecutor.js` lines 910‑912 (`if (this.ctx.maxProfitManager) { this.ctx.maxProfitManager.reset(); }`).

---

**Verdict 17 – MaxProfitManager cannot track multiple open positions**  
*Claim*: Because it is a singleton with a single `state` object, opening a second position overwrites the first.  
*Result*: **Matches** – the design allows only one active state.  
*Evidence*: Singleton creation (run‑empire‑v2.js line 610) and state reset on each `start()` (MaxProfitManager line 277).  

---

**Verdict 18 – ExitContractManager’s TrailingStopChecker mutates `trade.maxProfitPercent` directly**  
*Claim*: The trailing‑stop checker updates the trade’s `maxProfitPercent`.  
*Result*: **Matches** – the mutation is performed.  
*Evidence*: `core/exit/TrailingStopChecker.js` line 35 (`trade.maxProfitPercent = Math.max(trade.maxProfitPercent || 0, pnlPercent);`).

---

**Verdict 19 – OrderExecutor selects the oldest BUY trade for a SELL, ignoring the `tradeId` supplied by the decision**  
*Claim*: The SELL path filters all BUY trades, sorts by `entryTime`, and picks the first.  
*Result*: **Matches** – the code does not use `decision.tradeId`.  
*Evidence*: `core/OrderExecutor.js` lines 514‑517 (`stateManager.getAllTrades().filter(...).sort(...); const buyTrade = buyTrades[0];`).

*Contradiction*: Traces that state the `tradeId` is used (e.g., codex1) are contradicted by the actual implementation.

---

**Verdict 20 – StateManager.closePosition does not support partial‑size argument**  
*Claim*: The function signature includes `