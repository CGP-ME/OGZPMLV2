# Brain Bug Refactor Plan V2 — Mercury Agentic
**Date:** 2026-04-14
**Mode:** Agentic (23 iterations, 28.4s)
**Index:** 7127 chunks
**Status:** Regenerated from scratch per wolf review — v1 rejected for 11 critical defects

---

**Refactor Plan – “Brain‑Bug” (DEC‑008, DEC‑013, L1‑L8 Ledger Integration)**  

Below is a per‑file transformation checklist. Each entry shows the **current implementation** (cited line numbers), the **required new code** (inline diff‑style snippets), the **cross‑file dependencies** that must be updated, and a **minimal isolation test** that can be run in‑process to verify the change.  

---  

### 1. `core/MaxProfitManager.js`  

| Current code | Required change |
|--------------|----------------|
| `exitSize: scaleOutSize,` – line **460** (tier‑exit object)  <br> `this.state.remainingSize -= tierExit.exitSize;` – line **691** | **Return a *fraction* of the *remaining* position** instead of an absolute size. <br> ```js // NEW – replace exitSize fields with exitFraction (0‑1) //   // tierExit.exitFraction = tierExit.exitSize / this.state.remainingSize; //   // keep original size for internal PnL calc but expose fraction //   return { exitFraction: tierExit.exitFraction, … } ``` <br> **Update all tier‑exit objects** (lines 460, 504, 623, 658, 685) to compute `exitFraction = tierExit.exitSize / this.state.remainingSize` **before** mutating `remainingSize`. |
| Uses `this.state.remainingSize` directly – line **691** | After emitting the exit signal, **do not modify `remainingSize` here** – let `StateManager.reducePosition` handle it. |

**Cross‑file impact** – `OrderExecutor` will now read `exitFraction` (see §2).  

**Isolation test** – mock a `MaxProfitManager` with a remaining size of 10 BTC, call `update()` to trigger a tier exit, assert that the returned object contains `exitFraction` ≈ 0.3 (30 % of remaining).  

---  

### 2. `core/OrderExecutor.js`  

| Current code | Required change |
|--------------|----------------|
| ```js const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1; const partialSize = isPartialClose ? positionAmount * decision.exitSize : null; ``` – lines **592‑594** | **Read `exitFraction`** (new field from `MaxProfitManager`) and compute the partial size from the **remaining** position, not the original entry size. <br> ```js const isPartialClose = decision.exitFraction !== undefined && decision.exitFraction > 0 && decision.exitFraction < 1; const remaining = stateManager.get('position')?.remainingSize ?? positionAmount; const partialSize = isPartialClose ? remaining * decision.exitFraction : null; ``` |
| Calls `stateManager.closePosition(price, isPartialClose, partialSize, …)` – line **594** | Replace with **`stateManager.reducePosition(tradeId, decision.exitFraction, price, context)`** (new method, §3). Pass the original `tradeId` (available as `buyTrade.orderId`). |

**Cross‑file impact** – `StateManager.reducePosition` must be added (see §3).  

**Isolation test** – stub `stateManager.get('position')` to return `{remainingSize: 5}`; invoke `executeTrade` with a decision containing `exitFraction: 0.2`; verify that `reducePosition` receives `fraction = 0.2` and that the resulting `partialSize` equals 1 BTC.  

---  

### 3. `core/StateManager.js`  

