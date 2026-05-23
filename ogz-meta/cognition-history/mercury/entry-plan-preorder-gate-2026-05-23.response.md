[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=landmine mode=hybrid-classified boost=landmine top-k=8
[MERCURY-BRIDGE] Rationale: landmine/rules pattern detected; boost landmine and guardrails
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/fixes.jsonl:77-77 (jsonl_record: FIX-2026-04-23-ORDEREXECUTOR-LEGACY-BRANCH) sim=0.672
  2. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:74-90 (doc_section: Prompt) sim=0.688
  3. ogz-meta/sessions/session-2026-05-12-cc-c-6a-path-b-attempt-symbol-mislabel-discovered.md:133-148 (doc_section: Open Items for Next Session (Ranked)) sim=0.713
  4. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-2026-05-18T11-07-39-506Z.md:16-45 (doc_section: Prompt) sim=0.687
  5. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-retry1-2026-05-18T11-09-54-024Z.md:16-45 (doc_section: Prompt) sim=0.687
  6. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-take3-2026-05-18T15-25-48-512Z.md:16-45 (doc_section: Prompt) sim=0.687
  7. ogz-meta/cognition-history/mercury-attacks/fix16-orderexecutor-attack-2026-05-14T00-32-17-153Z.md:12-24 (doc_section: Mercury Verdict) sim=0.667
  8. ogz-meta/slash-router.js:1662-1732 (function: debuggerHandler) sim=0.429
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 288 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.83, 6 iters, used 4x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
⚠️ TRAI response empty after cleaning
✅ TRAI LLM warm-up complete (630ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[REACT] Iteration 1/60
[REACT] Message history: 4 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing list_files({"path":"core","pattern":"OrderExecutor.js"})
[REACT] Iteration 2/60
[REACT] Message history: 6 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/OrderExecutor.js","start_line":1,"end_line":200})
[REACT] Iteration 3/60
[REACT] Message history: 8 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/OrderExecutor.js","start_line":200,"end_line":400})
[REACT] Iteration 4/60
[REACT] Message history: 10 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"openPosition","file_pattern":"core/OrderExecutor.js"})
[REACT] Iteration 5/60
[REACT] Message history: 12 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/OrderExecutor.js","start_line":460,"end_line":540})
[REACT] Iteration 6/60
[REACT] Message history: 14 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing search({"path":"core/OrderExecutor.js","query":"adjustedPositionSize"})
[REACT] Iteration 7/60
[REACT] Message history: 16 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"adjustedPositionSize","file_pattern":"core/OrderExecutor.js"})
[REACT] Iteration 8/60
[REACT] Message history: 18 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"webhook","file_pattern":"core/OrderExecutor.js"})
[REACT] Iteration 9/60
[REACT] Message history: 20 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"test/order-executor-pause-gate.test.js","start_line":150,"end_line":350})
[REACT] Iteration 10/60
[REACT] Message history: 22 messages
[REACT] Final answer on iteration 10
[MERCURY-BRIDGE] Trace inserted (quality=146.9)

═══ ANSWER ═══

**Severity‑ordered findings**

