[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=landmine mode=hybrid-classified boost=landmine top-k=8
[MERCURY-BRIDGE] Rationale: landmine/rules pattern detected; boost landmine and guardrails
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-whitelist-final-2026-05-23.md:1-76 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate Whitelist Final - 2026-05-23) sim=0.778
  2. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-final-2026-05-23.md:1-63 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate Final - 2026-05-23) sim=0.768
  3. ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-2026-05-23.md:1-59 (doc_section: Mercury Attack Prompt - OrderExecutor Pause Gate - 2026-05-23) sim=0.763
  4. ogz-meta/cognition-history/mercury/entry-plan-preorder-gate-2026-05-23.md:1-62 (doc_section: Mercury attack prompt: entry plan and pre-order gate) sim=0.763
  5. ogz-meta/cognition-history/mercury/entry-order-quantity-plan-followup-2026-05-23.md:1-70 (doc_section: Mercury follow-up attack prompt: broker order quantity plan) sim=0.761
  6. ogz-meta/cognition-history/mercury/live-bypass-guard-2026-05-23.md:1-28 (doc_section: Mercury attack: live bypass guard) sim=0.750
  7. ogz-meta/cognition-history/mercury/state-manager-open-position-scope-2026-05-26.md:1-19 (doc_section: Mercury Attack Prompt - StateManager openPosition Scope Contract - 2026-05-26) sim=0.698
  8. ogz-meta/cognition-history/mercury/ttp-volume-cap-gate-2026-05-23.md:1-25 (doc_section: Mercury attack prompt - TTP 5% previous-1m volume cap gate) sim=0.717
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 458 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.84, 5 iters, used 1x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (819ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=131.5)

═══ ANSWER ═══

**1. 0‑100 confidence cannot reach the ledger fields**
The orchestrator’s confidence is first validated to be a finite number in the range 0‑100 (lines 648‑652). It is then divided by 100 (line 654) and the resulting 0‑1 value is stored in `decision.ledgerData.orchestratorDecision.finalConfidence` (line 1076) and in every `adjustedConfidence` produced by `_ledgerCompetingStrategy` (line 135).

*Evidence*

* Validation of the raw orchestrator confidence – `if (!Number.isFinite(orchResult.confidence)) …` and `if (orchResult.confidence < 0 || orchResult.confidence > 100) …` (lines 648‑652).
* Scaling to a 0‑1 value – `const confidence = orchResult.confidence / 100;` (line 654).
* Use of the scaled value in the ledger – `finalConfidence: confidence,` (line 1076) and `adjustedConfidence: this._ledgerConfidence01(result?.confidence, …)` (line 135) where `_ledgerConfidence01` forces a 0‑1 range (lines 81‑86).

Because the raw 0‑100 value is either rejected (lines 648‑652) or divided before being written to the ledger (line 654), a 0‑100 confidence can never appear in `strategySignals[].baseConfidence`, `orchestratorDecision.finalConfidence` or `competingStrategies[].adjustedConfidence`.

---

**2. Missing required fields are not silently substituted**
Before any call to `executeTrade`, the code checks every mandatory ledger field and throws if any are absent or malformed:

* Blank/blank strings – `_ledgerText` throws on missing/blank values (lines 75‑77).
* Invalid direction – `_ledgerDirection` throws on unsupported directions (lines 89‑95).
* Missing `allResults` array – `_ledgerAllResults` throws if the array is absent or empty (lines 102‑107).
* Missing winner strategy – `_ledgerWinnerName` throws if `winnerStrategy` is missing or blank (lines 112‑113).

These checks are performed before the decision is handed to `executeTrade` (the `if (decision.action !== 'HOLD')` block starting at line 1029). Consequently an executable BUY/SELL_SHORT path with any of the listed missing fields will be rejected, not silently substituted.

---

**3. SELL/COVER exit decisions do **not** receive entry‑oriented ledger data or an `eval_pass` gate event**
The ledger attachment and the `eval_pass` emission are guarded by the `isEntryAction` flag, which is true **only** for `BUY` or `SELL_SHORT` (lines 1030‑1031). All ledger‑related code (including the construction of `decision.ledgerData` and the `emitTrace` of `eval_pass`) lives inside the `if (isEntryAction) { … }` block (lines 1032‑1119).

*Evidence*

* Determination of entry actions – `const isEntryAction = decision.action === 'BUY' || decision.action === 'SELL_SHORT';` (line 1030‑1031).
* Ledger construction and `eval_pass` emission are inside the `if (isEntryAction)` block (lines 1032‑1119).

Therefore a SELL/COVER exit path (where `decision.action` is `SELL` or `COVER`) never executes the ledger‑attachment code nor emits an `eval_pass` gate event.

---

**4. Effect of the patch and new failure mode**

*The patch closes the *visible* symptom* – it stops silently copying a 0‑100 confidence into 0‑1 fields and it forces explicit validation of all required ledger inputs.

*Underlying mechanism* (the need to scale orchestrator confidence from a 0‑100 range to a 0‑1 range) is still present, but the patch now **rejects** any out‑of‑range values instead of silently correcting them.

*New failure mode introduced* – any orchestrator or strategy that returns a confidence outside the accepted range now causes an exception, aborting the tick:

* Orchestrator confidence outside 0‑100 → error at lines 651‑652.
* Strategy confidence outside 0‑1 → error at lines 83‑86 (via `_ledgerConfidence01`).

Thus the patch replaces silent scaling with hard rejections, which is a stricter failure mode.

[iterations: 11 | termination: answer_given | latency: 21501ms]