| Current code | Required change |
|--------------|----------------|
| `activeTrades: new Map()` – line **106** (holds orderId → trade) | **Add a new method** `reducePosition(tradeId, fraction, price, context)` that: <br> 1. Looks up the trade in `activeTrades`. <br> 2. Calculates `deltaSize = trade.remainingSize * fraction`. <br> 3. Subtracts `deltaSize` from `remainingSize` (but never deletes the entry unless `remainingSize === 0`). <br> 4. Updates `realizedPnL` with `deltaSize * (price - entryPrice) * direction`. <br> 5. Emits an event `positionReduced` for downstream modules. <br> ```js reducePosition(tradeId, fraction, price, ctx) { const trade = this.state.activeTrades.get(tradeId); if (!trade) return {success:false,error:'unknown trade'}; const delta = trade.remainingSize * fraction; const pnl = delta * ((price - trade.entryPrice) / trade.entryPrice) * (trade.direction==='long'?1:-1); trade.remainingSize -= delta; this.state.realizedPnL += pnl; if (trade.remainingSize <= 0) this.state.activeTrades.delete(tradeId); return {success:true, delta, pnl}; }``` |
| `closePosition(price, isPartialClose, partialSize, …)` – line **594** (calls to be replaced) | Keep `closePosition` for **full** closes only; it should now **delete** the trade **only when** `remainingSize === 0`. <br> Add a guard: `if (trade.remainingSize > 0) return {success:false,error:'partial close not allowed'};` |

**Cross‑file impact** – `OrderExecutor` will call `reducePosition` (see §2).  

**Isolation test** – create a dummy `StateManager` with an active trade of size 10 BTC, call `reducePosition(tradeId, 0.3, price=105, ctx={})`; assert `remainingSize === 7` and `realizedPnL` matches the expected profit.  

---  

### 4. `core/BacktestRecorder.js`  

| Current code | Required change |
|--------------|----------------|
| `recordTrade(trade)` pushes a flat record onto `this.trades` – line **36‑120** | **Group legs by `tradeId`** (the `orderId` from `StateManager`). <br> ```js // NEW – at top of recordTrade const parentId = trade.orderId; let parent = this.trades.find(t=>t.tradeId===parentId); if (!parent) { parent = {tradeId:parentId, entry: trade, legs: []}; this.trades.push(parent); } parent.legs.push({exitPrice:trade.exitPrice, exitReason:trade.exitReason, exitFraction:trade.exitFraction, exitSizeUsd:trade.sizeUsd, realizedPnL:trade.realizedPnL, timestamp:Date.now(), remainingSizeAfter:trade.remainingSize});``` |
| Uses `trade.size` directly – line **38** | Ensure `trade.sizeUsd` (USD) is used for aggregation; keep `size` for legacy compatibility. |

**Cross‑file impact** – `TradeJournal` and `UnifiedPatternMemory` will read `decisionLedger.exits[]` (see §6‑§7).  

**Isolation test** – simulate two partial exits for the same `orderId`; after both calls, `BacktestRecorder.trades` should contain one entry with `legs.length === 2` and each leg’s `remainingSizeAfter` reflecting the correct remaining size.  

---  

### 5. `core/TRAIDecisionModule.js`  

| Current code | Required change |
|--------------|----------------|
| Constructor builds `this.patternMemory = new Map();` – line **77‑78** | **Add a `pendingOutcomes` Map keyed by `tradeId`** to store partial‑exit data. <br> ```js this.pendingOutcomes = new Map(); // tradeId → {fractionSum, pnlSum, …}``` |
| No handling of `exitFraction` | **When a trade exit is observed** (e.g., via a new `onTradeExit(tradeId, exitInfo)` hook), aggregate the fraction: <br> ```js const agg = this.pendingOutcomes.get(tradeId) || {fractionSum:0, pnlSum:0, exits:[]}; agg.fractionSum += exitInfo.exitFraction; agg.pnlSum += exitInfo.real


---

## PART 2 — Layers 5-8 + Cross-Cutting (continuation)

(max iterations reached without a final answer)


---

## Layers 5-6: TRAI + TradeJournal (19 iterations, 16.6s)

**TRAIDecisionModule.js – where trade outcomes are recorded for learning**  

Current implementation (lines 995‑1007) – the outcome is sent to TRAI immediately on every exit, even for partial legs:

```js
// core/TRAIDecisionModule.js:995‑1007
 995  recordTradeOutcome(tradeData) {
 996    if (!this.traiCore) {
 997      console.log('⚠️ [TRAI] Cannot record trade - TRAI Core not initialized');
 998      return;
 999    }
1000
1001    try {
1002      this.traiCore.recordTradeResult(tradeData);
1003      console.log(`📚 [TRAI] Recorded trade outcome: ${tradeData.profitLoss > 0 ? 'WIN' : 'LOSS'} (${tradeData.profitLossPercent.toFixed(2)}%)`);
1004    } catch (error) {
1005      console.error('❌ [TRAI] Error recording trade outcome:', error.message);
1006    }
1007  }
```

**Proposed change – aggregate outcomes by `tradeId` and fire only when the trade is fully closed**  

1. **Add a `pendingOutcomes` map in the constructor** (right after the existing `patternMemory` map, line 78‑80):

```js
// core/TRAIDecisionModule.js:77‑80 (new line added after 78)
   77    // Pattern memory
   78    this.patternMemory = new Map();
   79    // NEW: hold partial‑exit data until the trade is fully closed
   80    this.pendingOutcomes = new Map(); // tradeId → {aggPnl, aggHoldMs, legCount, lastData}
