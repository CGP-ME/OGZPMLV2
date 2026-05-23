[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=contract_bug mode=hybrid boost=none top-k=0
[MERCURY-BRIDGE] Rationale: contract bug pattern detected; starter context is usually noise, prefer agentic tools
[MERCURY-BRIDGE] Starter context: skipped (router policy=skip)
[MERCURY-BRIDGE] Starter context: 0 chunks
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 293 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.89, 11 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (367ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=258.9)

═══ ANSWER ═══

The code no longer contains any “USD‑unit” path for live stocks, so the original unit‑mismatch attack cannot be reproduced.

* `core/OrderExecutor.js` determines the quantity unit from the asset class and for stocks/equities/ETFs returns **`'shares'`** (lines 61‑69).
* A repository‑wide grep for `usd` in production code finds no occurrence that would set `quantityUnit` to `"usd"` (the only matches are test files and comments).
* The exit‑plan builder (`_buildExitPlan`) also uses the same `_orderQuantityUnit()` value, so the `quantityUnit` for a live **SELL/COVER** is always **`'shares'`** (lines 146‑193).
* When a partial exit is processed, `StateManager.reducePosition` stores the unit that comes from the order‑execution context, which is the same `quantityUnit` that was used to create the exit plan (line 793 in `core/StateManager.js`).

Because the broker‑side quantity (`qty` in Alpaca) and the platform‑side quantity are both in **shares**, there is no pathway for a mismatch that would cause a wrong share count, corrupt `activeTrades.remainingOrderQuantity`, or create a state/broker divergence. The earlier “USD‑unit” vector is therefore **invalid under the current code**.

*Conclusion:* No real input sequence exists that exploits a unit‑mismatch for live stock SELL/COVER under the present implementation. The strongest remaining vector would be a rounding‑difference (flooring of fractional shares), but that does not corrupt `remainingOrderQuantity` since the same unit (`shares`) is used throughout.

[iterations: 23 | termination: answer_given | latency: 28877ms]
