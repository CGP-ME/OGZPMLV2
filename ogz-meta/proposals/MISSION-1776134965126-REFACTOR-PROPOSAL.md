# REFACTOR PROPOSAL: MISSION-1776134965126
Generated: 2026-04-14T02:50:07.250Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: fix recordTrade to aggregate legs by tradeId. When a trade with matching tradeId already exists in this.trades, merge the exit leg data instead of creating a new record. Use tradeId lookup not last-trade heuristic. Read core/BacktestRecorder.js. Mission 5 of 8 coordinated partial-close pipeline refactors. exitFraction is fraction of REMAINING position (established in mission 1).

## Architect Plan
Aggregate trade legs by tradeId in BacktestRecorder.recordTrade and pass tradeId from OrderExecutor

### Files to Modify
- `core/BacktestRecorder.js` — 3 changes
- `core/OrderExecutor.js` — 1 changes

### Commit Ordering
1. core/BacktestRecorder.js must be updated first to accept and use tradeId.
2. core/OrderExecutor.js must be updated next to supply tradeId to the recorder.

### Verification
Run the existing backtest suite with a scenario that triggers a partial close (exitFraction < 1). Expected outcome:
- The BacktestRecorder.trades array contains a single entry for the original tradeId.
- The entry’s exitTime, exitPrice, netPnlDollars, and related fields reflect the most recent exit leg.
- No duplicate tradeNumber is created for the partial exit.
- CSV export includes the tradeId column (optional) and the row count matches the number of unique tradeIds.
Command: `npm test -- test/backtest/partial-close.test.js` (or equivalent). All tests should pass and the new assertions about aggregation should succeed.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/BacktestRecorder.js:36-45
**Verified:** YES

```javascript
// BEFORE:
    recordTrade(trade) {
        // FIX 2026-03-28: trade.size is already USD, no multiplication needed
        const positionSizeUsd = trade.size || trade.sizeUsd || 1;
        const entryPrice = trade.entryPrice || 0;
        const exitPrice = trade.exitPrice || 0;

        // Calculate fees based on USD position size
        const entryFee = positionSizeUsd * this.feePerSide;
        const exitFee = positionSizeUsd * this.feePerSide;
        const totalFees = entryFee + exitFee;
// AFTER:
    recordTrade(trade) {
        // FIX 2026-03-28: trade.size is already USD, no multiplication needed
        const tradeId = trade.tradeId || trade.id || trade.orderId || null;
        const positionSizeUsd = trade.size || trade.sizeUsd || 1;
        const entryPrice = trade.entryPrice || 0;
        const exitPrice = trade.exitPrice || 0;

        // Calculate fees based on USD position size
        const entryFee = positionSizeUsd * this.feePerSide;
        const exitFee = positionSizeUsd * this.feePerSide;
        const totalFees = entryFee + exitFee;
```

### Edit 2: core/BacktestRecorder.js:78-78
**Verified:** YES

```javascript
// BEFORE:
            tradeNumber: this.trades.length + 1,
// AFTER:
            tradeId: tradeId,
            tradeNumber: this.trades.length + 1,
```

### Edit 3: core/BacktestRecorder.js:113-119
**Verified:** YES

```javascript
// BEFORE:
        this.trades.push(record);

        // Log running balance
        const arrow = netPnlDollars >= 0 ? '↑' : '↓';
        console.log(`💰 Trade #${record.tradeNumber}: ${record.strategyName} ${record.direction.toUpperCase()} | ${netPnlDollars >= 0 ? '+' : ''}$${netPnlDollars.toFixed(2)} (${netPnlPercent >= 0 ? '+' : ''}${netPnlPercent.toFixed(2)}%) | Balance: $${this.balance.toFixed(2)} ${arrow}`);

        return record;