| # | Finding | Severity | Evidence (file:line) | Verdict |
|---|---------|----------|----------------------|--------|
| 1 | **No side‑effect can occur before the pre‑order gate** – all broker routing, webhook emission, `StateManager.openPosition()`, `MaxProfitManager.start()` and notifications are placed *after* the gate check. | **Real blocker – none** (the patch correctly orders the gate) | Gate is invoked at lines 278‑285; broker routing at 337‑354; open‑position at 479‑500; profit‑manager at 517‑525; webhook at 546‑554 (BUY) and 712‑720 (SELL_SHORT) | ✅ No path reaches those side‑effects before the gate. |
| 2 | **Gate and downstream components see the same quantity** – the gate receives `entryPlan.orderQuantity` (line 99) and the broker is sent the same value (line 348). `StateManager.openPosition()` receives `adjustedPositionSize = entryPlan.sizeUsd` (line 454) which is the USD notional the gate also saw (line 96‑99). | **Acceptable residual risk** – the design intentionally splits “shares” (broker) from “USD” (state). | Gate sees `orderQuantity` (99) → `sendOrder.amount` (348); gate sees `sizeUsd` (96‑99) → `openPosition` USD (479‑500) | ✅ No mismatch. |
| 3 | **Potential USD‑as‑shares slip for stocks** – `_entryQuantityUnit()` decides the unit from `ctx.config.assetClass`. If the asset class string is miss‑spelled, contains whitespace, or is a synonym not listed (`'equity'`, `'stock '`), the function falls back to `'base'`. In that case `orderQuantity` will be a raw USD‑derived float (line 68‑69) and the broker will receive a USD notional instead of an integer share count. | **Real blocker** – mis‑classification would cause Alpaca (or any stock broker) to interpret the amount as shares, leading to huge orders or rejections. | `_entryQuantityUnit()` (51‑56) returns `'shares'` only for exact matches; otherwise `'base'`. `orderQuantity` (66‑70) uses that unit. | ⚠️ The patch does **not** validate the asset‑class string, so a malformed config can re‑introduce the USD‑as‑shares bug. |
| 4 | **Crypto/base‑asset routing may be harmed** – for non‑stock assets the code correctly uses `quantityUnit='base'` and sends the raw quantity (lines 66‑70). However, later the same `entryPlan` is passed to the webhook (lines 546‑554 & 712‑720) which expects a *share*‑type quantity (`shares` variable derived from `entryPlan.orderQuantity`). If the broker expects a different base‑unit (e.g., satoshis) the webhook will report a drift‑block warning and the trade will be invisible to downstream TTP. | **Existing unrelated bug** – the webhook‑drift check already exists; the patch does not fix it. | Webhook drift warning (552‑554 for BUY, 718‑720 for SELL_SHORT) | ✅ No new bug, but the same limitation persists. |
| 5 | **Exit actions (SELL/COVER) use USD size instead of shares** – after the gate, the code falls back to `positionSize` (USD) for the `amount` field when `entryPlan` is falsy (i.e., for non‑entry actions). This occurs at line 348 (`amount: entryPlan ? entryPlan.orderQuantity : positionSize`). For a SELL/COVER the amount sent to the broker is therefore a USD notional, not the share quantity, which can cause incorrect order sizing. | **Real blocker** – exits can be mis‑sized after this change. | Exit path uses `positionSize` (USD) as amount (348) when `entryPlan` is null; `entryPlan` is null for SELL/COVER (line 143‑144). | ⚠️ This is a regression introduced by the new entry‑plan flow. |
| 6 | **Back‑test / paper accounting shift** – the patch always computes `adjustedPositionSize = entryPlan.sizeUsd` (line 454) and passes it to `StateManager.openPosition()` and `MaxProfitManager.start()`. In back‑test mode the same USD‑based size is used, whereas the historic implementation used the *share* quantity for back‑test accounting. This can change the P0 anchor balance if the back‑test engine expects share‑based sizing. | **Acceptable residual risk** – the test suite (including the P0 anchor run) still passes, but the change may affect future back‑test runs that rely on the old accounting. | Open‑position call (479‑500) and profit‑manager start (517‑525) both use `adjustedPositionSize` (USD). | ✅ No immediate failure, but a subtle accounting drift is possible. |
| 7 | **Hidden assumption in `_entryQuantityUnit()`** – the function lower‑cases the config value but does **not** trim whitespace or handle synonyms. Any asset‑class string that is not exactly `'stocks'`, `'stock'` or `'equities'` (e.g., `'stock '` or `'Equity'`) will be treated as `'base'`. This can silently switch a stock trade to base‑unit handling, breaking the share‑quantity contract. | **Real blocker** – unsafe for future broker/asset‑class extensions. | Lines 51‑56; no `trim()` or synonym map. | ⚠️ Must be hardened (e.g., `String(...).trim().toLowerCase()`). |
| 8 | **Test gaps** – the current test suite only exercises BUY entry, the gate‑block path, and throughput for BUY. It does **not** cover: <br>• SELL_SHORT entry (same logic but not verified). <br>• EXIT actions (SELL/COVER) where the USD‑vs‑share mismatch appears. <br>• Crypto or other non‑stock asset classes where `_entryQuantityUnit()` may mis‑detect. <br>• Scenarios where the gate allows but the broker returns an error (to ensure no side‑effects leak). | **Existing unrelated bug** – the missing coverage could let the above bugs slip through. | Tests in `test/order-executor-pause-gate.test.js` (166‑214, 216‑257, 259‑301) only cover BUY. | ✅ Add tests for SELL_SHORT, exits, and crypto asset class. |

**Answer to the architecture question**

The patch **does close the original “USD‑as‑shares” symptom for the *entry* path** by explicitly building an `entryPlan` that carries both `sizeUsd` and `orderQuantity` (lines 72‑103) and by routing the broker with `orderQuantity` (line 348) while the state manager receives the USD size (line 479). The pre‑order gate is now executed **before any side‑effects** (lines 278‑285).

However, the fix **only hides the symptom for the entry side** and introduces new failure modes:

* Mis‑classification of the asset class in `_entryQuantityUnit()` can revert the fix and send USD notional to a stock broker (Finding 3 & 7).
* Exit trades (SELL/COVER) now use the USD `positionSize` as the broker amount because `entryPlan` is null for those actions (Finding 5).
* The change alters the accounting basis for back‑test/paper runs (Finding 6), which could shift the P0 anchor in future runs.

In short, the patch correctly gates and separates entry‑size handling but **fails to protect non‑entry actions and relies on a fragile asset‑class detection**, leaving the system vulnerable to the very class it intended to eliminate. Additional validation of `ctx.config.assetClass` and explicit handling of exit quantities are required, and the test suite should be expanded to cover those paths.

[iterations: 10 | termination: answer_given | latency: 46909ms]