```

2. **Replace the `recordTradeOutcome` body** (lines 995‑1007) with the aggregation logic:

```js
// core/TRAIDecisionModule.js:995‑1007 (replaced)
 995  recordTradeOutcome(tradeData) {
 996    if (!this.traiCore) {
 997      console.log('⚠️ [TRAI] Cannot record trade - TRAI Core not initialized');
 998      return;
 999    }
1000
1001    const { tradeId, remainingSize } = tradeData;
1002    if (!tradeId) {
1003      console.warn('⚠️ [TRAI] tradeData missing tradeId – cannot aggregate');
1004      return;
1005    }
1006
1007    // Retrieve or create the aggregation entry for this trade
1008    const agg = this.pendingOutcomes.get(tradeId) || {
1009      aggPnl: 0,
1010      aggHoldMs: 0,
1011      legCount: 0,
1012      lastData: null,
1013    };
1014
1015    // Accumulate the partial‑exit results
1016    agg.aggPnl += tradeData.profitLoss;
1017    agg.aggHoldMs += tradeData.holdDuration;
1018    agg.legCount += 1;
1019    agg.lastData = tradeData; // keep latest features for learning
1020
1021    // If the trade is fully closed (remainingSize === 0) fire the learning sample
1022    if (remainingSize === 0) {
1023      const aggregated = {
1024        ...tradeData,
1025        profitLoss: agg.aggPnl,
1026        holdDuration: agg.aggHoldMs,
1027        // other fields (e.g., size) can be taken from the last leg
1028        size: agg.lastData.size,
1029        // keep any additional metadata needed by TRAI
1030      };
1031      try {
1032        this.traiCore.recordTradeResult(aggregated);
1033        console.log(`📚 [TRAI] Recorded aggregated outcome for trade ${tradeId}`);
1034      } catch (error) {
1035        console.error('❌ [TRAI] Error recording aggregated outcome:', error.message);
1036      }
1037        // Clean up the pending entry
1038        this.pendingOutcomes.delete(tradeId);
1039    } else {
1040      // Trade still open – store the partial aggregation
1041      this.pendingOutcomes.set(tradeId, agg);
1042    }
1043  }
```

*Cross‑file dependency*: `recordTradeOutcome` still calls `this.traiCore.recordTradeResult` (the same method used before), but now it does so only once per full trade closure, using the aggregated data. No other files need to be changed.

---

**TradeJournal.js – where the open‑trade entry is deleted**  

Current implementation (lines 162‑219) – the entry is always removed from `openTrades` regardless of whether the exit was partial or full:

```js
// core/TradeJournal.js:162‑219
 162  recordExit(exit) {
 163    if (!exit || !exit.orderId) {
 164      console.warn('📒 TradeJournal: Invalid exit data, skipping');
 165      return;
 166    }
 167
168    const entry = this.openTrades.get(exit.orderId);
169    if (!entry) {
170      // Trade may have been opened before journal was wired — create synthetic entry
171      console.warn(`📒 TradeJournal: No entry found for ${exit.orderId}, recording exit-only`);
172    }
173
174    const now = Date.now();
175    const entryPrice = entry?.entryPrice || exit.entryPrice || 0;
176    const exitPrice = Number(exit.exitPrice || 0);
177    const grossPnl = Number(exit.pnl || 0);
178    const totalFees = Number(entry?.fees || 0) + Number(exit.fees || 0);
179    const netPnl = grossPnl - totalFees;
180    const holdTime = entry ? (now - entry.timestamp) : Number(exit.holdTime || 0);
181    const pnlPercent = entry?.usdValue > 0 ? (netPnl / entry.usdValue * 100) : 0;
182
183    const completedTrade = {
184      event: 'EXIT',
185      timestamp

---

## Layers 7-8 + Map-of-MPM + Cross-Cutting (25 iterations, 27.2s)

**1. `core/UnifiedPatternMemory.js` – `recordOutcome` (current implementation)**  

```js
// core/UnifiedPatternMemory.js
  218   recordOutcome(features, outcome) {
  219     if (!this._validateFeatures(features)) return false;
  220     if (!outcome || typeof outcome.pnl !== 'number') return false;
  221
  222     const sig = computeSignature(features);
  223     if (!sig) return false;
  224
  225     // Create pattern if it wasn't observed first (edge case)
  226     if (!this.patterns[sig]) {
  227       this.patterns[sig] = this._createPattern(sig, features);
  228     }
  229
  230     const p = this.patterns[sig];
  231     const isWin = outcome.pnl > 0;
  232
  233     // Update stats
  234     if (isWin) {
  235       p.wins++;
  236     } else if (outcome.pnl < 0) {
  237       p.losses++;
  238     }
  239
  240     p.totalPnL += outcome.pnl;
  241     const totalTrades = p.wins + p.losses;
  242     p.winRate = totalTrades > 0 ? p.wins / totalTrades : 0;
  243     p.avgPnL = totalTrades > 0 ? p.totalPnL / totalTrades : 0;
  244     p.lastOutcome = Date.now();
  245
  246     // Track outcome history (keep last 20)
  247     p.outcomes.push({
  248       timestamp: Date.now(),
  249       pnl: outcome.pnl,
  250       pnlPercent: outcome.pnlPercent || 0,
  251       holdTimeMs: outcome.holdTimeMs || 0,
  252       exitReason: outcome.exitReason || 'unknown',
  253       strategy: outcome.strategy || 'unknown',
  254       isWin,
  255     });
  256     if (p.outcomes.length > 20) {
  257       p.outcomes = p.outcomes.slice(-20);
  258     }
  259
  260     // Check promotion / quarantine
  261     this._evaluateStatus(p);
  262
  263     this.stats.outcomes++;
  264     return true;
  265   }
```

**Proposed change – add a `pendingOutcomes` map and fire only when the trade is fully closed**  

*Add a field in the constructor*  

```js
// core/UnifiedPatternMemory.js – inside the class constructor
this.pendingOutcomes = new Map(); // tradeId → {features, outcomes[]}
```

*Modify `recordOutcome`*  

```js
// core/UnifiedPatternMemory.js – replace the body of recordOutcome
recordOutcome(features, outcome) {
  if (!this._validateFeatures(features)) return false;
  if (!outcome || typeof outcome.pnl !== 'number') return false;

  const tradeId = outcome.tradeId;               // <-- new field supplied by the caller
  const remainingSize = outcome.remainingSize;   // <-- new field supplied by the caller
  if (!tradeId) return false;   // we need a trade identifier

  // accumulate per‑leg outcomes
  const pending = this.pendingOutcomes.get(tradeId) || {
    features,
    outcomes: [],
  };
  pending.outcomes.push(outcome);
  this.pendingOutcomes.set(tradeId, pending);

  // fire only when the position is fully closed (remainingSize === 0)
  if (remainingSize === 0) {
    const sig = computeSignature(pending.features);
    if (!sig) return false;

    if (!this.patterns[sig]) {
      this.patterns[sig] = this._createPattern(sig, pending.features);
    }
    const p = this.patterns[sig];

    // aggregate all leg outcomes
    pending.outcomes.forEach(o => {
      const isWin = o.pnl > 0;
      if (isWin) p.wins++; else if (o.pnl < 0) p.losses++;
      p.totalPnL += o.pnl;
    });

    const totalTrades = p.wins + p.losses;
    p.winRate = totalTrades > 0 ? p.wins / totalTrades : 0;
    p.avgPnL = totalTrades > 0 ? p.totalPnL / totalTrades : 0;
    p.lastOutcome = Date.now();

    // keep a short history (last 20 aggregated outcomes)
    p.outcomes = pending.outcomes.slice(-20);
    this._evaluateStatus(p);
    this.stats.outcomes++;

    // clean up the pending entry
    this.pendingOutcomes.delete(tradeId);
  }

  return true;
}
```

*Why this works* – By key‑ing on `tradeId` we keep a per‑trade bucket of partial‑leg outcomes. The pattern is recorded **once** when `remainingSize === 0` (the trade is completely closed). A `null`/`undefined` `remainingSize` is ignored, preventing the old per‑leg firing behaviour.

---

**2. `core/exit/BreakEvenManager.js` – `evaluate` (current implementation)**  

```js
// core/exit/BreakEvenManager.js
  35   evaluate(trade) {
  36     const contract = trade.exitContract || {};
  37     const stopLossPercent = contract.stopLossPercent;
  38
  39     // No contract or no SL defined — can't compute BE
  40     if (stopLossPercent === undefined || stopLossPercent === null) {
  41       return {
  42         isBreakEven: false,
  43         effectiveStopPercent: null,
  44         reason: 'no_contract'
  45       };
  46     }
  47
  48     const riskAmount = Math.abs(stopLossPercent);
  49     const maxProfit = trade.maxProfitPercent || 0;
  50
  51     // Break‑even triggers when maxProfit >= initial risk (1:1 payoff)
  52     if (maxProfit >= riskAmount) {
  53       return {
  54         isBreakEven: true,
  55         effectiveStopPercent: -BE_FEE_BUFFER_PERCENT,
  56         reason: `BE active: peak ${maxProfit.toFixed(2)}% >= risk ${riskAmount.toFixed(2)}%`
  57       };
  58     }
  59
  60     return {
  61       isBreakEven: false,
  62       effectiveStopPercent: stopLossPercent,
  63       reason: `Needs ${(riskAmount - maxProfit).toFixed(2)}% more to trigger BE`
  64     };
  65   }
```

**Proposed handling of partial‑close events**  

`BreakEvenManager` should be called **after each partial fill**. The `trade.maxProfitPercent` field already reflects the *peak* profit of the *remaining* size, so the existing logic works for the remaining half **provided the trade object’s `maxProfitPercent` is updated after the partial close**.  

*Implementation tip* – In `PositionTracker.closePosition` (see §3) after a partial close, recompute `trade.maxProfitPercent` for the *remaining* size and invoke `breakEvenManager.evaluate(trade)` again. This will set the stop to breakeven for the remaining portion without affecting the already‑closed leg.

---

**3. Where should a `Map` of `MaxProfitManager` instances live?**  

The most logical place is **`StateManager`**, because it already owns the central `activeTrades` map (see line 106) and is the single source of truth for all per‑trade state.

*Evidence – `StateManager` already stores a map of active trades*  

```js
// core/StateManager.js
  106   activeTrades: new Map(),  // orderId → { size, price, entryTime, ... }
```

*Add a new map in the constructor*  

```js
// core/StateManager.js – inside the constructor (around

---

## FINAL: Map-of-MPM + Commit Ordering + Verification

**1️⃣ MAP‑OF‑MPM‑INSTANCES – full implementation**

| What you need | Where to put it (file : line) | Code (exact) |
|---|---|---|
| **a) Declare the Map in the `StateManager` constructor** | `core/StateManager.js` – after the `activeTrades` entry (line 106‑108) | ```js\n  106\t      activeTrades: new Map(),  // orderId → { size, price, entryTime, ... }\n  107\t      // NEW: hold a MaxProfitManager per trade\n  108\t      profitManagers: new Map(), // tradeId → MaxProfitManager instance\n``` |
| **b) Create a new `MaxProfitManager` on `openPosition`** | `core/StateManager.js` – immediately after the `activeTrades.set(tradeId, trade);` statement (line 387) | ```js\n  387\t    this.state.activeTrades.set(tradeId, trade);\n  388\t    // NEW: instantiate a MaxProfitManager for this trade and store it\n  389\t    const MaxProfitManager = require('./MaxProfitManager');\n  390\t    this.state.profitManagers.set(tradeId, new MaxProfitManager({ tradeId, entryPrice: price, direction: tradeDirection }));\n``` |
| **c) Destroy the instance on full close** | `core/StateManager.js` – right after the trade is removed from `activeTrades` (line 490‑492) and also after the “clear‑all‑trades” branch (line 500) | ```js\n  490\t        this.state.activeTrades.delete(tradeId);\n  491\t        console.log(`🔒 [StateManager] Removed trade ${tradeId} (${trade?.action || trade?.type}) from activeTrades`);\n  492\t        // NEW: clean up the MaxProfitManager for this trade\n  493\t        if (this.state.profitManagers) this.state.profitManagers.delete(tradeId);\n``` |
| **d) Get the correct MPM instance from a loop / executor** | `core/TradingLoop.js` – replace the old `this.ctx.maxProfitManager` reference (around line 170‑172) with a lookup in the `StateManager` map | ```js\n  170\t      // MaxProfitManager check (PATCH 1: enriched context)\n  171\t      const mpm = this.ctx.stateManager.profitManagers.get(activeTrade.id);\n  172\t      if (mpm?.state?.active) {\n``` |

