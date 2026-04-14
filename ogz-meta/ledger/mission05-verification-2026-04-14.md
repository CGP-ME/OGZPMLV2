# Mission 0.5 Verification — Mercury
**Iterations:** see below | **CONFIRMED:** 19 | **DISPUTED:** 0

---

**Verification of Findings (F1‑F19)**  

| Finding | Verdict | Evidence (file:line) |
|---------|---------|----------------------|
| F1 – MaxProfitManager emits absolute `exitSize` (not fraction) | **CONFIRMED** | `core/MaxProfitManager.js:460` (scaleOutSize), `core/MaxProfitManager.js:504` (tierExit.exitSize), `core/MaxProfitManager.js:623` (originalSize × tier.exit) |
| F2 – OrderExecutor treats `exitSize` as a fraction | **CONFIRMED** | `core/OrderExecutor.js:592` (`const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;`) |
| F3 – StateManager.closePosition ignores the `size` argument | **CONFIRMED** | `core/StateManager.js:465` (`const closeSize = Math.abs(tradeSizeUsd);`) |
| F4 – StateManager.closePosition deletes trade unconditionally | **CONFIRMED** | `core/StateManager.js:490` (`this.state.activeTrades.delete(tradeId);`) |
| F5 – Multi‑leg lifecycle present but functionally broken | **CONFIRMED** (the three lines above together collapse multi‑leg intent) | see F1‑F4 |
| F6 – SELL path picks oldest BUY trade, ignores `decision.tradeId` | **CONFIRMED** | `core/OrderExecutor.js:514‑517` (filter + sort), `core/OrderExecutor.js:545` (`const buyTrade = buyTrades[0];`) |
| F7 – OrderExecutor double‑deletes trade after closePosition | **CONFIRMED** | `core/OrderExecutor.js:905` (`stateManager.removeActiveTrade(buyTrade.orderId);`) and `core/StateManager.js:490` (deletion already performed) |
| F8 – MaxProfitManager.reset() called unconditionally after every SELL | **CONFIRMED** | `core/OrderExecutor.js:910‑912` (`if (this.ctx.maxProfitManager) { this.ctx.maxProfitManager.reset(); }`) |
| F9 – MaxProfitManager is a singleton, not per‑trade | **CONFIRMED** | `run-empire-v2.js:610` (`this.maxProfitManager = new MaxProfitManager();`) and `core/MaxProfitManager.js:277‑302` (single `this.state` object) |
| F10 – TradeJournalBridge type check never matches payload | **CONFIRMED** | `core/TradeJournalBridge.js:132` (`if (exitRecord && exitRecord.type === 'exit')`) vs. `core/OrderExecutor.js:795` (`type: completeTradeResult.action || 'BUY',` → `'SELL'`/`'COVER'`) |
| F11 – Short COVER path lacks learning/journal flow | **CONFIRMED** | `core/OrderExecutor.js:929‑960` (COVER handling) – no calls to `TradeJournalBridge`, `UnifiedPatternMemory`, or `PatternMemoryBank` |
| F12 – Dual pattern‑memory systems both active | **CONFIRMED** | `core/OrderExecutor.js:731‑733` (UnifiedPatternMemory) and `core/OrderExecutor.js:860‑862` (PatternMemoryBank via `this.ctx.trai.recordTradeOutcome`) |
| F13 – UnifiedPatternMemory call passes `pnlPercent` = `pnl` | **CONFIRMED** | `core/OrderExecutor.js:733` (`pnlPercent: pnl`) |
| F14 – Alpaca quantity sent as USD value instead of share count | **CONFIRMED** | `core/OrderExecutor.js:138‑139` (`amount: positionSize  // USD amount`), `core/OrderRouter.js:135‑138` (passes `amount` unchanged), `brokers/AlpacaAdapter.js:170‑171` (`qty: qty.toString()` – treats USD as share count) |
| F15 – closePosition deletes from `activeTrades` before atomic `updateState` succeeds | **CONFIRMED** | Deletion at `core/StateManager.js:488‑492`; atomic state update later at `core/StateManager.js:552‑559` |
| F16 – MaxProfitManager.start uses raw `positionSize` while StateManager opens with `adjustedPositionSize` | **CONFIRMED** | `core/OrderExecutor.js:304‑308` (`this.ctx.maxProfitManager.start(..., positionSize, ...)`) vs. `core/OrderExecutor.js:247‑251` (`adjustedPositionSize = positionSize * sizingMultiplier;` → used in `stateManager.openPosition`) |
| F17 – TradeJournalBridge double‑multiplies USD by price | **CONFIRMED** | `core/TradeJournalBridge.js:91‑93` (`usdValue: (lastTrade.size || 0) * (lastTrade.entryPrice || price)`) – `lastTrade.size` is already USD |
| F18 – StateManager.validateState contradicts short‑position & total‑balance model | **CONFIRMED** | `core/StateManager.js:603‑607` (balance vs. totalBalance), `core/StateManager.js:618‑619` (negative position check), `core/StateManager.js:614‑616` (position = 0 but `inPosition` > 0) |
| F19 – Backtest forced‑close calls `closePosition` without required `tradeId` | **CONFIRMED** | `core/BacktestRunner.js:128` (`await stateManager.closePosition(lastPrice, false, null, { reason: 'BACKTEST