[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/dashboard-three-file-drop-2026-05-26.md:1-29 (doc_section: root) sim=0.728
  2. ogz-meta/cognition-history/mercury/dashboard-three-file-drop-recheck-2026-05-26.md:1-30 (doc_section: root) sim=0.728
  3. ogz-meta/cognition-history/mercury/dashboard-final-live-report-expanded-2026-05-26.md:1-35 (doc_section: root) sim=0.699
  4. ogz-meta/cognition-history/mercury/dashboard-chart-asset-routing-recheck-2026-05-29.md:1-29 (doc_section: root) sim=0.660
  5. ogz-meta/cognition-history/mercury/dashboard-html-template-reload-2026-05-27.md:1-18 (doc_section: root) sim=0.671
  6. ogz-meta/cognition-history/mercury/dashboard-chart-asset-routing-2026-05-29.md:1-25 (doc_section: root) sim=0.655
  7. CHANGELOG.md:10-15 (doc_section: Frontend Empire Orchestrator Dormant Asset (2026-05-29)) sim=0.634
  8. ogz-meta/cognition-history/mercury/live-bypass-guard-2026-05-23.md:1-28 (doc_section: Mercury attack: live bypass guard) sim=0.661
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 418 remaining
[MERCURY-BRIDGE] No similar prior trace found
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (355ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=149.4)

═══ ANSWER ═══

**1. Double‑registering socket handlers / leaking retry timers after a `init()` → `teardown()` → `init()` cycle**
- `installSocketHandlers()` only registers handlers once, guarded by `state.socketHandlersInstalled` (lines 406‑424).
- `teardown()` never resets `state.socketHandlersInstalled` (lines 517‑525). Consequently, after a teardown the next `init()` will call `bindToSocket()`, which sees `state.socketHandlersInstalled===true` and skips re‑installing the handlers, leaving the socket without any handlers (a leak of the retry logic).

**2. Potential misinformation about module health, required assets or mount presence**
- `refreshModuleStatus()` builds a per‑module status object that can report *asset‑missing*, *export‑missing* or *mount‑missing* (lines 316‑340).
- `missingRequiredAssets()` (lines 482‑488) reports any required asset whose `loaded` flag is false.
- `health()` (lines 490‑500) returns the current `modules`, `assets`, `missingRequiredAssets` and `scope` snapshots, so any bug in the above functions will be reflected in the health report.

**3. Missing‑symbol frames slipping past the required‑symbol gate**
- `routeFrame()` first extracts a symbol (`extractSymbol()`, lines 384‑386) and, for frames whose type is listed in `SYMBOL_REQUIRED_FRAMES`, aborts dispatch when the symbol is absent (lines 386‑395). The function returns `false` and emits `empire:frame-rejected`. No subscriber receives such a frame.

**4. Hard‑coded broker/symbol inference or default‑to‑selected‑asset behavior**
- Symbol extraction is confined to the fields `symbol`, `asset`, `data.symbol`, `data.asset`, `tick.symbol`, `tick.asset` (lines 196‑205). No hard‑coded broker or fallback to a “selected” asset is present.
- Scope updates (`syncScopeFromFrame()`, lines 238‑245) only set a field when a non‑null value is present; they never clear a field when a frame lacks that data, which can cause stale scope values.

**5. Swallowed errors that hide broken module/frame routes**
- `recordError()` logs the error and stores it in `state.errors` but never re‑throws (lines 154‑170).
- All major callbacks (e.g., socket handler registration, frame dispatch, bus emission) wrap their logic in `try…catch` and call `recordError()` on failure (e.g., lines 415‑418, 375‑380, 441‑445). This prevents the error from bubbling up, effectively hiding broken routes from callers.

**6. `bootAll()` / `init()` can initialise panel modules and cause double‑initialisation**
- `bootAll()` simply returns `health()` (lines 531‑533) and does **not** call `init()`.
- The only place that can cause a double‑initialisation of panels is the legacy `core.js` boot sequence (see `core.js` lines 36‑54) which auto‑initialises every registered module except `Chart`, `Socket`, and `Theme`. Because `Empire.init()` does not touch panel modules, a separate manual init (as done in `unified-dashboard-v2.html` lines 816‑838) can initialise the same panels a second time, leading to duplicated event subscriptions (see the comment in the HTML at lines 845‑848).

**7. New failure mode introduced while the file remains dormant**
- Even when not loaded, the script registers itself with `OGZ.register(EMPIRE_MODULE, Empire)` (lines 603‑605). If it is later loaded, calling `Empire.init()` will set `state.initialized = true` and start the health interval (`ensureHealthInterval()`, lines 441‑446).
- Because `teardown()` never clears `state.socketHandlersInstalled`, a later reload (or a second `init()` after a teardown) will leave the socket without handlers, causing missed market‑data frames. This is a silent failure mode that only appears after a restart of the Empire component.

All cited line numbers refer to the current repository version.

[iterations: 13 | termination: answer_given | latency: 19426ms]