*All of the above lines are added **exactly** where indicated, preserving the surrounding code.*


---

**2️⃣ COMMIT ORDERING – dependency graph for the 8 layers**

| # | Layer (module) | Must land **atomically** (single‑transaction) | Can be **sequenced** after previous layer |
|---|----------------|----------------------------------------------|------------------------------------------|
| 1 | `core/StateManager.js` (global state, `profitManagers` map) | **Yes** – any change to `state` or `profitManagers` must be a single atomic `updateState` call. | – |
| 2 | `core/MaxProfitManager.js` (per‑trade profit optimisation) | **No** – independent per‑trade objects; they are created/destroyed by the StateManager. | After StateManager is live. |
| 3 | `core/OrderExecutor.js` (executes decisions, calls `stateManager.reducePosition`) | **Yes** – the call to `reducePosition` (new method) must be atomic with the trade‑exit logic. | After StateManager and MaxProfitManager exist. |
| 4 | `core/TradingLoop.js` (decision engine, reads `stateManager` & `profitManagers`) | **No** – reads only; can run after OrderExecutor. | After OrderExecutor is deployed. |
| 5 | `core/BacktestRecorder.js` (records legs, groups by `tradeId`) | **Yes** – each `recordTrade` must be atomic with the trade‑exit event. | After OrderExecutor writes the exit. |
| 6 | `core/TRAIDecisionModule.js` (aggregates outcomes) | **No** – aggregates over multiple legs; can be sequenced after BacktestRecorder. | After BacktestRecorder. |
| 7 | `core/UnifiedPatternMemory.js` (stores pattern memory per parent trade) | **Yes** – writes must be atomic per‑trade to avoid duplicate samples. | After TRAIDecisionModule aggregates a full‑close. |
| 8 | `core/TradeJournal.js` (human‑readable log) | **No** – only logs; can be sequenced after UnifiedPatternMemory. | After UnifiedPatternMemory. |

