# Trade Lifecycle Forensic Trace Table
**Generated:** 2026-04-14 from source code via Mercury agentic
**Every row verified against current HEAD with file:line**

---

## BUY Entry Path (17 iterations, 12s)

| # | File:line | Actor | Action | Payload fields |
|---|-----------|-------|--------|----------------|
| 1 | `TradingLoop.js:324` | TradingLoop | `this.ctx.executeTrade()` | decision, confidenceData, price, indicators, patterns, null, orchResult |
| 2 | `run-empire-v2.js:1407` | Bot | `this.orderExecutor.executeTrade()` | decision, confidenceData, price, indicators, patterns, traiDecision, orchResult |
| 3 | `OrderExecutor.js:273-286` | OrderExecutor | `stateManager.openPosition(adjustedPositionSize, price, context)` | orderId, confidence, patterns, entryIndicators, entryTime, signalBreakdown, bullishScore, bearishScore, reasoning, entryStrategy, exitContract, ledgerData |

## SELL Close Path (3 iterations, 3s)

| # | File:line | Actor | Action | Payload fields |
|---|-----------|-------|--------|----------------|
| 4 | `OrderExecutor.js:508` | OrderExecutor | `stateManager.getState()` | — |
| 5 | `OrderExecutor.js:514` | OrderExecutor | `stateManager.getAllTrades()` → filter BUYs, sort by entryTime, pick oldest | buyTrades[0] selected |
| 6 | `OrderExecutor.js:587` | OrderExecutor | `stateManager.getState()` | position amount for partial calc |
| 7 | `OrderExecutor.js:592` | OrderExecutor | Partial check: `exitSize > 0 && exitSize < 1` | **BUG F2: treats absolute USD as fraction** |
| 8 | `OrderExecutor.js:594` | OrderExecutor | `stateManager.closePosition(price, isPartialClose, partialSize, {orderId, exitReason})` | **BUG F3: closePosition ignores size param** |
| 9 | `OrderExecutor.js:564` | OrderExecutor | `backtestRecorder.recordTrade({...})` | entry/exit times, direction, prices, size, strategy, confidence, exitReason, holdTime, exitContract |
| 10 | `OrderExecutor.js:620` | OrderExecutor | `notifyTradeClose({pnl, entryPrice, exitPrice, duration})` | pnl, prices, duration |
| 11 | `OrderExecutor.js:628` | OrderExecutor | `discordNotifier.notifyTrade('sell', price, usdAmount, profitLoss)` | sell, price, usd, pnl |
| 12 | `OrderExecutor.js:634` | OrderExecutor | `dashboardWs.send({type:'trade', action:'SELL', ...})` | trade, SELL, price, pnl, timestamp, duration, confidence |
| 13 | `OrderExecutor.js:649` | OrderExecutor | `TradingProofLogger.trade({action:'SELL', ...})` | SELL, symbol, price, size, value_usd, fees, reason, confidence |
| 14 | `OrderExecutor.js:905` | OrderExecutor | `stateManager.removeActiveTrade(buyTrade.orderId)` | **BUG F7: double-delete after closePosition already deleted** |
| 15 | `OrderExecutor.js:910-912` | OrderExecutor | `maxProfitManager.reset()` | **BUG F8: unconditional reset kills tier state** |

## StateManager.closePosition Internal Path

| # | File:line | Actor | Action | Payload fields |
|---|-----------|-------|--------|----------------|
| 16 | `StateManager.js:465` | StateManager | `closeSize = Math.abs(tradeSizeUsd)` | **BUG F3: ignores size param, uses full trade** |
| 17 | `StateManager.js:480` | StateManager | PnL = closeSize × priceChangePercent | pnl, pnlPercent |
| 18 | `StateManager.js:485` | StateManager | exitFee = usdValueAtClose × takerFee | exitFee |
| 19 | `StateManager.js:490` | StateManager | `activeTrades.delete(tradeId)` | **BUG F4: unconditional delete, no remainingSize check** |
| 20 | `StateManager.js:527` | StateManager | netRealizedResult = pnl - exitFee | netRealizedResult |
| 21 | `StateManager.js:530-542` | StateManager | L8 ledger: write decisionLedger.outcome + writeOnClose | exitPrice, pnlDollars, pnlPercent, exitFee, netPnlDollars, exitReason, holdTimeMs |
| 22 | `StateManager.js:552-559` | StateManager | `this.updateState(updates)` | position, positionCount, entryPrice, inPosition, realizedPnL, totalPnL, lastTradeTime |

---

**Bug locations marked inline. 6 verified bugs in the close path (F2, F3, F4, F7, F8 + F3 duplicate at StateManager level).**
