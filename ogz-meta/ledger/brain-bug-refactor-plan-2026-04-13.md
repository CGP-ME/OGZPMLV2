# Brain Bug Refactor Plan — Mercury Agentic
**Date:** 2026-04-13
**Mode:** Agentic (36 iterations, 33.6s)
**Purpose:** Coordinated 8-file refactor plan for partial-close pipeline bug
**Index:** 7115 chunks (reindexed post-L1-L8 + cognition commits)

---

**Co‑ordinated refactor to fix the “partial‑close pipeline” bug**

| Layer | Current behaviour (cited) | Required new behaviour | Code change (before → after) | Cross‑file impact | Isolation test | Risk if shipped without later layers |
|-------|--------------------------|-----------------------|-----------------------------|-------------------|----------------|--------------------------------------|
| **1 – MaxProfitManager** | The manager emits an **absolute** exit size (`scaleOutSize` or `tierExit.exitSize`). <br>```js\n 460‑466  return { action:'exit_partial', price:currentPrice, exitSize:scaleOutSize, … };\n 504‑506  return { action:'exit_partial', price:currentPrice, exitSize:tierExit.exitSize, … };\n``` | Emit a **fraction** of the position (0‑1) – the *scale‑out fraction* – and keep the absolute size only for internal bookkeeping. <br>Clients (OrderExecutor, StateManager) will multiply the fraction by the current USD position to get the absolute size. | ```js\n // 460‑466  // before\n //   exitSize: scaleOutSize,\n // after – expose fraction and keep absolute for internal use\n   exitFraction: scaleOutFraction,\n   exitSize: scaleOutSize,   // keep for legacy logs only\n\n // 504‑506  // before\n //   exitSize: tierExit.exitSize,\n // after – expose fraction\n   exitFraction: tierExit.exitSize / this.state.originalSize,\n   exitSize: tierExit.exitSize,\n``` | `OrderExecutor` (Layer 2) will read `exitFraction` instead of treating `exitSize` as a fraction. <br>`StateManager` (Layer 3) already expects an absolute size, so no change needed there. | **MaxProfitManager unit test** – simulate a BE‑scale‑out with `scaleOutFraction = 0.5`. Verify that the returned object contains `exitFraction === 0.5` and `exitSize === originalSize * 0.5`. | If only this layer is landed, `OrderExecutor` will still interpret the old `exitSize` as a fraction and close the whole position – the bug persists. |
| **2 – OrderExecutor** | Detects a *partial* close only when `decision.exitSize < 1` (i.e. assumes a fraction). <br>```js\n 592‑593  const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;\n 593‑594  const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;\n``` | Use the new `exitFraction` field; keep backward‑compatibility with any legacy callers that still send a fraction in `exitSize`. | ```js\n // 592‑594  // before\n //   const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;\n //   const partialSize = isPartialClose ? positionAmount * decision.exitSize : null;\n // after – prefer exitFraction, fall back to exitSize for old callers\n   const fraction = decision.exitFraction ?? (decision.exitSize > 0 && decision.exitSize < 1 ? decision.exitSize : null);\n   const isPartialClose = typeof fraction === 'number';\n   const partialSize = isPartialClose ? positionAmount * fraction : null;\n``` | Relies on **Layer 1** to provide `exitFraction`. No other files need to change for this layer. | **OrderExecutor unit test** – mock a decision `{exitFraction:0.3}` with a USD position of `$10 000`. Verify that `partialSize === 3000` and that a full‑close is **not** triggered. | If Layer 1 is not yet updated, `fraction` will be `null` and the executor will treat the exit as a full close, re‑introducing the bug. |
| **3 – StateManager** | `closePosition(price, partial, size, …)` expects an **absolute** size (`size`). No helper to reduce a position by a fraction. <br>```js\n 590‑594  const closeResult = await stateManager.closePosition(price, isPartialClose, partialSize, {orderId:…, exitReason:…});\n``` | Add a **`reducePosition(fraction, context)`** method that internally computes the absolute size (`state.position * fraction`) and forwards to `closePosition`. This gives other modules (e.g. TRAI, UnifiedPatternMemory) a clean API for partial reductions. | ```js\n // new method (insert after closePosition)\n   async reducePosition(fraction, context = {}) {\n     if (typeof fraction !== 'number' || fraction <= 0 || fraction >= 1) {\n       return { success:false, error:'Invalid fraction' };\n     }\n     const absoluteSize = Math.abs(this.state.position) * fraction;\n     return this.closePosition(context.price, true, absoluteSize, context);\n   }\n``` | `OrderExecutor` can now call `stateManager.reducePosition(decision.exitFraction, {price, orderId, exitReason})` instead of computing `partialSize` itself (optional). <br>`UnifiedPatternMemory` may want to record a partial outcome via this API. | **StateManager unit test** – set `state.position = 20000`, call `reducePosition(0.25, {price:105})`. Verify that the returned `position` is `15000` and that `realizedPnL` reflects the correct USD P&L. | If this method is added but not used, no functional change occurs. If later layers forget to use it, they may still compute sizes themselves, which is safe but duplicate logic. |
| **4 – BacktestRecorder** | `recordTrade(trade)` only records a **single** size (`trade.size`). Partial exits generate a new trade record but the previous entry is never linked, so leg‑accumulation is lost. <br>```js\n 86‑90  const positionSizeUsd = trade.size || trade.sizeUsd || 1;\n``` | Detect a **partial‑exit** flag (`trade.isPartial`) and, when true, **merge** the new leg into the existing open‑trade record (increase `size` and adjust P&L). | ```js\n // inside recordTrade (after building `record`)\n   if (trade.isPartial && this.trades.length > 0) {\n     const last = this.trades[this.trades.length-1];\n     // merge leg\n     last.size += record.size;\n     last.rawPnlDollars += record.rawPnlDollars;\n     last.netPnlDollars += record.netPnlDollars;\n     // keep original entryTime, entryPrice, etc.\n     return last;\n   }\n``` | Depends on `OrderExecutor`/`StateManager` to flag a trade as partial (`trade.isPartial = true`). <br>Does **not** affect other layers directly. | **BacktestRecorder unit test** – simulate a trade that exits partially (size = 3000) then later fully (size = 7000). Verify that the final ledger entry shows `size = 10 000` and cumulative P&L matches the sum of both legs. | If the flag is missing, the recorder will still create separate rows – the test will fail, exposing the missing integration. |
| **5 – TRAIDecisionModule** | Decision objects contain only `exitSize` (absolute) when a tiered exit is passed through from `MaxProfitManager`. <br>```js\n 186‑192  decision = { action:'SELL', direction:'close', confidence:…, exitSize:profitResult.exitSize, exitReason:profitResult.reason };\n``` | Propagate the **fraction** (`exitFraction`) instead of the absolute size, and keep `exitSize` for legacy logging only. | ```js\n // 186‑192  // before\n //   exitSize: profitResult.exitSize,\n // after – add fraction, keep size for logs\n   exitFraction: profitResult.exitFraction,\n   exitSize: profitResult.exitSize,   // legacy\n``` | `OrderExecutor` (Layer 2) now receives `exitFraction` directly. <br>`DecisionLedgerSchema` (L6) already has an `exits` array – no schema change needed because the field is optional. | **TRAIDecisionModule unit test** – mock a `profitResult` with `exitFraction:0.4`. Verify that the returned decision object contains `exitFraction` and that `exitSize` is unchanged. | If this change is omitted, `OrderExecutor` will still see an absolute size and treat it as a full close. |
| **6 – TradeJournal** | `recordExit` creates a new exit record and **removes** the original entry