**Atomic‑only layers** are 1, 3, 5, 7 – they modify shared state that must not be interleaved. All other layers can be applied in the order shown.

---

**3️⃣ VERIFICATION CRITERIA – back‑test to prove the fix**

| Goal | Command / Check | What to look for |
|------|----------------|------------------|
| **a) Run the back‑test** | ```bash\nnode backtest/backtest.js --config config/backtest.json --output results/2026-04-14.jsonl\n``` | The script should finish without errors and write a JSONL file (`results/2026-04-14.jsonl`). |
| **b) Verify multi‑leg trades** | ```bash\njq 'select(.exits | length > 1)' results/2026-04-14.jsonl | wc -l\n``` | The count should be > 0, confirming at least one trade has `exits.length > 1`. |
| **c) Expected P&L change** | After the run, grep the final P&L line: <br>```bash\njq '.finalPnL' results/2026-04-14.jsonl | tail -1\n``` | The value should be **different** from the old buggy result (`-282.35`). With the new MPM logic you should see a *higher* (less negative) P&L, e.g. `‑150.00` → `‑30.00` (exact number depends on data). |
| **d) Pattern‑memory single‑sample per parent trade** | ```bash\njq 'select(.type=="patternMemory") | .parentTradeId' results/2026-04-14.jsonl | sort | uniq -c | awk '$1>1{print $2}'\n``` | The command must output **nothing** – each `parentTradeId` appears only once, confirming the duplicate‑sample bug is fixed. |

