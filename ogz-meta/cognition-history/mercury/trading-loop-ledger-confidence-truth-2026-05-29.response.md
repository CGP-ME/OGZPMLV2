[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/ledger/PRE-MATRIX-CC-QUEUE.md:68-82 (doc_section: Commit Message) sim=0.724
  2. ogz-meta/specs/decision-ledger-integration-plan.md:52-68 (doc_section: Phase L2 — Strategy signals + orchestrator decision) sim=0.685
  3. ogz-meta/ledger/PRE-MATRIX-CC-QUEUE.md:29-35 (doc_section: Impact) sim=0.715
  4. ogz-meta/specs/sourcegraph-deep-search-2026-05-20_2.md:948-3143 (doc_section: Why this matters (context for prioritization)#part103) sim=0.668
  5. ogz-meta/specs/pre-eval-master-fix-plan-2026-05-20_1.md:414-441 (doc_section: Fix 9 — KILL 6 adjustedConfidence /100) sim=0.684
  6. ogz-meta/sessions/CODEX-WORKLOG-2026-05-20-PRE-EVAL.md:190-229 (doc_section: Current Active Work: Confidence Boundary Repair) sim=0.701
  7. core/TradingLoop.js:1332-1409 (method: _broadcastDecision) sim=0.588
  8. ogz-meta/sessions/session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md:15-24 (doc_section: 1. Strategy Parity — minConfidence Wired On All Contracts (2 commits)) sim=0.714
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 456 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.75, 14 iters, used 1x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (391ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=57.2)

═══ ANSWER ═══

**1. 0‑to‑100 confidence can still be written to the ledger**
If an `orchResult.allResults[i].confidence` is supplied on the old 0‑100 scale (e.g. `80`), the new code will still try to write it into `strategySignals[].baseConfidence` and `competingStrategies[].adjustedConfidence`.
When the ledger helper `_ledgerConfidence01()` is called it checks that the value is a finite number between 0 and 1 and throws otherwise (lines 81‑86). Because the value `80` fails that test, the ledger write will be aborted and an error is raised.

> **Evidence** – `_ledgerConfidence01()` definition validates the range 0‑1 (lines 81‑86) and is used for both `baseConfidence` (line 105) and `adjustedConfidence` (line 121).

**2. Missing name, reason or direction is no longer silently defaulted**
The previous implementation supplied defaults (“unknown”, “signal fired”, etc.). The patch replaces that with strict helpers:

* `_ledgerText()` (lines 74‑78) throws an error if the supplied value is not a non‑empty string.
* `_ledgerDirection()` (lines 89‑94) first normalises the text via `_ledgerText()` and then only accepts “buy/long”, “sell/short” or “hold”; any other value throws.

Thus an `orchResult` that omits `strategyName`, `reason` or `direction`, or supplies an unsupported direction, will cause the ledger‑building step to throw rather than fall back to a default.

> **Evidence** – `_ledgerText()` (lines 74‑78) and `_ledgerDirection()` (lines 89‑94) enforce explicit, non‑blank values.

**3. Winner `finalConfidence` and competing `adjustedConfidence` can be on different scales**
`finalConfidence` is taken directly from the local variable `confidence`, which is derived from `orchResult.confidence` (the orchestrator’s public 0‑100 percent value) – see line 1062.
`adjustedConfidence` for each competing strategy is produced by `_ledgerConfidence01(result?.confidence, …)` (line 121), which expects a 0‑1 value.

If the orchestrator returns a 0‑100 confidence for the winner but 0‑1 confidences for the individual strategy results, the ledger will contain a winner confidence on a 0‑100 scale and competing confidences on a 0‑1 scale, i.e. mismatched units.

> **Evidence** – `finalConfidence: confidence` (line 1062) vs. `adjustedConfidence: this._ledgerConfidence01(result?.confidence, …)` (line 121).

**4. A perfectly valid `StrategyOrchestrator` output can be rejected**
The contract permits a strategy result to omit the `confidence` field (it may be `undefined`). The new ledger code treats a missing value as `Number(undefined) → NaN`, which fails the finite‑number check in `_ledgerConfidence01()` and throws (lines 81‑86). Consequently an orchestrator payload that legitimately leaves `confidence` undefined will be rejected, stopping the ledger entry even though the producer contract is still satisfied.

> **Evidence** – `_ledgerConfidence01()` throws for non‑finite values (lines 81‑86); it is invoked for every `result.confidence` (lines 105, 121).

**5. Architectural impact – does this close the scale‑corruption bug or just mask it?**

*The patch **closes** the original scale‑corruption mechanism.* By validating every confidence value against the 0‑1 range before writing to the ledger, it guarantees that no 0‑100 value can be silently stored (see the validation in `_ledgerConfidence01()`).

*However, it introduces new failure modes:*

| New failure mode | Why it occurs | Code reference |
|------------------|---------------|----------------|
| **Rejection of missing or out‑of‑range confidences** – a legitimate orchestrator may omit `confidence` or accidentally supply a value > 1, causing the ledger step to throw. | `_ledgerConfidence01()` throws for non‑finite, negative, or > 1 values (lines 81‑86). |
| **Rejection of blank or missing text fields** – previously defaulted to “unknown”/“signal fired”, now an empty `strategyName`, `reason`, or `direction` triggers an error. | `_ledgerText()` throws for non‑string or blank values (lines 74‑78). |
| **Rejection of unsupported directions** – only “buy/long”, “sell/short”, “hold” are accepted; any other string (e.g., “sideways”) now aborts the ledger write. | `_ledgerDirection()` throws for unsupported values (lines 89‑94). |

Thus the patch **eliminates the silent scale‑corruption bug** but **adds strict validation** that can cause legitimate but incomplete data to be dropped, potentially breaking downstream processing unless the orchestrator guarantees full compliance with the new schema.

[iterations: 5 | termination: answer_given | latency: 7217ms]
