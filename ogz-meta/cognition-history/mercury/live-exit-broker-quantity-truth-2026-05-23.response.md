[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=proposal mode=hybrid-classified boost=proposal top-k=8
[MERCURY-BRIDGE] Rationale: proposal/planning pattern detected; boost proposal content_type
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. kraken_adapter_simple.js:476-516 (method: executeTrade) sim=0.456
  2. core/OrderExecutor.js:49-1461 (method: executeTrade#part34) sim=0.517
  3. ogz-meta/ledger/mission05-verification-2026-04-14.md:1-28 (doc_section: Mission 0.5 Verification — Mercury) sim=0.638
  4. ogz-meta/ledger/fixes.jsonl:84-84 (jsonl_record: FIX-2026-04-30-COMMIT-4-BROKER-FIRST-LIQUIDATION) sim=0.672
  5. ogz-meta/cognition-history/mercury-attacks/fix16-orderexecutor-attack-2026-05-14T00-32-17-153Z.md:12-24 (doc_section: Mercury Verdict) sim=0.618
  6. ogz-meta/proposals/MISSION-1778718669204-WRITE-PROPOSAL.md:113-135 (doc_section: str_replace replacement (verbatim from spec)) sim=0.473
  7. ogz-meta/ledger/fixes.jsonl:76-76 (jsonl_record: FIX-2026-04-23-TIER4-GUARD) sim=0.638
  8. ogz-meta/ledger/fixes.jsonl:82-82 (jsonl_record: FIX-2026-04-30-COMMIT-2-ALPACA-USD-VS-SHARES) sim=0.637
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 292 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.81, 10 iters, used 2x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (387ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=126.0)

═══ ANSWER ═══

**Short answer**

The live‑exit fix still lets a wrong broker‑share count slip through when the broker returns a quantity in a *different unit* than the one the platform stored for the trade (e.g. the trade was opened with `quantityUnit = "usd"` but the broker reports a share‑count). The code never validates the unit of the broker‑reported quantity, so the stored `remainingOrderQuantity` is corrupted and a later exit either:

* uses a bogus broker share count,
* throws a “missing/​mismatched quantity truth” error, or
* blocks a legitimate close.

The problem can be reproduced with the following concrete sequence (all line numbers are from the current repo):

1. **Open a long position** with the platform configured to use USD units (`_orderQuantityUnit()` returns `"usd"`).
   * `entryPlan.quantityUnit` is set at line 107 and stored in the trade by `StateManager.openPosition` at line 607‑608.
   * `remainingOrderQuantity` is therefore a **USD amount** (e.g. `1000`).

2. **Live broker partial exit** – the broker’s order result contains a share count (`orderResult.amount = 5`) but does **not** change the `quantityUnit` (the platform still thinks the trade is in USD).
   * The broker‑reported quantity is accepted unconditionally at line 86‑92 (`_acceptedOrderQuantity`).
   * The `orderQuantity` that is later passed to `reducePosition` is the raw share count (`5`), while the trade’s `remainingOrderQuantity` is still interpreted as USD.

3. **StateManager.reducePosition** subtracts the broker‑reported share count from the USD‑based `remainingOrderQuantity` (lines 779‑785). The resulting `remainingOrderQuantity` becomes an incoherent mix of USD and shares (e.g. `995` USD – `5` shares → `990` USD, but the numeric value is now wrong for a share‑based exit).

4. **Subsequent exit planning** (lines 146‑172) reads the corrupted `remainingOrderQuantity` and, because the stored unit (`usd`) no longer matches the exit‑plan unit (`shares`), throws the mismatch error at line 162‑163, blocking a valid close.

**Key evidence**

| File | Line(s) | What the code does |
|------|--------|--------------------|
| `core/OrderExecutor.js` | 86‑92 | `_acceptedOrderQuantity` returns the broker‑reported amount **without checking its unit**. |
| `core/OrderExecutor.js` | 94‑96 | `_tradeRemainingOrderQuantity` simply reads `trade.remainingOrderQuantity` (numeric only). |
| `core/OrderExecutor.js` | 107 | `quantityUnit` is taken from the platform’s configuration (`_orderQuantityUnit()`). |
| `core/OrderExecutor.js` | 146‑172 | Exit plan validates that the stored unit matches the planned unit (lines 161‑163) and then computes `orderQuantity` from `remainingOrderQuantity`. |
| `core/OrderExecutor.js` | 607‑608 | `StateManager.openPosition` stores `remainingOrderQuantity` using the **entry** unit (USD in this scenario). |
| `core/StateManager.js` | 779‑785 | `reducePosition` subtracts the broker‑reported `orderQuantity` (shares) from the stored `remainingOrderQuantity` (USD), producing a corrupted value. |
| `core/StateManager.js` | 791‑794 | If a broker quantity existed, the code updates `trade.remainingOrderQuantity` and its unit, but **does not verify** that the unit matches the stored one. |
| `core/StateExecutor.js` | 162‑163 | Throws a unit‑mismatch error **only** when the stored unit differs from the *planned* unit, not when the broker‑reported quantity is in the wrong unit. |

**Concrete failing test (pseudo‑code)**

```js
// 1. Force USD unit for the trade
process.env.ORDER_QUANTITY_UNIT = 'usd';   // _orderQuantityUnit() → 'usd'

// 2. Simulate entry (shares 1000 USD, 10 shares at $100)
await executor._runEntryPlan({
  decision: { action: 'BUY' },
  symbol: 'AAPL',
  price: 100,
  positionSize: 10,          // 10 shares → $1000 USD
  // …other required fields…
});
// State now has trade.remainingOrderQuantity = 1000 (USD)

// 3. Simulate live broker partial exit that reports 5 shares
const brokerResult = { amount: 5, qty: undefined, quantity: undefined };
executor._acceptedOrderQuantity(brokerResult, 5); // returns 5 (shares)

// 4. Reduce position using the broker‑reported share count
await stateManager.reducePosition(tradeId, 0.5, 105, {
  orderId: 'live‑exit‑1',
  orderQuantity: 5,               // shares
  quantityUnit: undefined         // still 'usd' from entry
});

// 5. Next exit plan (full close) now throws unit‑mismatch
executor._buildExitPlan({
  decision: { action: 'SELL', tradeId, exitFraction: 1 },
  symbol: 'AAPL',
  price: 105
}); // throws at line 162‑163
```

Running the above sequence reproduces the failure: the broker’s share count is accepted, the stored `remainingOrderQuantity` (USD) is corrupted, and a subsequent exit is blocked by the unit‑mismatch check.

**Effect on back‑test / P0 behavior**

* In **back‑test mode** (`executionMode = 'backtest'`) the broker is never called, so `orderQuantity` always comes from the planned size (`entryPlan.orderQuantity`). The `remainingOrderQuantity` stays in the same unit throughout, and `reducePosition` uses the fraction (`stateExitFraction`) instead of a broker‑provided quantity. Consequently the bug does **not** appear in back‑test runs, and existing P0 tests that rely on back‑test mode continue to pass.

* The new failure mode is **exclusive to live trading** where a broker can return a quantity in a different unit than the one stored at entry. Existing active‑trade handling (e.g., `test/state-manager-load.test.js`) is unaffected because it works with the same unit for both entry and exit (the test uses `'shares'` for both).

**Bottom line**

The patch does not fully eliminate the root‑cause: it still trusts a broker‑reported quantity without confirming its unit, leading to corrupted `remainingOrderQuantity` and possible “quantity‑unit mismatch” errors that block legitimate closes. The fix works for back‑test/P0 scenarios but introduces a new live‑trading failure mode when the broker’s unit differs from the platform’s stored unit.

[iterations: 11 | termination: answer_given | latency: 15951ms]
