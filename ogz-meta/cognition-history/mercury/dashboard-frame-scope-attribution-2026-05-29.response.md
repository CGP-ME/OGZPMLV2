[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/dashboard-pattern-card-shape-parser-2026-05-29.md:1-26 (doc_section: root) sim=0.749
  2. ogz-meta/cognition-history/mercury/candle-ingress-scope-stamping-2026-05-26.md:1-28 (doc_section: root) sim=0.712
  3. ogz-meta/cognition-history/mercury/dashboard-chart-asset-routing-recheck-2026-05-29.md:1-29 (doc_section: root) sim=0.723
  4. ogz-meta/cognition-history/mercury/dashboard-pattern-card-shape-parser-recheck-2026-05-29.md:1-29 (doc_section: root) sim=0.706
  5. ogz-meta/cognition-history/mercury/dashboard-pattern-card-shape-parser-final-recheck-2026-05-29.md:1-32 (doc_section: root) sim=0.712
  6. ogz-meta/cognition-history/mercury/dashboard-chart-asset-routing-2026-05-29.md:1-25 (doc_section: root) sim=0.722
  7. ogz-meta/cognition-history/mercury/candle-ingress-scope-stamping-recheck-2026-05-26.md:1-28 (doc_section: root) sim=0.687
  8. ogz-meta/cognition-history/mercury/pattern-memory-scope-isolation-2026-05-26.md:1-57 (doc_section: root) sim=0.690
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 424 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.79, 13 iters, used 5x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (322ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=191.3)

═══ ANSWER ═══

**Answer**

The current patch does **not** guarantee that a dashboard frame of type `signal_analysis`, `bot_thinking`, `golden_setup_state` or `pattern_analysis` can never be sent without a truthful `symbol` (or with stale scope). The following concrete code paths demonstrate the gaps:

1. **`_broadcastDecision` can be called with an undefined/incorrect `symbol`.**
   - The decision‑broadcast entry at **core/TradingLoop.js:936** forwards the `symbol` that is in scope at that point:

   ```js
   this._broadcastDecision(symbol, price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence);
   ```

   The `symbol` variable is taken from the surrounding loop (e.g. the `directionFilter` block) but there is **no explicit guard** that it is defined before this call. If the upstream data source (e.g. a broker feed) fails to provide a symbol, the call will still happen, and `_broadcastDecision` will construct a dashboard frame with an undefined `symbol` (see **core/TradingLoop.js:1333‑1337** where `scope = this._dashboardScope(symbol)` and the frame spreads `...scope`).

2. **`_broadcastAndReturn` also forwards the same `symbol` without validation.**
   - The direction‑filter early‑exit at **core/TradingLoop.js:607‑626** calls `_broadcastAndReturn(symbol, …)` (lines **608** and **626**). The same lack of validation applies, so a missing symbol can produce a `signal_analysis` frame (via `_broadcastDecision` inside `_broadcastAndReturn`) with an undefined symbol.

3. **`broadcastPatternAnalysis` can receive a stale or missing symbol but only throws after the envelope is built.**
   - The function normalises the symbol (`normalizeRuntimeSymbol(symbol)`) and throws if the result is falsy (lines **2609‑2612**). However, the envelope is built **after** the symbol is normalised and **before** the throw check is performed for the `scope` (`this.getCandleScopeEnvelope({ symbol: dashboardSymbol })`). If `normalizeRuntimeSymbol` returns a falsy value (e.g. an empty string) the function still creates a `scope` that may contain a previous session’s symbol (the envelope may reuse cached values). The throw only aborts the send, but the `scope` construction has already accessed potentially stale data.

4. **`_dashboardScope` can return a stale scope when a router is disabled.**
   - When `routerEnabled` is `false`, the scope fields fall back to static config values (`cfg.brokerId`, `cfg.assetClass`, etc.) (lines **104‑110**). If a previous session set those config values for a different symbol, the subsequent frame will carry those stale values while the `symbol` field might be undefined or from a previous session. The guard that throws on missing fields only runs when `routerEnabled` is `true` (lines **111‑119**), so in non‑router mode the function silently returns a possibly stale scope.

5. **`_sendDashboardFrame` does not verify the payload.**
   - The method simply JSON‑stringifies the frame and sends it (lines **129‑131**). No sanity‑check for `symbol` is performed, so any malformed frame built upstream (as described above) will be transmitted unchanged.

6. **`_broadcastGateEvent` also forwards the raw `symbol` without validation.**
   - The guard builds a scope using `_dashboardScope(symbol)` (line **150**) and sends a `risk_check` event. If the caller supplies an undefined `symbol`, the same stale‑scope issue applies.

**Consequences**

- A missing or stale `symbol` can reach the websocket in any of the four frame types because the only validation performed is a *throw* in `broadcastPatternAnalysis` **after** the envelope is already constructed, and the other broadcast paths have no checks at all.
- The patch therefore **does not fully enforce the producer‑contract**; it merely adds the `symbol` argument to more functions but does not guarantee its correctness.
- No change was made to trade execution or back‑test logic, so those parts remain unaffected, but the dashboard‑contract mechanism is only partially fixed.

**Summary of evidence**

- Calls to `_broadcastAndReturn` without guard: **core/TradingLoop.js:608, 626**.
- Call to `_broadcastDecision` without guard: **core/TradingLoop.js:936**.
- Frame construction using possibly undefined `symbol`: **core/TradingLoop.js:1333‑1337**, **1361‑1368**, **1407‑1414**.
- Normalisation and throw order in pattern broadcast: **run-empire-v2.js:2609‑2612**.
- Scope fallback logic that may be stale: **core/TradingLoop.js:104‑110** (router disabled).
- No payload validation in send routine: **core/TradingLoop.js:129‑131**.

These points demonstrate that the patch does not completely eliminate the risk of unscoped or stale dashboard frames.

[iterations: 18 | termination: answer_given | latency: 11266ms]
