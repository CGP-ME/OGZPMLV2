[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL.md:513-555 (doc_section: Adversarial Mercury prompt) sim=0.684
  2. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md:539-581 (doc_section: Adversarial Mercury prompt) sim=0.684
  3. ogz-meta/ledger/fixes.jsonl:86-86 (jsonl_record: FIX-2026-04-30-COMMIT-5-FAULTED-STATE) sim=0.599
  4. ogz-meta/codex-design/02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md:310-317 (doc_section: Fix B - Transition Epoch Fencing) sim=0.621
  5. ogz-meta/specs/apex-shipping-boundary.md:80-91 (doc_section: SessionRouter — 24/7 crypto + stocks auto-switch (LIVE)) sim=0.654
  6. ogz-meta/codex-design/02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md:13-36 (doc_section: Executive Decision) sim=0.605
  7. ogz-meta/sessions/session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md:37-52 (doc_section: 3. Bot Swap Resilience Audit (3 findings, all closed)) sim=0.601
  8. run-empire-v2.js:387-1075 (method: constructor#part12) sim=0.524
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 412 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.75, 18 iters, used 2x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (5274ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=392.1)

═══ ANSWER ═══

**Answer**

No concrete code path in the current `core/SessionRouter.js` implementation can deliver an OHLC event to the bot’s `onOhlcCallback` without first passing the fence.

* The only place where `onOhlcCallback` is invoked is inside the fenced wrapper created by `_buildOhlcFence` (line 446)【open_file:core/SessionRouter.js:426-447】.
* The fence checks every required condition before calling the callback:
  * `failedSafeMode` (line 408) – rejects if the router is in failed‑safe.
  * `transitionInProgress` (line 411) – rejects while a transition is active.
  * Session mismatch (line 414) – rejects if `this.activeSession !== expected.sessionName`.
  * Broker mismatch (line 417) – rejects if `this.activeBroker !== expected.adapter`.
  * Epoch mismatch (line 420) – rejects if `this.activeCallbackEpoch !== expected.epoch`.
  * If any of those checks fail the event is recorded and dropped (`_recordOhlcFenceRejection` at line 379‑398) and **no call to `onOhlcCallback` occurs**.

* The fenced callback is attached to the broker **after** the broker has been subscribed and the router has recorded the transition (e.g. stocks activation → `this._attachActiveOhlcCallback('stocks', this.alpacaAdapter, transitionContext);` at line 989 and crypto activation → `this._attachActiveOhlcCallback('crypto', this.krakenAdapter, transitionContext);` at line 957)【open_file:core/SessionRouter.js:950-990】.

* Before a new broker’s listener is attached, any old listeners are removed (e.g. `this.krakenAdapter.removeAllListeners('ohlc');` at line 738 and `this.alpacaAdapter.removeAllListeners('ohlc');` at line 884)【open_file:core/SessionRouter.js:730-740】, ensuring that no stale listener can fire.

* The only other place that could call `onOhlcCallback` directly would be a manual invocation in user code. The router itself never does this; a search for `onOhlcCallback(` across the repo returns a single occurrence inside the fence (line 446)【grep:core/SessionRouter.js:446】.

**Assumptions that remain**

1. **All OHLC data reaches the router via the broker’s `emit('ohlc', …)` interface** – the adapters (`AlpacaAdapter`, `KrakenAdapterV2`) emit `'ohlc'` events (see `AlpacaAdapter` line 692)【open_file:brokers/AlpacaAdapter.js:686-693】 and `KrakenAdapterV2` forwards market‑data to `'marketData'` which is filtered into `'ohlc'` by the router).
2. **No external code bypasses the router** – e.g. `run‑empire‑v2.js` only subscribes to `'ohlc'` when `sessionRouter.enabled` is false (lines 1703‑1705)【open_file:run-empire-v2.js:1700-1706】. If the router is enabled, the early‑return prevents any direct listener from being added.
3. **The `transitionInProgress` flag is correctly set before any new OHLC data can be emitted** – the flag is set to `true` at the start of a transition (line 703) and cleared in the `finally` block (line 770)【open_file:core/SessionRouter.js:702-770】, guaranteeing the fence will reject any OHLC that arrives during the transition window.

Given these safeguards and the lack of any alternative invocation path, the current code does **not** allow stale, wrong‑session, wrong‑broker, wrong‑epoch, or failed‑safe OHLC data to reach `onOhlcCallback`.

[iterations: 33 | termination: answer_given | latency: 62073ms]
