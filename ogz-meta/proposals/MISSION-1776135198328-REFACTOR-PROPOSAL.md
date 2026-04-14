# REFACTOR PROPOSAL: MISSION-1776135198328
Generated: 2026-04-14T02:53:55.017Z

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
refactor: add reducePosition method to core/StateManager.js per Mercury Part 1 audit Q3. Current closePosition ignores size param and always full-closes. Add reducePosition(tradeId, fraction, price, context) that: looks up trade by tradeId in activeTrades, computes closeSize from fraction times trade remaining position, updates trade.remainingSize, computes realized PnL for the closed portion, pushes leg entry to trade.decisionLedger.exits array, only deletes from activeTrades when remainingSize reaches 0. exitFraction is fraction of REMAINING position. Read core/StateManager.js. Mission 2 of 8.

## Architect Plan
Add a `reducePosition` method to `core/StateManager.js` and extend trade objects with a `remainingSize` field so partial exits can be tracked, updating realized PnL and decision‑ledger exits while only removing trades when fully closed.

### Files to Modify
- `core/StateManager.js` — 2 changes

### Commit Ordering
1. Add `remainingSize` field in `openPosition` (must exist before any reducePosition calls).
2. Add `reducePosition` method after `closePosition` (depends on `remainingSize` and ledger schema).

### Verification
Run `npm test` (or the project's test command) and confirm all existing tests pass. Then execute a custom integration test that opens a trade, performs two `reducePosition` calls (0.3 and 0.7 fractions), and checks that the trade is fully removed after the second call and that the state’s `realizedPnL` matches the summed partial PnL. The test should also verify that `trade.decisionLedger.exits` contains two exit entries with correct prices and PnL values.

## Verified Edits (Mercury-confirmed against actual code)

### Edit 1: core/StateManager.js:353-354
**Verified:** YES (The plan’s line numbers were off by a few lines; the actual size fields are at lines 353‑354, not 351‑356.)

```javascript
// BEFORE:
      sizeUsd: size,        // Position size in USD
      size: size,           // Keep for compatibility
// AFTER:
      sizeUsd: size,        // Position size in USD
      size: size,           // Keep for compatibility
      remainingSize: size, // Track how much of the trade is still open
```

### Edit 2: core/StateManager.js:561-561
**Verified:** YES (Inserted after the closing brace of `closePosition` (line 560) where a blank line previously existed.)

```javascript
// BEFORE:

// AFTER:
  /**
   * Reduce an active trade by a fraction of its remaining position.
   *
   * @param {string} tradeId - Identifier of the trade to reduce (must exist in activeTrades).
   * @param {number} fraction - Fraction of the *remaining* position to close (0 < fraction ≤ 1).
   * @param {number} price - Exit market price.
   * @param {Object} [context={}] - Additional context (e.g., exitReason).
   * @returns {Promise<{success: boolean, state?: Object, error?: string}>}
   *
   * @description
   *   - Looks up the trade in `activeTrades`.
   *   - Computes `closeSize = fraction * trade.remainingSize`.
   *   - Updates `trade.remainingSize`.
   *   - Calculates realized PnL for the closed portion using the trade's entry price and direction.
   *   - Pushes an exit leg entry to `trade.decisionLedger.exits`.
   *   - If `remainingSize` reaches 0, removes the trade from `activeTrades`.
   *   - Updates position scalar, `inPosition`, and realized PnL accordingly.
   */
  async reducePosition(tradeId, fraction, price, context = {}) {
    // Validate fraction
    if (fraction <= 0 || fraction > 1) {
      console.error('[StateManager] Invalid fraction for reducePosition:', fraction);
      return { success: false, error: 'fraction must be >0 and ≤1' };
    }

    const trade = this.state.activeTrades?.get(tradeId);
    if (!trade) {
      console.error(`[StateManager] Trade ${tradeId} not found for reducePosition`);
      return { success: false, error: `Trade ${tradeId} not found` };
    }

    // Ensure we have a remainingSize field (fallback to sizeUsd if missing)
    const remaining = trade.remainingSize !== undefined ? trade.remainingSize : (trade.sizeUsd || trade.size);
    const closeSize = Math.abs(remaining) * fraction;
    const newRemaining = remaining - closeSize;
    trade.remainingSize = newRemaining;

    // Direction handling
    const isShort = trade.direction === 'short';
    const entryPrice = trade.entryPrice;
    const priceChangePercent = isShort
      ? (entryPrice > 0 ? ((entryPrice - price) / entryPrice) : 0)
      : (entryPrice > 0 ? ((price - entryPrice) / entryPrice) : 0);
    const pnl = closeSize * priceChangePercent;
    const pnlPercent = priceChangePercent * 100;
    const usdValueAtClose = closeSize + pnl;
    const exitFee = usdValueAtClose * TradingConfig.get('fees.takerFee');
    const netRealizedResult = pnl - exitFee;

    // Ledger exit entry
    if (trade.decisionLedger) {
      const exitEntry = {
        exitPrice: price,
        exitTime: Date.now(),
        pnlDollars: pnl,
        pnlPercent,
        exitFee,
        netPnlDollars: netRealizedResult,
        exitReason: context.exitReason || 'partial',
        holdTimeMs: Date.now() - (trade.entryTime || trade.timestamp || 0)
      };
      trade.decisionLedger.exits = trade.decisionLedger.exits || [];
      trade.decisionLedger.exits.push(exitEntry);
    }

    // If fully closed, remove from activeTrades
    if (Math.abs(newRemaining) < 1e-8) {
      this.state.activeTrades.delete(tradeId);
      console.log(`🔒 [StateManager] Fully closed trade ${tradeId} – removed from activeTrades`);
    }

    // Position scalar update – keep compatibility with existing logic
    const isLong = !isShort;
    const positionDelta = isShort ? -closeSize : closeSize;
    const newPosition = this.state.position + positionDelta;

    const updates = {
      position: newPosition,
      // If any trades remain, keep entryPrice/entryTime; otherwise clear them
      entryPrice: this.state.activeTrades && this.state.activeTrades.size > 0 ? this.state.entryPrice : 0,
      entryTime: this.state.activeTrades && this.state.activeTrades.size > 0 ? this.state.entryTime : null,
      inPosition: Math.max(0, this.state.inPosition - closeSize),
      realizedPnL: this.state.realizedPnL + netRealizedResult,
      totalPnL: this.state.totalPnL + pnl,
      lastTradeTime: Date.now()
    };

    console.log(`📊 [StateManager] Reduced trade ${tradeId} by ${fraction * 100}% → closeSize $${closeSize.toFixed(2)}; PnL $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

    return this.updateState(updates, {
      action: 'REDUCE_POSITION',
      tradeId,
      fraction,
      price,
      closeSize,
      pnl,
      exitFee,
      netRealizedResult,
      ...context
    });
  }
```



## RAG Context
- [CRITICAL] FIX-2026-03-26-LONG-ONLY-PIPELINE: Zero shorts firing in backtest despite SmartMoneySweep generating 530 short sign...
- [HIGH] FIX-2026-03-21-SIZER-BLOCKING-REMOVED: DynamicPositionSizer was BLOCKING 62.9% of trades when patterns were quarantined...
- [HIGH] FIX-2026-02-05-DEEPSEARCH-003-FEE-DEDUCTION: Fees never deducted from balance - P&L overstated by ~108%, backtest results unr...

---

## Approval
Run: `node ogz-meta/approve.js MISSION-1776135198328`

## Rejection
Run: `node ogz-meta/reject.js MISSION-1776135198328`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
