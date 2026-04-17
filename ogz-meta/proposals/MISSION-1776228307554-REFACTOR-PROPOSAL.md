# REFACTOR PROPOSAL: MISSION-1776228307554
Generated: 2026-04-15T04:46:09.449Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: implement Set A of brain bug fix per ogz-meta/audits/cold-traces/brain-bug-mission-05-spec.md. Set A scope — 4 files atomically: core/MaxProfitManager.js, core/OrderExecutor.js, core/StateManager.js, core/dto/DecisionLedgerSchema.js. Findings F1-F5 verified. MaxProfitManager adds exitFraction from PRE-MUTATION remainingSize. OrderExecutor routes partial to reducePosition, full close to closePosition. StateManager gains reducePosition operating on trade.size native unit, derives sizeUsd. closePosition becomes full-close-only. Trade deletion only when remainingSize reaches 0. DecisionLedgerSchema exits typed with exitSize exitSizeUsd exitFraction remainingSize remainingSizeUsd. Do not expand scope beyond Set A. Read source files directly.

## Architect Plan
Implement Set A brain‑bug fixes: add exitFraction to MaxProfitManager partial exits, route partial exits via a new StateManager.reducePosition, make closePosition full‑close‑only, delete trades only when remainingSize reaches 0, and type DecisionLedgerSchema exits.

### Files to Modify
- `core/MaxProfitManager.js` — 3 changes
- `core/StateManager.js` — 2 changes
- `core/OrderExecutor.js` — 1 changes
- `core/dto/DecisionLedgerSchema.js` — 1 changes

### Commit Ordering
1. StateManager.reducePosition must be added before OrderExecutor is updated (dependency).
2. MaxProfitManager exitFraction additions can be applied independently.
3. DecisionLedgerSchema schema change can be applied last; it does not affect runtime logic.

### Verification
Run the full suite of brain‑bug‑mission‑05 tests:
1. Backtest a tiered‑exit strategy – ensure partial exits contain `exitFraction` and that StateManager.reducePosition is invoked.
2. Verify that after a full close the trade is removed from `activeTrades` and that partial closes keep the trade until `remainingSize` reaches 0.
3. Validate a DecisionLedger JSON payload against the updated schema – it must contain the typed exit fields.
All tests must pass (exit 0) before merging.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/MaxProfitManager.js:442-447
**Verified:** YES

```javascript
// BEFORE:
        const scaleOutFraction = this.beScaleOutConfig.scaleOutFraction || 0.5;
        const scaleOutSize = this.state.remainingSize * scaleOutFraction;
        this.state.remainingSize -= scaleOutSize;
        this.state.realizedPnL += scaleOutSize * this.state.entryPrice * profitPercent;

        // Move stop to break-even + fee buffer
// AFTER:
        const scaleOutFraction = this.beScaleOutConfig.scaleOutFraction || 0.5;
        const prevRemaining = this.state.remainingSize;
        const scaleOutSize = prevRemaining * scaleOutFraction;
        this.state.remainingSize -= scaleOutSize;
        this.state.realizedPnL += scaleOutSize * this.state.entryPrice * profitPercent;

        // Move stop to break-even + fee buffer
```

### Edit 2: core/MaxProfitManager.js:457-465
**Verified:** YES

```javascript
// BEFORE:
        return {
          action: 'exit_partial',
          price: currentPrice,
          exitSize: scaleOutSize,
          remainingSize: this.state.remainingSize,
          reason: 'be_scaleout',
          profitPercent: profitPercent,
          newStopPrice: this.state.currentStop
        };
// AFTER:
        return {
          action: 'exit_partial',
          price: currentPrice,
          exitSize: scaleOutSize,
          remainingSize: this.state.remainingSize,
          exitFraction: prevRemaining > 0 ? scaleOutSize / prevRemaining : 0,
          reason: 'be_scaleout',
          profitPercent: profitPercent,
          newStopPrice: this.state.currentStop
        };
```

### Edit 3: core/MaxProfitManager.js:498-509
**Verified:** YES