Running the above steps and confirming the three checks (multi‑leg trades exist, P&L improves, and pattern‑memory has a single entry per parent) demonstrates that the MAP‑OF‑MPM‑INSTANCES refactor works as intended.

---

## V3 SUPPLEMENT — 7 Gap Fills

**Supplementary doc – filling the 7 gaps in the V2 refactor plan**  

---

### 1. TRADEJOURNAL – recordExit “delete‑vs‑update” gap  

**Current (pre‑V2) delete logic** – *core/TradeJournal.js*  

```js
// 218‑219  (current V2 code)
this.openTrades.delete(exit.orderId);
```

**Desired change – keep the entry when a partial close remains**  

```js
// 218‑226  (replace the two‑line delete with conditional branching)
if (exit.remainingSize && exit.remainingSize > 0) {
  // Partial close – update the open‑trade entry with the new remaining size
  const entry = this.openTrades.get(exit.orderId);
  if (entry) {
    entry.size = exit.remainingSize;          // keep original entry fields, shrink size
    entry.usdValue = entry.size * entry.entryPrice;
    this.openTrades.set(exit.orderId, entry);
  }
} else {
  // Full close – remove the entry completely
  this.openTrades.delete(exit.orderId);
}
```

*Lines shown are from the same file; the replacement starts at line 218 and ends at line 226.*  

