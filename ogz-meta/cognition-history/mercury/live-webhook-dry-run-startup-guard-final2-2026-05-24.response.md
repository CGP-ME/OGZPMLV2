[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. core/WebhookOrderAdapter.js:10-46 (method: constructor) sim=0.648
  2. ogz-meta/ledger/fixes.jsonl:74-74 (jsonl_record: INCIDENT-2026-04-22-CONFIG-LOADER-CRASH) sim=0.619
  3. ogz-meta/ledger/fixes.jsonl:79-79 (jsonl_record: FIX-2026-04-30-MATRIX-SWEEP-TRADING-PAIR) sim=0.598
  4. ogz-meta/sessions/session-2026-05-07-08-cca-b-and-c-streams-shipped.md:39-50 (doc_section: 3. c/ WEBHOOK-ORDER-ADAPTER — 1 Commit, Shipped from CC-C's Pre-Drafted Diff) sim=0.652
  5. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL.md:513-555 (doc_section: Adversarial Mercury prompt) sim=0.641
  6. ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md:539-581 (doc_section: Adversarial Mercury prompt) sim=0.641
  7. ogz-meta/ledger/ph/CC-SPEC-PHASE-H-MARKET-EVENT-GUARD_1.md:259-310 (doc_section: Adversarial Mercury prompt) sim=0.627
  8. ogz-meta/sessions/session-2026-05-05-stream-a-candle-history-symbol-aware.md:52-67 (doc_section: 5. Mercury Adversarial Attacks (post-P0, both changes)) sim=0.625
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 313 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.99, 19 iters, used 1x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (848ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace not captured: skipped_worse_quality

═══ ANSWER ═══

**Short answer**

The patch blocks the *startup* case (`LIVE_TRADING=true && WEBHOOK_ORDERS_ENABLED=true && WEBHOOK_DRY_RUN=true`) – the guard in **`foundation/ConfigLoader.js`** (lines 346‑348) pushes an error and the process aborts.  
However, the guard runs only once, at the moment `ConfigLoader.load()` is called. If the configuration object is later mutated or a *live‑mode* flag is flipped **after** the `WebhookOrderAdapter` has already been instantiated, the adapter will keep the `liveTrading` flag it received at construction time (`false`) and will never hit the constructor‑time check (lines 20‑22). In that situation the system can end up with:

* `LIVE_TRADING=true` (runtime flag)  
* `WEBHOOK_ORDERS_ENABLED=true` (still true)  
* `WEBHOOK_DRY_RUN=true` (still true)  

while the SignalStack route is silently disabled because the adapter never throws (it thinks it is not live) and the `OrderExecutor` skips emitting when `ctx.webhookAdapter.enabled` is `false`.  

The same code path also leaves a *new* failure mode: if the adapter is constructed with `liveTrading=true && dryRun=true` it now **throws** (line 21) which can crash the process if the caller does not catch it.

Below is a concrete, reproducible sequence that demonstrates the remaining vulnerability, together with the exact file‑line evidence.

---

### 1.  Guard that blocks the original bug (startup)

```text
foundation/ConfigLoader.js:346‑348
 346   if (config.mode.liveTrading && config.webhookOrders.enabled && config.webhookOrders.dryRun) {
 347     errors.push('LIVE_TRADING=true cannot run with WEBHOOK_ORDERS_ENABLED=true and WEBHOOK_DRY_RUN=true');
 348   }
```

When `ConfigLoader.load()` sees the three flags together it pushes an error; later the loader throws (lines 539‑544) and the process aborts. This eliminates the *initial* silent‑disable scenario.

---

### 2.  Adapter‑level guard (constructor)

```text
core/WebhookOrderAdapter.js:20‑22
 20   if (this.liveTrading && this.enabled && this.dryRun) {
 21     throw new Error('LIVE_TRADING=true cannot initialize WebhookOrderAdapter with WEBHOOK_DRY_RUN=true');
 22   }
```

If the adapter is created **after** `liveTrading` is already true, the constructor throws immediately, preventing the route from being silently disabled.

---

### 3.  Where the guard **does not** run again (runtime‑reload / late‑mode switch)

The guard lives only inside `ConfigLoader.load()`. The rest of the platform never re‑executes it when the live‑mode flag changes later. The adapter receives the `liveTrading` flag **once** at construction time:

```text
run-empire-v2.js:1135‑1136
 1135      liveTrading: enableLiveTrading,
 1136      timeout: resolvedConfig.config.webhookOrders.timeoutMs,
```

`enableLiveTrading` is derived from `resolvedConfig.config.mode.liveTrading` *at startup*.

---

### 4.  Concrete failing sequence

| Step | Action | Effect |
|------|--------|--------|
| **A** | Set environment variables **before** the first `ConfigLoader.load()`:<br>`LIVE_TRADING=false`<br>`WEBHOOK_ORDERS_ENABLED=true`<br>`WEBHOOK_DRY_RUN=true`<br>`SIGNALSTACK_WEBHOOK_URL=https://app.signalstack.com/hook/xyz` | `ConfigLoader` loads a **valid** config (no live‑trading guard fires). |
| **B** | Application starts, `run-empire-v2.js` creates the adapter with `liveTrading:false` (line 1135). The adapter’s constructor sees `liveTrading:false` and therefore does **not** throw (line 21). The adapter is enabled (`this.enabled===true`) but in dry‑run mode (`this.dryRun===true`). |
| **C** | Later, the operator flips the live‑trading flag (e.g. by setting `CONFIRM_LIVE_TRADING=true` and calling `ctx.setLiveTrading(true)` – a runtime call that does **not** re‑run `ConfigLoader.load()`). The global context now reports `LIVE_TRADING=true`, but the already‑instantiated `WebhookOrderAdapter` still has `this.liveTrading===false`. |
| **D** | `OrderExecutor` emits a signal (see `core/OrderExecutor.js:238` where it calls `this.ctx.webhookAdapter.emit(signal)`). Because `this.ctx.webhookAdapter.enabled` is `true` but `this.ctx.webhookAdapter.liveTrading` is still `false`, the adapter treats the call as a dry‑run and returns `{sent:false,reason:'dry_run'}` (lines 101‑104). The broker‑side code that expects a live order never runs – the live SignalStack route is silently disabled. |
| **E** | The same configuration still has `WEBHOOK_ORDERS_ENABLED=true` and `WEBHOOK_DRY_RUN=true`, so the system is in the *illegal* posture while appearing to run normally. |

**File‑line evidence for the emitting path**

```text
core/OrderExecutor.js:238
 238   emitPromise = this.ctx.webhookAdapter.emit(signal);
```

`WebhookOrderAdapter.emit()` returns `{sent:false,reason:'dry_run'}` when `this.dryRun` is true (lines 101‑104), so the order never reaches the broker.

---

### 5.  Does the patch close the *underlying mechanism*?

*The patch removes the *startup* bypass (the “direct‑constructor‑bypass” identified in the first Mercury pass).*
* It **does not** close the *runtime* bypass where the live‑trading flag can be toggled after the adapter has been built.*  
* Consequently, the underlying mechanism (the ability to have live‑trading with webhook orders in dry‑run mode) is still possible via a configuration reload or a late mode switch.

---

### 6.  New failure modes introduced by the patch

| New mode | Why it appears | Evidence |
|----------|----------------|----------|
| **Constructor‑time exception** – `WebhookOrderAdapter` now throws when `liveTrading && dryRun` (lines 20‑22). If the caller does not catch this, the whole process crashes. | The adapter is instantiated in `run‑empire‑v2.js` without a surrounding `try/catch`. | `run-empire-v2.js:1131‑1138` (adapter construction) |
| **Silent disabling when URL is missing in *non‑live* mode** – the adapter logs an error and disables itself (lines 24‑30) but does not abort. Downstream code that checks only `config.webhookOrders.enabled` may think the route is still active, leading to missed orders. | `WebhookOrderAdapter` clears `this.enabled` but does not propagate the failure. | `core/WebhookOrderAdapter.js:24‑30` |
| **Payload‑field change** – the adapter now always adds `limit_price` (line 99) and the comment notes a “SIGNALSTACK‑PAYLOAD‑FIX”. If any downstream consumer expected the old field names (`ticker`, `qty`, `order_type`), those messages will be rejected. | The payload shape is altered. | `core/WebhookOrderAdapter.js:94‑99` |

---

### 7.  Summary

* The patch **blocks the original startup‑time exploit** by validating the combination of `LIVE_TRADING`, `WEBHOOK_ORDERS_ENABLED`, and `WEBHOOK_DRY_RUN` inside `ConfigLoader` (lines 346‑348) and by adding a constructor‑time guard in `WebhookOrderAdapter` (lines 20‑22).  
* **A residual attack surface remains**: if the live‑trading flag is toggled **after** the adapter has been instantiated (e.g. via a runtime command or a config‑reload that does not re‑run `ConfigLoader.load()`), the system can still end up with `LIVE_TRADING=true` while the webhook route stays in dry‑run mode and silently drops live orders.  
* The patch therefore **only patches the symptom** for the startup path; it does **not** close the broader mechanism that allows late‑stage mode changes.  
* New failure modes have been introduced (constructor‑time exception, silent disable on missing URL, payload‑field change) and should be covered by additional tests or defensive code (e.g., re‑validating the guard on every mode change, propagating constructor errors, and documenting the new payload schema).

[iterations: 22 | termination: answer_given | latency: 40880ms]