```javascript
// BEFORE:
      // Execute partial exit
      this.executePartialExit(tierExit);

      return {
        action: 'exit_partial',
        price: currentPrice,
        exitSize: tierExit.exitSize,
        remainingSize: this.state.remainingSize,
        reason: `profit_tier_${tierExit.tier}`,
        profitPercent: profitPercent,
        tier: tierExit.tier
      };
// AFTER:
      // Capture pre‑mutation size for exitFraction
      const prevRemaining = this.state.remainingSize;
      // Execute partial exit (updates remainingSize)
      this.executePartialExit(tierExit);

      return {
        action: 'exit_partial',
        price: currentPrice,
        exitSize: tierExit.exitSize,
        remainingSize: this.state.remainingSize,
        exitFraction: prevRemaining > 0 ? tierExit.exitSize / prevRemaining : 0,
        reason: `profit_tier_${tierExit.tier}`,
        profitPercent: profitPercent,
        tier: tierExit.tier
      };
```

### Edit 4: core/StateManager.js:438-444
**Verified:** YES

```javascript
// BEFORE:
  async closePosition(price, partial = false, size = null, context = {}) {
    // Allow closing both long (positive) and short (negative) positions
    // FIX 2026-03-29: Allow close when position=0 but activeTrades exist (hedged positions)
    if (this.state.position === 0 && !(this.state.activeTrades && this.state.activeTrades.size > 0)) {
      console.error('[StateManager] No position to close!');
      return { success: false, error: 'No position to close' };
    }
// AFTER:
  async closePosition(price, partial = false, size = null, context = {}) {
    if (partial) {
      console.error('[StateManager] closePosition called with partial flag – use reducePosition instead');
      return { success: false, error: 'partial close not supported' };
    }
    // Allow closing both long (positive) and short (negative) positions
    // FIX 2026-03-29: Allow close when position=0 but activeTrades exist (hedged positions)
    if (this.state.position === 0 && !(this.state.activeTrades && this.state.activeTrades.size > 0)) {
      console.error('[StateManager] No position to close!');
      return { success: false, error: 'No position to close' };
    }
```

### Edit 5: core/StateManager.js:560-593
**Verified:** YES

```javascript
// BEFORE:
  }

  /**
   * Update balance (deposits, withdrawals, fees)
   */
  async updateBalance(amount, reason = 'adjustment') {
    const updates = {
      balance: this.state.balance + amount,
      totalBalance: this.state.totalBalance + amount
    };

    return this.updateState(updates, { action: 'BALANCE_UPDATE', amount, reason });
  }

  /**
   * Reset daily counters
   */
  async resetDaily() {
    const updates = {
      dailyTradeCount: 0
    };

    return this.updateState(updates, { action: 'DAILY_RESET' });
  }

  /**
   * Set recovery mode
   */
  async setRecoveryMode(enabled) {
    const updates = {
      recoveryMode: enabled
    };

    return this.updateState(updates, { action: 'RECOVERY_MODE', enabled });
// AFTER:
  }

  /**
   * Reduce position (partial exit) – updates trade size and position metrics.
   */
  async reducePosition(price, sizeNative, context = {}) {
    const tradeId = context.tradeId || context.orderId;
    if (!tradeId) {
      console.error('[StateManager] reducePosition called without tradeId!');
      return { success: false, error: 'tradeId required for reducePosition' };
    }
    const trade = this.state.activeTrades?.get(tradeId);
    if (!trade) {
      console.error(`[StateManager] Trade ${tradeId} not found in activeTrades!`);
      return { success: false, error: `Trade ${tradeId} not found` };
    }
    // native size (e.g., shares) → USD size
    const sizeUsd = sizeNative * price;
    // Update trade native size and USD size
    trade.size = (trade.size || 0) - sizeNative;
    trade.sizeUsd = (trade.sizeUsd || 0) - sizeUsd;
    // Update global position metrics
    const newPosition = Math.max(0, this.state.position - sizeUsd);
    const newInPosition = Math.max(0, this.state.inPosition - sizeUsd);
    const updates = {
      position: newPosition,
      inPosition: newInPosition,
      lastTradeTime: Date.now()
    };
    // Delete trade only when its size reaches zero
    if (trade.size <= 0) {
      this.state.activeTrades.delete(tradeId);
      console.log(`[StateManager] Trade ${tradeId} fully reduced and removed`);
    }
    return this.updateState(updates, { action: 'REDUCE_POSITION', price, sizeNative, sizeUsd, ...context });
  }

  /**
   * Update balance (deposits, withdrawals, fees)
   */
  async updateBalance(amount, reason = 'adjustment') {
    const updates = {
      balance: this.state.balance + amount,
      totalBalance: this.state.totalBalance + amount
    };

    return this.updateState(updates, { action: 'BALANCE_UPDATE', amount, reason });
  }
```