---

### 2. BREAKEVENMANAGER – where to invoke `evaluate` after a partial close  

The break‑even state must be refreshed **after a partial exit** and **before the position‑scalar update**.  

**Insertion point** – *core/StateManager.js* (inside `closePosition`)  

```js
// 511‑518  (add after the ledger write but before the final `updates` object)
if (partial && trade) {
  // Re‑evaluate break‑even for the remaining portion of the trade
  const beState = this.breakEvenManager.evaluate(trade);
  console.log(`🛡️ BreakEvenManager re‑evaluated: ${JSON.stringify(beState)}`);
}
```

*The snippet starts at line 511 (right after the ledger persistence block) and ends at line 518.*  

---

### 3. L6 LEDGER – push a leg entry into `trade.decisionLedger.exits[]`  

The exit‑leg record should be added **once the ledger outcome is written**.  

**Insertion point** – *core/StateManager.js* (still inside `closePosition`, after `trade.decisionLedger.outcome` is set)  

```js
// 526‑534  (push the leg entry into the exits array)
if (trade.decisionLedger) {
  const legEntry = {
    legNumber: (trade.decisionLedger.exits?.length || 0) + 1,
    exitReason: exit.reason || 'partial',
    exitPrice: price,
    exitFraction: exit.fraction,          // fraction of ORIGINAL position size (see §4)
    exitSizeUsd: closeSize,
    realizedPnL: pnl,
    pnlPercent,
    triggeredBy: context.triggeredBy || 'StateManager',
    remainingSizeAfter: exit.remainingSize || 0,
    timestamp: Date.now(),
    indicatorState: trade.indicators || {}
  };
  trade.decisionLedger.exits.push(legEntry);
}
```

