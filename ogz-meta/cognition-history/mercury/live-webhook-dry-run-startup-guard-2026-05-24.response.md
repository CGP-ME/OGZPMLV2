[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. core/WebhookOrderAdapter.js:10-46 (method: constructor) sim=0.647
  2. ogz-meta/ledger/fixes.jsonl:74-74 (jsonl_record: INCIDENT-2026-04-22-CONFIG-LOADER-CRASH) sim=0.600
  3. ogz-meta/ledger/fixes.jsonl:79-79 (jsonl_record: FIX-2026-04-30-MATRIX-SWEEP-TRADING-PAIR) sim=0.577
  4. ogz-meta/sessions/session-2026-05-07-08-cca-b-and-c-streams-shipped.md:39-50 (doc_section: 3. c/ WEBHOOK-ORDER-ADAPTER — 1 Commit, Shipped from CC-C's Pre-Drafted Diff) sim=0.644
  5. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL.md:513-555 (doc_section: Adversarial Mercury prompt) sim=0.624
  6. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md:539-581 (doc_section: Adversarial Mercury prompt) sim=0.624
  7. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-2026-05-18T11-07-39-506Z.md:16-45 (doc_section: Prompt) sim=0.621
  8. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-retry1-2026-05-18T11-09-54-024Z.md:16-45 (doc_section: Prompt) sim=0.621
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 312 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.79, 10 iters, used 1x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (315ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=221.9)

═══ ANSWER ═══

**Answer**

The patch only blocks the *startup* case where `LIVE_TRADING=true` and the webhook‑order route is enabled **and** `WEBHOOK_DRY_RUN=true`.  
It does **not** prevent the same illegal combination from being created later (e.g. when a config object is built manually or re‑loaded at runtime). In that situation the `WebhookOrderAdapter` is still instantiated with `dryRun:true` and `enabled:true`, so every signal is merely logged (`DRY RUN …`) and the real SignalStack route is silently disabled.

### Concrete failing sequence

| Step | Environment / code | Result |
|------|-------------------|--------|
| 1 | `process.env.LIVE_TRADING='true'`  <br>`process.env.WEBHOOK_ORDERS_ENABLED='true'` <br>`process.env.WEBHOOK_DRY_RUN='true'` <br>`process.env.SIGNALSTACK_WEBHOOK_URL='https://app.signalstack.com/hook/xyz'` | `ConfigLoader` would normally abort, **but** the application bypasses it by constructing the config object directly (e.g. in a test or a custom entry‑point). |
| 2 | `const cfg = { mode:{liveTrading:true}, webhookOrders:{enabled:true,dryRun:true,webhookUrl:'https://app.signalstack.com/hook/xyz',timeoutMs:5000,orderLogCap:500} };` | No guard runs because the `if (config.mode.liveTrading && config.webhookOrders.enabled && config.webhookOrders.dryRun)` check lives only inside `ConfigLoader` (see **foundation/ConfigLoader.js:346‑348**). |
| 3 | `new WebhookOrderAdapter(cfg.webhookOrders)` (called from **run‑empire‑v2.js:1129‑1137**) | The adapter receives `dryRun:true` and `enabled:true`. |
| 4 | `adapter.emit({symbol:'TSLA',quantity:10,action:'buy'})` | The adapter hits the dry‑run branch (**core/WebhookOrderAdapter.js:87‑90**) and only prints a log line `DRY RUN: {"symbol":"TSLA","quantity":10,"action":"buy"}` – no HTTP request is sent, so the live SignalStack route is silently disabled. |
| 5 | The trading loop continues as if orders were being placed, but the broker never receives them. | The operator sees no error, yet the live route is dead. |

**File‑line evidence**

* **Guard at startup** – `ConfigLoader` rejects the illegal combo:  

  ```js
  if (config.mode.liveTrading && config.webhookOrders.enabled && config.webhookOrders.dryRun) {
      errors.push('LIVE_TRADING=true cannot run with WEBHOOK_ORDERS_ENABLED=true and WEBHOOK_DRY_RUN=true');
  }
  // foundation/ConfigLoader.js:346‑348
  ```

* **Adapter construction** – receives the config object (no env read):  

  ```js
  constructor(config = {}) {
      this.webhookUrl = config.webhookUrl || '';
      this.enabled      = config.enabled === true;
      this.dryRun      = config.dryRun !== false;
      this.timeout     = config.timeout || 5000;
      this.orderLogCap = config.orderLogCap || 500;
      // core/WebhookOrderAdapter.js:10‑16
  ```

* **Dry‑run handling inside `emit`** – logs only, never sends:  

  ```js
  if (this.dryRun) {
      console.log(`[WebhookOrder] DRY RUN: ${JSON.stringify(payload)}`);
      this._log({ ...payload, dryRun: true, timestamp: now });
      return { sent: false, reason: 'dry_run', payload };
  }
  // core/WebhookOrderAdapter.js:87‑90
  ```

* **Injection point** – the resolved config is passed straight to the adapter:  

  ```js
  this.webhookAdapter = new WebhookOrderAdapter({
      webhookUrl: resolvedConfig.config.webhookOrders.webhookUrl,
      enabled:    resolvedConfig.config.webhookOrders.enabled,
      dryRun:     resolvedConfig.config.webhookOrders.dryRun,
      timeout:    resolvedConfig.config.webhookOrders.timeoutMs,
      orderLogCap:resolvedConfig.config.webhookOrders.orderLogCap,
  });
  // run-empire-v2.js:1129‑1137
  ```

### Does the patch close the underlying mechanism?

* **Only the symptom is patched.**  
  The guard stops the *initial* startup when the illegal combination is present in the environment, but it does **not** protect against the same combination being created later (e.g., by a programmatic config, a hot‑reload, or a test harness that bypasses `ConfigLoader`). Consequently the underlying issue—allowing live trading with a dry‑run webhook—remains possible.

### New failure modes introduced by the patch

| Failure mode | Why it can happen | Evidence |
|--------------|-------------------|----------|
| **Payload‑field change** – the adapter now emits `{symbol, quantity, action}` (lines 80‑84) instead of the historic `{ticker, qty, order_type}`. Down‑stream services that still expect the old field names will reject the request. | The payload format was changed in **core/WebhookOrderAdapter.js:80‑84**. |
| **Runtime config‑reload bypass** – if the application ever reloads config without re‑instantiating `ConfigLoader`, the guard will not re‑run, allowing `LIVE_TRADING=true` together with `WEBHOOK_DRY_RUN=true`. | Guard lives only in `ConfigLoader` (lines 346‑349) and runs once at start‑up. |
| **Silent disabling of the live route** – when `dryRun:true` the adapter logs and returns `{sent:false}`; callers that ignore the return value (fire‑and‑forget) will not see that orders are not being sent. | `emit` returns early on dry‑run (lines 87‑90) without raising an error. |
| **Potential mismatch when `WEBHOOK_ORDERS_ENABLED=false`** – the adapter is still instantiated (with `enabled:false`) but the rest of the system may still reference `config.webhookOrders.enabled` to decide whether to use the broker. If that check is missed, the broker path can be inadvertently disabled. | The adapter construction always occurs (run‑empire‑v2.js 1129‑1137) regardless of `enabled`. |

**Bottom line:** the patch eliminates the *startup‑time* error but does not fully eliminate the risk of a live‑trading run with a dry‑run webhook, nor does it guarantee that downstream consumers accept the new payload format. Additional runtime validation (e.g., re‑checking the guard on config reload) and backward‑compatible payload handling would be required to close the underlying mechanism.

[iterations: 19 | termination: answer_given | latency: 31880ms]