### Edit 6: core/OrderExecutor.js:590-603
**Verified:** YES

```javascript
// BEFORE:
            // Close position via StateManager (handles P&L calculation)
            // FIX 2026-02-23: Wire partial close - use exitSize when present (tiered exits)
            const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;
            const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;
            const closeResult = await stateManager.closePosition(price, isPartialClose, partialSize, {
              orderId: buyTrade.orderId,
              exitReason: decision.exitReason || 'signal'
            });

            // CHANGE 2025-12-12: Validate StateManager.closePosition() success
            if (!closeResult.success) {
              console.error('❌ StateManager.closePosition failed:', closeResult.error);
              return; // Abort close
            }
// AFTER:
            // Close position via StateManager (handles P&L calculation)
            // FIX 2026-02-23: Wire partial close - use exitSize when present (tiered exits)
            const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;
            const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;
            let execResult;
            if (isPartialClose) {
              // Use the new reducePosition for partial exits
              execResult = await stateManager.reducePosition(price, partialSize, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal'
              });
            } else {
              execResult = await stateManager.closePosition(price, false, null, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal'
              });
            }
            // Preserve original variable name for downstream logic
            const closeResult = execResult;

            // CHANGE 2025-12-12: Validate StateManager.closePosition() success
            if (!closeResult.success) {
              console.error('❌ StateManager.closePosition failed:', closeResult.error);
              return; // Abort close
            }
```

### Edit 7: core/dto/DecisionLedgerSchema.js:71-84
**Verified:** YES

```javascript
// BEFORE:
  confluence: ConfluenceSchema.optional(),
  positionSizing: PositionSizingSchema,
  exitContract: ExitContractSchema,

  // L3: added later
  confidenceModifiers: z.array(z.any()).optional(),
  // L5: added later
  riskGates: z.array(z.any()).optional(),
  // L6: added later
  exits: z.array(z.any()).optional(),
  // L7: added later
  outcome: z.any().optional(),
});
// AFTER:
  confluence: ConfluenceSchema.optional(),
  positionSizing: PositionSizingSchema,
  exitContract: ExitContractSchema,

  // L3: added later
  confidenceModifiers: z.array(z.any()).optional(),
  // L5: added later
  riskGates: z.array(z.any()).optional(),
  // L6: added later
  const ExitEntrySchema = z.object({
    exitSize: z.number(),                 // Native size (e.g., shares or contracts)
    exitSizeUsd: z.number(),              // USD equivalent of exitSize
    exitFraction: z.number(),             // exitSize / pre‑mutation remainingSize
    remainingSize: z.number(),            // Native remaining size after exit
    remainingSizeUsd: z.number(),         // USD remaining size after exit
    // Preserve any additional fields that may be added later
    ...z.object({}).shape
  });
  exits: z.array(ExitEntrySchema).optional(),
  // L7: added later
  outcome: z.any().optional(),
});
```



## RAG Context
- [HIGH] FIX-2026-03-21-SIZER-BLOCKING-REMOVED: DynamicPositionSizer was BLOCKING 62.9% of trades when patterns were quarantined...
- [MEDIUM] FIX-2026-02-05-DEEPSEARCH-005-BREAKEVEN-BUFFER: Breakeven stop triggered guaranteed losses - fee buffer 0.1% vs actual 0.32% rou...
- [HIGH] FIX-2026-03-10-007: 5 files still had hardcoded fee values (0.0026, 0.0035, 0.0052) scattered throug...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776228307554`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776228307554`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