*Lines start at 526 and finish at 534.*  

---

### 4. FRACTION SEMANTICS – `exitFraction` must be based on the **original** position size  

`TradeJournal.recordExit` currently does not compute `exitFraction`. Add it using the *original* entry size (`entry?.sizeUsd`).  

**Insertion point** – *core/TradeJournal.js* (inside `recordExit`, after `exitSize` is known)  

```js
// 190‑196  (calculate exitFraction from the original trade size)
const originalSize = entry?.sizeUsd || entry?.size || 0;
const exitSize = Number(exit.size || 0);
const exitFraction = originalSize > 0 ? exitSize / originalSize : 0;

// include it in the completedTrade payload
completedTrade.exitFraction = exitFraction;
```

*Lines 190‑196 are added right after the size calculations (around line 190 in the file).*  

---

### 5. IN‑FLIGHT TRADE MIGRATION – re‑create MPM instances on restore  

When the `StateManager` loads persisted state, each active trade must regain its own **MaxProfitManager (MPM)** instance.  

**Insertion point** – *core/StateManager.js* (after the log that prints restored trade count)  

```js
// 952‑960  (re‑instantiate MPM for every active trade)
if (this.state.activeTrades && this.state.activeTrades.size > 0) {
  const { MaxProfitManager } = require('./MaxProfitManager');
  for (const [id, trade] of this.state.activeTrades.entries()) {
    trade.mpm = new MaxProfitManager({
      entryPrice: trade.entryPrice,
      sizeUsd: trade.sizeUsd,
      exitContract: trade.decisionLedger?.exitContract
    });
    console.log(`🔧 MPM recreated for trade ${id}`);
  }
}
```

*Lines start at 952 and end at 960, right after the “Active trades restored” log (line 950).*  

---

### 6. DEC‑013 – ensure `TradingConfig.exitContracts` is **unchanged**  

The refactor never mutates the `exitContracts` block. The source of truth remains the static config object.  

*File & line* – *core/TradingConfig.js*  

```js
// 247‑250  (definition of exitContracts – never modified elsewhere)
exitContracts: {
  // ... per‑strategy contracts
},
```

All reads of exit contracts go through `TradingConfig.BASE_CONFIG.exitContracts` (see lines 844‑854 in the same file). No write‑operations were added in the V2 changes.  

---

### 7. RECORDTRADEOUTCOME – list of callers  

| Caller file | Line | Context |
|-------------|------|---------|
| `core/TRAIDecisionModule.js` | **995** | `recordTradeOutcome(tradeData) { … }` |
| `core/PatternMemoryBank.js` | **231** | `recordTradeOutcome(trade) { … }` |
| `core/OrderExecutor.js` | **860** | `this.ctx.trai.recordTradeOutcome({ … })` |
| `ogz-meta/pipeline-audit.js` (test harness) | **774** | `{ name: 'trai.recordTradeOutcome() on SELL', pattern: /recordTradeOutcome\(/ }` |

Only the three core files (lines 995, 231, 860) are production callers; they already pass the required `tradeId`/`orderId`. No additional callers need to be updated.  

---

**Summary** – The above snippets (with exact file:line citations) close the seven gaps identified in the V2 refactor plan. They provide the missing concrete code for the delete‑vs‑update logic, break‑even re‑evaluation, ledger exit‑leg integration, correct fraction semantics, MPM recreation on restore, confirmation that `exitContracts` stays immutable, and a full audit of `recordTradeOutcome` callers.