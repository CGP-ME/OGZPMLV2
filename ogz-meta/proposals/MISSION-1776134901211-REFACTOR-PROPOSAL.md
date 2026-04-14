# REFACTOR PROPOSAL: MISSION-1776134901211
Generated: 2026-04-14T02:48:58.933Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: fix exitSize check at line 592-594 to use exitFraction from MaxProfitManager. If exitFraction present, compute partialSize as remaining position times exitFraction. Call StateManager.reducePosition for partials instead of closePosition. Keep backward compat for callers without exitFraction. Read core/OrderExecutor.js. Mission 3 of 8 coordinated partial-close pipeline refactors. exitFraction is fraction of REMAINING position (established in mission 1).

## Architect Plan
Introduce StateManager.reducePosition and update OrderExecutor to use exitFraction for partial closes, preserving legacy exitSize behavior.

### Files to Modify
- `core/StateManager.js` — 1 changes
- `core/OrderExecutor.js` — 1 changes

### Commit Ordering
1. Add reducePosition to StateManager first (core/StateManager.js) so OrderExecutor can call it.
2. Update OrderExecutor to use exitFraction and reducePosition (core/OrderExecutor.js).

### Verification
Run the test suite with the new integration test and the existing unit tests. All existing tests must still pass, and the new test must confirm that a decision containing exitFraction results in a partial reduction of the position via StateManager.reducePosition, while decisions without exitFraction continue to use the legacy exitSize path.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/StateManager.js:562-572
**Verified:** YES

```javascript
// BEFORE:
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
// AFTER:
  /**
   * Reduce the current position by a fraction of the remaining size.
   *
   * @param {string} tradeId - Identifier of the trade to reduce.
   * @param {number} fraction - Fraction (0‑1) of the remaining position to close.
   * @param {number} price - Execution price.
   * @param {Object} [context={}] - Additional info (e.g., exitReason).
   * @returns {Promise<{success:boolean, state?:Object, error?:string}>}
   */
  async reducePosition(tradeId, fraction, price, context = {}) {
    if (fraction <= 0 || fraction > 1) {
      return { success: false, error: 'Invalid exitFraction' };
    }
    const positionAmount = this.state.position;
    const size = positionAmount * fraction;
    // Delegate to closePosition with partial flag set.
    return this.closePosition(price, true, size, { ...context, tradeId });
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

### Edit 2: core/OrderExecutor.js:590-597
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
// AFTER:
            // Close position via StateManager (handles P&L calculation)
            // NEW: Prefer exitFraction (fraction of remaining position) if supplied.
            let closeResult;
            if (typeof decision.exitFraction === 'number' && decision.exitFraction > 0 && decision.exitFraction < 1) {
              // Fraction‑based partial close – use the new reducePosition API
              closeResult = await stateManager.reducePosition(buyTrade.orderId, decision.exitFraction, price, {
                exitReason: decision.exitReason || 'signal'
              });
            } else if (decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1) {
              // Legacy fraction supplied via exitSize (absolute size is computed here)
              const partialSize = positionAmount * decision.exitSize;
              closeResult = await stateManager.closePosition(price, true, partialSize, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal'
              });
            } else {
              // Full close – keep existing behaviour
              closeResult = await stateManager.closePosition(price, false, null, {
                orderId: buyTrade.orderId,
                exitReason: decision.exitReason || 'signal'
              });
            }
```



## RAG Context
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] FEATURE-2026-03-21-DYNAMIC-POSITION-SIZER: Inline confidence multiplier hack in OrderExecutor - no pattern memory integrati...
- [HIGH] FIX-2026-03-21-SIZER-BLOCKING-REMOVED: DynamicPositionSizer was BLOCKING 62.9% of trades when patterns were quarantined...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776134901211`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776134901211`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