// AFTER:
        // If a trade with the same tradeId already exists, merge exit data instead of pushing a new record
        if (tradeId) {
          const existingIdx = this.trades.findIndex(r => r.tradeId === tradeId);
          if (existingIdx !== -1) {
            const existing = this.trades[existingIdx];
            // Preserve entry‑side data, replace exit‑side data with the latest leg
            const merged = {
              ...existing,
              // Update exit information from the current leg
              exitTime: record.exitTime,
              exitPrice: record.exitPrice,
              stopLoss: record.stopLoss,
              takeProfit: record.takeProfit,
              size: record.size,
              // P&L for the merged record (overwrite with latest leg's calculation)
              rawPnlDollars: record.rawPnlDollars,
              feesDollars: record.feesDollars,
              netPnlDollars: record.netPnlDollars,
              netPnlPercent: record.netPnlPercent,
              // Keep the most recent balance tracking
              balanceBefore: record.balanceBefore,
              balanceAfter: record.balanceAfter,
              // Preserve strategy and other context (they are unchanged)
              strategyName: record.strategyName,
              confidence: record.confidence,
              exitReason: record.exitReason,
              reason: record.reason,
              holdTimeMinutes: record.holdTimeMinutes,
              entryCandle: record.entryCandle,
              exitCandle: record.exitCandle,
              signalDetails: record.signalDetails
            };
            this.trades[existingIdx] = merged;
            // Log merged update
            console.log(`🔁 Merged exit for tradeId ${tradeId} into record #${existing.tradeNumber}`);
            return merged;
          }
        }
        // No existing record – push a new one
        this.trades.push(record);

        // Log running balance
        const arrow = netPnlDollars >= 0 ? '↑' : '↓';
        console.log(`💰 Trade #${record.tradeNumber}: ${record.strategyName} ${record.direction.toUpperCase()} | ${netPnlDollars >= 0 ? '+' : ''}$${netPnlDollars.toFixed(2)} (${netPnlPercent >= 0 ? '+' : ''}${netPnlPercent.toFixed(2)}%) | Balance: $${this.balance.toFixed(2)} ${arrow}`);

        return record;
```

### Edit 4: core/OrderExecutor.js:565-580
**Verified:** YES

```javascript
// BEFORE:
              this.ctx.backtestRecorder.recordTrade({
                entryTime: buyTrade.entryTime ? new Date(buyTrade.entryTime).toISOString() : '',
                exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
                direction: 'long',
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                stopLoss: buyTrade.exitContract?.stopLossPercent || 0,
                takeProfit: buyTrade.exitContract?.takeProfitPercent || 0,
                size: buyTrade.size || 1,
                strategyName: buyTrade.entryStrategy || 'unknown',
                confidence: buyTrade.confidence || 0,
                exitReason: completeTradeResult.exitReason || 'signal',
                reason: buyTrade.reason || '',
                holdTimeMinutes: holdDuration / 60000,
                exitContract: buyTrade.exitContract
              });
// AFTER:
              this.ctx.backtestRecorder.recordTrade({
                tradeId: buyTrade.orderId,
                entryTime: buyTrade.entryTime ? new Date(buyTrade.entryTime).toISOString() : '',
                exitTime: exitTimestamp ? new Date(exitTimestamp).toISOString() : '',
                direction: 'long',
                entryPrice: buyTrade.entryPrice,
                exitPrice: price,
                stopLoss: buyTrade.exitContract?.stopLossPercent || 0,
                takeProfit: buyTrade.exitContract?.takeProfitPercent || 0,
                size: buyTrade.size || 1,
                strategyName: buyTrade.entryStrategy || 'unknown',
                confidence: buyTrade.confidence || 0,
                exitReason: completeTradeResult.exitReason || 'signal',
                reason: buyTrade.reason || '',
                holdTimeMinutes: holdDuration / 60000,
                exitContract: buyTrade.exitContract
              });
```



## RAG Context
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] FIX-659-SUMMARY: Pattern memory was not growing despite hours of trading. The bot only showed the...
- [HIGH] FIX-2026-02-05-DEEPSEARCH-004-BACKTEST-TIME: holdTime calculations used Date.now() instead of candle timestamps - all hold ti...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776134965126`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776134965126`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
