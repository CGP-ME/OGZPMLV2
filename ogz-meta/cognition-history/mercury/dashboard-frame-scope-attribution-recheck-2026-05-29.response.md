[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/candle-ingress-scope-stamping-2026-05-26.md:1-28 (doc_section: root) sim=0.727
  2. ogz-meta/cognition-history/mercury/candle-ingress-scope-stamping-recheck-2026-05-26.md:1-28 (doc_section: root) sim=0.751
  3. ogz-meta/cognition-history/mercury/pattern-memory-scope-isolation-2026-05-26.md:1-57 (doc_section: root) sim=0.678
  4. ogz-meta/cognition-history/mercury/dashboard-pattern-card-shape-parser-2026-05-29.md:1-26 (doc_section: root) sim=0.686
  5. ogz-meta/cognition-history/mercury/backtest-report-scope-stamping-2026-05-26.md:1-23 (doc_section: Mercury Attack Prompt - Backtest Report Scope Stamping - 2026-05-26) sim=0.685
  6. ogz-meta/cognition-history/mercury/dashboard-chart-asset-routing-recheck-2026-05-29.md:1-29 (doc_section: root) sim=0.707
  7. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-whitelist-final-2026-05-23.md:1-76 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate Whitelist Final - 2026-05-23) sim=0.687
  8. ogz-meta/cognition-history/mercury/state-manager-open-position-scope-2026-05-26.md:1-19 (doc_section: Mercury Attack Prompt - StateManager openPosition Scope Contract - 2026-05-26) sim=0.676
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 425 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.88, 18 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (776ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=306.3)

═══ ANSWER ═══

**Short answer**
All of the dashboard‑frame types that are subject to the guard (`signal_analysis`, `bot_thinking`, `golden_setup_state`, `gate_event`, `pattern_analysis`) are now emitted only through paths that **always call** `_sendDashboardFrame` **after** a complete, verified scope has been built.
No current producer can reach the websocket with one of those frame types while omitting a truthful top‑level `symbol` or any of the required scope fields, and the guard does not block any legitimate frame because every real producer that sends those frames supplies the full scope.

**Evidence**

| Frame type | Where it is built & sent | Scope is built with `_dashboardScope` (or an equivalent explicit check) | Guard enforcement (`_missingDashboardScopeFields`) |
|------------|--------------------------|-----------------------------------------------------------------------|---------------------------------------------------|
| `signal_analysis` | `core/TradingLoop.js` lines 1359‑1365 | `const scope = this._dashboardScope(symbol);` (lines 1355‑1356) | `_sendDashboardFrame` checks missing fields (lines 145‑149) |
| `bot_thinking` | `core/TradingLoop.js` lines 1383‑1390 | Same `scope` as above (lines 1355‑1356) | Same guard (lines 145‑149) |
| `golden_setup_state` | `core/TradingLoop.js` lines 1429‑1436 | Same `scope` (lines 1355‑1356) | Same guard (lines 145‑149) |
| `gate_event` | `core/TradingLoop.js` lines 160‑176 | `const scope = this._dashboardScope(symbol);` (line 172) | Same guard (lines 145‑149) |
| `pattern_analysis` | `run-empire-v2.js` lines 2606‑2622 | Explicit `scope` built from `this.getCandleScopeEnvelope({ symbol: dashboardSymbol })` (lines 2613‑2615) and **checked** for missing fields (lines 2617‑2621) before calling `this.dashboardWs.send` | The same explicit check (lines 2617‑2621) rejects a broadcast when any required field is missing. |

*Scope builder* – `_dashboardScope` guarantees that `symbol`, `brokerId`, `accountId`, `assetClass`, `executionMode`, and `timeframe` are present (or throws) (lines 102‑115, 117‑127).

*Guard* – `_missingDashboardScopeFields` returns any missing required fields for the scoped frame types (lines 131‑138) and `_sendDashboardFrame` aborts the send if the list is non‑empty (lines 145‑149).

**Other code paths**

* `core/OrderExecutor.js` also defines a `_sendDashboardFrame` (lines 215‑219) **without** the guard, but it is used only for order‑acknowledgement frames (`broker_ack`, `broker_reject`, etc.) – none of the five scoped types are emitted from there.

* `run-empire-v2.js` sends `pattern_analysis` directly via `this.dashboardWs.send` (lines 2692‑2693) **after** performing the same scope‑completeness check (lines 2606‑2621).

* No other file calls `_sendDashboardFrame` with one of the guarded types without first constructing a full scope.

**Impact on trade execution / P0 behaviour**

* The guard only affects dashboard‑frame emission; it does **not** interfere with the core execution path (`_broadcastDecision`, `_broadcastGateEvent`, order placement, etc.).
* Because every guarded frame now requires a complete scope, there is no “stale‑scope leak” – a frame cannot be sent with an outdated or missing scope.
* No legitimate producer is blocked: every place that emits a scoped frame already supplies a complete scope (the `scope` object built by `_dashboardScope` or the explicit check in `run-empire-v2.js`).

**Conclusion**

- **No remaining real input sequence** can cause a `signal_analysis`, `bot_thinking`, `golden_setup_state`, `gate_event`, or `pattern_analysis` frame to reach the dashboard websocket without a truthful `symbol` and a full runtime scope.
- The revised guard does **not** block any legitimate frame, because all real producers now provide the required fields before the guard is reached.
- Trade‑execution logic and P0 behaviour remain unchanged, and there is no stale‑scope leakage or fallback that would compromise correctness.

[iterations: 28 | termination: answer_given | latency: 26296ms]