---

**Generated by Mercury-2 ReAct loop, 36 iterations, 33.6s**


---

## PART 2 — Layers 6-8 (20 iterations, 32.0s)

**LAYER 6 – `core/TradeJournal.js`**  

**Current behavior** – the exit handler deletes the open‑trade entry immediately:  

```js
// core/TradeJournal.js:218‑220
  // ── Remove from open trades ───────────────────────────────────────
  this.openTrades.delete(exit.orderId);
```  

**Required new behavior** – keep the open‑trade entry until the trade is fully closed (`remainingSize === 0`). When a partial exit occurs the entry must be updated with the new remaining size (and USD value) so that later exits can be processed.  

**Proposed code change** – replace the unconditional delete with a size‑aware check and update the stored entry when the trade is still open:

```diff
-    // ── Remove from open trades ───────────────────────────────────────
-    this.openTrades.delete(exit.orderId);
+    // ── Remove or update open trade depending on remaining size ───────
+    if (typeof exit.remainingSize === 'number' && exit.remainingSize > 0) {
+      // Partial close – keep the entry, shrink size & USD value
+      const open = this.openTrades.get(exit.orderId);
+      if (open) {
+        open.size = exit.remainingSize;
+        // Approximate USD value proportionally (price * size)
+        open.usdValue = open.entryPrice * exit.remainingSize;
+        // Preserve the original entry timestamp for later analytics
+        this.openTrades.set(exit.orderId, open);
+      }
+    } else {
+      // Full close – safe to delete
+      this.openTrades.delete(exit.orderId);
+    }
```

**Cross‑file dependencies** –  
* `OrderExecutor`/`StateManager` must now include `remainingSize` in the `exit` object passed to `recordExit`.  
* `BacktestRecorder` and any UI components that read the ledger will automatically see the updated `size`/`usdValue` fields.

**Isolation test** –  
1. Open a trade of 10 BTC.  
2. Call `recordExit({orderId, exitPrice, pnl, remainingSize:5})`. Verify that `openTrades` still contains the entry with `size===5`.  
3. Call `recordExit({orderId, exitPrice, pnl, remainingSize:0})`. Verify that the entry is removed and the ledger contains a single completed‑trade record with `size===10`.

