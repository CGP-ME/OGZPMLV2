[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/candle-ingress-scope-stamping-recheck-2026-05-26.md:1-28 (doc_section: root) sim=0.698
  2. ogz-meta/cognition-history/mercury/dashboard-three-file-drop-recheck-2026-05-26.md:1-30 (doc_section: root) sim=0.710
  3. ogz-meta/cognition-history/mercury/state-manager-open-position-scope-2026-05-26.md:1-19 (doc_section: Mercury Attack Prompt - StateManager openPosition Scope Contract - 2026-05-26) sim=0.693
  4. ogz-meta/cognition-history/mercury/dashboard-three-file-drop-2026-05-26.md:1-29 (doc_section: root) sim=0.667
  5. ogz-meta/cognition-history/mercury/liveness-pause-recovery-2026-05-27.md:1-70 (doc_section: root) sim=0.672
  6. ogz-meta/cognition-history/mercury/live-bypass-guard-2026-05-23.md:1-28 (doc_section: Mercury attack: live bypass guard) sim=0.667
  7. ogz-meta/cognition-history/mercury/ttp-volume-cap-gate-2026-05-23.md:1-25 (doc_section: Mercury attack prompt - TTP 5% previous-1m volume cap gate) sim=0.650
  8. ogz-meta/cognition-history/mercury/liveness-pause-recovery-recheck-2026-05-27.md:1-43 (doc_section: root) sim=0.682
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 419 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.87, 13 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (510ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=195.6)

═══ ANSWER ═══

**1. Symbol‑switch sequence that can leave stale broker / account / timeframe / execution‑mode**

* `syncScopeFromFrame` only clears the other scope fields when they are **missing** in the incoming frame.
  If a new symbol arrives together with old broker/account/etc. values, those values are kept, so the scope can retain stale data.

  ```js
  245‑251  if (next.symbol && previousSymbol && next.symbol !== previousSymbol) {
  246‑250      ['timeframe', 'broker', 'account', 'executionMode'].forEach((field) => {
  247‑248          if (!next[field] && state.scope[field] !== null) {
  248‑249              changed = setScopeField(field, null,
  248‑249                  reason + ':symbol-change-cleared-' + field) || changed;
  250‑251          }
  251‑252      });
  ```

**2. `init()` / `teardown()` / `init()` sequence that can duplicate or drop handlers**

* `init()` installs socket handlers **once** (via `bindToSocket`) and starts the health interval, but it never resets the `state.socketHandlersInstalled` flag on teardown. After a teardown, a second `init()` will **skip** re‑installing the handlers because the flag is still `true`, leaving routing dead.

  ```js
  515‑523  init: function () {
  516‑517      if (state.initialized) return health();
  518‑519      state.initialized = true;
  520‑521      bindToSocket();
  522‑523      ensureHealthInterval();
  ```

  ```js
  525‑534  teardown: function () {
  526‑527      state.initialized = false;
  528‑530      if (state.socketRetryId) { … }
  531‑533      if (state.healthIntervalId) { … }
  534‑535      state.frameSubscribers.clear();
  ```

* `installSocketHandlers` checks the flag and returns early, never clearing it on teardown:

  ```js
  415‑432  function installSocketHandlers() {
  416‑417      if (state.socketHandlersInstalled) return true;
  418‑420      const socket = moduleExport('Socket');
  421‑417      if (!socket || typeof socket.registerHandler !== 'function') return false;
  …
  430‑432      state.socketHandlersInstalled = true;
  ```

* Consequently, a second `init()` after `teardown()` will call `bindToSocket()`, which sees `state.socketHandlersInstalled` still `true` and skips re‑registration, leaving the socket un‑handled.

**3. Missing‑symbol frame for a type in `SYMBOL_REQUIRED_FRAMES` that still reaches a subscriber**

* The set of frames that **must** contain a symbol is defined at lines 95‑102.
  ```js
  95‑102  const SYMBOL_REQUIRED_FRAMES = new Set([
  96‑101      'price','delta','historical_candles','pattern_analysis','signal_analysis','ticker_price'
  102  ]);
  ```

* `routeFrame` checks this set; if a required frame arrives without a symbol it records a rejection and returns `false`. However, the code **still dispatches** the frame after the check? No – it returns early, so the only way a missing‑symbol frame can reach a subscriber is if the caller bypasses `routeFrame` (e.g., by calling `dispatchFrame` directly) or if the `SYMBOL_REQUIRED_FRAMES` set is altered at runtime. The current implementation does **not** prevent a missing‑symbol frame from being delivered if the caller uses `dispatchFrame` directly, which is a potential bypass.

  ```js
  392‑404  function routeFrame(eventType, frame) {
  393‑394      const symbol = extractSymbol(frame);
  394‑403      if (SYMBOL_REQUIRED_FRAMES.has(eventType) && !symbol) {
  395‑402          // record rejection, increment counter, emit event
  403‑404          return false;
      404  }
  ```

**4. Hard‑coded broker / symbol inference or selected‑asset fallback**

* `extractSymbol` looks for `symbol` or `asset` in several nested locations, providing a fallback to `asset` when `symbol` is absent. This is the hard‑coded inference logic.

  ```js
  196‑205  function extractSymbol(payload) {
      if (!payload) return null;
      if (payload.symbol || payload.asset) return normalizeSymbol(payload.symbol || payload.asset);
      if (payload.data && (payload.data.symbol || payload.data.asset)) {
          return normalizeSymbol(payload.data.symbol || payload.data.asset);
      }
      if (payload.tick && (payload.tick.symbol || payload.tick.asset)) {
          return normalizeSymbol(payload.tick.symbol || payload.tick.asset);
      }
      return null;
  }
  ```

**5. Error path that fails without being visible in `Empire.health().errors`**

* `installSocketHandlers` returns `false` when the `Socket` module is missing or does not expose `registerHandler`, but it does **not** call `recordError`. Therefore the failure is silent to the health report.

  ```js
  416‑418  const socket = moduleExport('Socket');
  417‑418  if (!socket || typeof socket.registerHandler !== 'function') return false;
  ```

* The silent failure propagates to `bindToSocket` and `scheduleSocketBindRetry`, which also do not record an error when the retry schedule is started.

  ```js
  444‑445  function bindToSocket() {
      if (installSocketHandlers()) return true;
      scheduleSocketBindRetry();
      return false;
  }
  ```

**6. Paths where `bootAll()` or `init()` initialize panel modules**

* `bootAll()` simply returns the health object; it does **not** touch panel modules.

  ```js
  539‑540  bootAll: function () {
      return health();
  },
  ```

* `init()` performs only socket binding, health‑interval setup, and emits a ready event. No panel‑module initialization occurs here.

  ```js
  515‑523  init: function () {
      if (state.initialized) return health();
      state.initialized = true;
      refreshInventory();
      bindToSocket();
      ensureHealthInterval();
      emitBus('empire:ready', health());
      return health();
  },
  ```

* The comment at the top of the file also states that Empire deliberately does **not** call panel `init()` functions, confirming that panel modules are never initialized by these entry points.

  ```js
   11  * - Empire does not call panel init() and cannot double‑initialize modules.
  ```

---

**Summary of findings**

| Vector | Evidence (file:line) |
|--------|----------------------|
| 1. Stale scope after symbol switch | 245‑251 |
| 2. Teardown leaves `socketHandlersInstalled` true → dead routing on re‑init | 515‑523, 525‑534, 415‑432 |
| 3. Missing‑symbol frame handling (potential bypass) | 95‑102 (definition), 392‑404 (route logic) |
| 4. Hard‑coded broker/symbol inference | 196‑205 |
| 5. Silent socket‑handler install failure | 416‑418, 444‑445 |
| 6. No panel‑module init in `bootAll`/`init` | 539‑540, 515‑523, comment line 11 |

These code‑backed observations show the attack surface you asked for.

[iterations: 18 | termination: answer_given | latency: 15616ms]
