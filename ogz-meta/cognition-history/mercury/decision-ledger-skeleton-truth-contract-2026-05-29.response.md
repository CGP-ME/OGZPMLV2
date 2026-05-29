[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/state-manager-open-position-scope-2026-05-26.md:1-19 (doc_section: Mercury Attack Prompt - StateManager openPosition Scope Contract - 2026-05-26) sim=0.731
  2. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-final-2026-05-23.md:1-63 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate Final - 2026-05-23) sim=0.688
  3. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-whitelist-final-2026-05-23.md:1-76 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate Whitelist Final - 2026-05-23) sim=0.681
  4. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-2026-05-23.md:1-59 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate - 2026-05-23) sim=0.686
  5. core/StateManager.js:404-556 (method: openPosition#part3) sim=0.559
  6. ogz-meta/cognition-history/mercury/startup-entry-state-log-final-2026-05-23.md:1-61 (doc_section: Mercury Attack Prompt - Startup Entry-State Log Final - 2026-05-23) sim=0.703
  7. ogz-meta/specs/decision-ledger-integration-plan.md:35-51 (doc_section: Phase L1 — Skeleton ledger creation at trade birth) sim=0.665
  8. ogz-meta/cognition-history/mercury/startup-entry-state-log-2026-05-23.md:1-40 (doc_section: Mercury Attack Prompt - Startup Entry-State Log - 2026-05-23) sim=0.673
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 455 remaining
[MERCURY-BRIDGE] No similar prior trace found
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (301ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=33.5)

═══ ANSWER ═══

**1. Can you still open a trade with “fabricated” defaults (unknown, 15m, backtest, zero‑size, N/A) by omitting ledger evidence?**
No. The patch removed the old fallback logic. `createLedgerSkeleton` now **throws** when any required field is missing (lines 138‑144) and `StateManager.openPosition` catches that error **before** any mutation of `activeTrades` (lines 518‑543 → return `_rejectOpenPositionLedger`). Consequently an active trade is never added when evidence is missing.

**2. Input that makes `createLedgerSkeleton` produce a ledger that fails schema validation**
Supply a value that does not satisfy the Zod schema, e.g.:

```js
{
  tradeId: 'T1',
  candleTimestamp: 1720000000,
  symbol: 'BTCUSD',
  timeframe: '1h',
  executionMode: 'simulated',   // not one of ['live','paper','backtest']
  entryPrice: 30000,
  direction: 'long',
  strategySignals: [],          // OK
  orchestratorDecision: { winnerStrategy: null, finalConfidence: 0, reason: 'unknown' },
  positionSizing: { basePercent: 0, confidenceMultiplier: 1, confluenceMultiplier: 1, finalPercent: 0, finalSizeUsd: 0, formula: 'N/A' },
  exitContract: { strategyName: 'unknown', stopLossPercent: 0, takeProfitPercent: 0 }
}
```

When this object reaches `createLedgerSkeleton`, the skeleton is built (lines 146‑161) and then **validated** (lines 170‑178). The Zod schema (line 64) rejects `executionMode: 'simulated'`, causing `validateLedgerSkeleton` to return `success:false` and `createLedgerSkeleton` to throw a `LEDGER_SKELETON_REJECTED` error (lines 172‑178).

**3. Can `StateManager` mutate `activeTrades`, position scalars, counters, or saved state before rejecting a malformed ledger?**
No. The mutation of the internal state (adding to `activeTrades`, updating position, counters, etc.) occurs **after** the `try` block that creates the ledger (lines 545‑572). If `createLedgerSkeleton` throws, the `catch` returns early (lines 540‑541) and the code that mutates the state is never reached. Thus a malformed ledger never causes any state changes.

**4. Are invalid values ever coerced instead of being rejected (e.g., `executionMode:"simulated"`, `candleTimestamp:NaN`, `positionSizing:null`)?**
No. The helper `ledgerFieldMissing` (lines 108‑110) treats `NaN`, `null`, `undefined`, or blank strings as missing and triggers a rejection. The schema validation (line 64 for `executionMode`, line 61 for `candleTimestamp`, line 72 for `positionSizing`) also rejects mismatched types. There is no coercion logic; such inputs cause a `LEDGER_SKELETON_REJECTED` error before any ledger is returned.

**5. New failure mode introduced by this patch in the normal OrderExecutor → StateManager open path**
The open‑position flow now propagates a **`LEDGER_SKELETON_REJECTED`** error when ledger evidence is incomplete or malformed. `StateManager._rejectOpenPositionLedger` (lines 636‑650) logs the failure and returns an error result, which the OrderExecutor must now handle. Previously the system would fabricate defaults and continue; now it can abort the trade opening entirely, requiring the caller to supply a complete, valid ledger.

**6. Architecture – does the patch close the underlying mechanism of fake ledger evidence, or only hide the symptom?**
The patch **closes the underlying mechanism** by making every required field explicit (`REQUIRED_LEDGER_FIELDS` lines 85‑97) and by validating the fully‑built skeleton against the Zod schema (lines 170‑178). No defaults are supplied, so “fake” evidence cannot be generated silently. However, it **introduces new failure modes**: any missing or malformed field now results in a hard rejection (`LEDGER_SKELETON_REJECTED`), which can surface upstream (e.g., in OrderExecutor) and must be explicitly handled. This shift from silent substitution to explicit validation is a structural change, not merely a cosmetic one.

[iterations: 3 | termination: answer_given | latency: 3495ms]