**Risks if shipped without later layers** –  
If only this change lands, downstream modules that still assume the trade is removed on the first exit will mis‑interpret the state (e.g., duplicate exits, stale open‑trade maps). The partial‑close pipeline will still be broken unless `OrderExecutor`/`StateManager` are updated to supply `remainingSize`.

---

**LAYER 7 – `core/UnifiedPatternMemory.js`**  

**Current behavior** – every exit event fires `recordOutcome` immediately, creating a learning sample per leg:

```js
// core/UnifiedPatternMemory.js:218‑225
  recordOutcome(features, outcome) {
    if (!this._validateFeatures(features)) return false;
    if (!outcome || typeof outcome.pnl !== 'number') return false;
    const sig = computeSignature(features);
    if (!sig) return false;
    // … update pattern stats and push outcome …
```

**Required new behavior** – accumulate outcomes by a unique `tradeId` (parent trade). Only when the trade is fully closed (`remainingSize === 0`) should the aggregated result be committed to the pattern store.  

**Proposed code change** – add a temporary map `pendingOutcomes` and modify `recordOutcome` to merge legs:

```diff
+    // New member (added in constructor)
+    this.pendingOutcomes = new Map(); // tradeId → {features, aggPnl, aggHoldMs, legCount}
```

```diff
-  recordOutcome(features, outcome) {
+  recordOutcome(features, outcome, tradeId) {
     if (!this._validateFeatures(features)) return false;
     if (!outcome || typeof outcome.pnl !== 'number') return false;
-    const sig = computeSignature(features);
+    // If a tradeId is supplied, aggregate until the trade is fully closed
+    if (tradeId) {
+      const pending = this.pendingOutcomes.get(tradeId) || {
+        features,
+        aggPnl: 0,
+        aggHoldMs: 0,
+        legCount: 0,
+        remainingSize: outcome.remainingSize ?? null,
+      };
+      pending.aggPnl += outcome.pnl;
+      pending.aggHoldMs += outcome.holdTimeMs || 0;
+      pending.legCount += 1;
+      // Update remainingSize if supplied (partial close)
+      if (typeof outcome.remainingSize === 'number') pending.remainingSize = outcome.remainingSize;
+      this.pendingOutcomes.set(tradeId, pending);
+      // Fire only when the trade is fully closed
+      if (pending.remainingSize === 0 || pending.remainingSize === null) {
+        // Use the original features (first leg) for pattern lookup
+        const finalOutcome = {
+          pnl: pending.aggPnl,
+          pnlPercent: pending.aggPnl / (outcome.usdValue || 1) * 100,
+          holdTimeMs: pending.aggHoldMs,
+          exitReason: outcome.exitReason,
+          strategy: outcome.strategy,
+        };
+        // Remove pending entry before delegating to the original logic
+        this.pendingOutcomes.delete(tradeId);
+        // Fall‑through to the original per‑leg handling (now with aggregated data)
+        outcome = finalOutcome;
+      } else {
+        // Not yet closed – do not record a pattern outcome
+        return true;
+      }
+    }
+    const sig = computeSignature(features);
```

*(The rest of the method body remains unchanged – it will now receive the aggregated `outcome` when the trade is fully closed.)*

**Cross‑file dependencies** –  
* `OrderExecutor` must now call `recordOutcome(features, outcome, tradeId)` and include `remainingSize` in the outcome (e.g., `outcome.remainingSize = exit.remainingSize`).  
* Any custom pattern‑recording wrappers that invoke `recordOutcome` need to be updated to forward the `tradeId`.

**Isolation test** –  
1. Simulate a 2‑leg trade with `tradeId='T1'`.  
   * First leg: `recordOutcome(features, {pnl:100, remainingSize:5}, 'T1')` → should return `true` and **not** create a pattern entry.  
   * Second leg: `recordOutcome(features, {pnl:-30, remainingSize:0}, 'T1')` → should create a single pattern outcome with `pnl:70`.  
2. Verify that `pattern.outcomes` contains exactly one entry for the signature and that `wins/losses` reflect the aggregated result.

**Risks if shipped without later layers** –  
If only this change lands, the `tradeId` argument will be missing from the caller, causing `recordOutcome` to treat every leg as a full trade and still produce duplicate learning samples. The aggregation logic would never be triggered, leaving the multi‑leg bug unchanged.

---

**LAYER 8 – `core/exit/BreakEvenManager.js`**  

**Current behavior** – break‑even is evaluated only on the overall `maxProfitPercent` and assumes the whole position is still present:

```js
// core/exit/BreakEvenManager.js:48‑62
    const riskAmount = Math.abs(stopLossPercent);
    const maxProfit = trade.maxProfitPercent || 0;
    // Break‑even triggers when maxProfit >= initial risk (1:1 payoff)
