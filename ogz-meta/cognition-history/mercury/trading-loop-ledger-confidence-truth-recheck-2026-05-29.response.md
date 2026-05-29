[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/sessions/CODEX-WORKLOG-2026-05-20-PRE-EVAL.md:42-133 (doc_section: Raw Running Notes) sim=0.643
  2. ogz-meta/specs/pre-eval-master-fix-plan-2026-05-20_1.md:83-104 (doc_section: Fix 1 — Confidence clamp at TradingLoop.js:135) sim=0.651
  3. ogz-meta/sessions/CODEX-WORKLOG-2026-05-20-PRE-EVAL.md:190-229 (doc_section: Current Active Work: Confidence Boundary Repair) sim=0.652
  4. ogz-meta/specs/sourcegraph-deep-search-2026-05-20_2.md:948-3143 (doc_section: Why this matters (context for prioritization)#part69) sim=0.634
  5. ogz-meta/specs/sourcegraph-deep-search-2026-05-20_2.md:948-3143 (doc_section: Why this matters (context for prioritization)#part103) sim=0.621
  6. ogz-meta/specs/sourcegraph-deep-search-2026-05-20_2.md:948-3143 (doc_section: Why this matters (context for prioritization)#part59) sim=0.611
  7. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:400-415 (doc_section: My triage) sim=0.648
  8. ogz-meta/specs/therestofthearchitecture.md:1-3051 (doc_section: root#part108) sim=0.631
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 457 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.78, 5 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (330ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=148.2)

═══ ANSWER ═══

**Result**

Both statements are false‑positive findings.

1. **Winner `finalConfidence` is never left in the 0‑100 range.**
   - The orchestrator’s raw confidence (0‑100) is divided by 100 on line 640 of `core/TradingLoop.js` → `const confidence = orchResult.confidence / 100;`
   - The value stored as `finalConfidence` is taken directly from that variable on line 1062 → `finalConfidence: confidence,`
   Consequently `finalConfidence` is always a 0‑1 value, matching the competing `adjustedConfidence`.

2. **`allResults[].confidence` is always present in a public `StrategyOrchestrator` output.**
   - `publicResult()` (lines 75‑80 of `core/StrategyOrchestrator.js`) always adds a `confidence` field:
     ```js
     confidence: publicConfidence01(result.confidenceScore, `${result.strategyName}.publicConfidenceScore`),
     ```
   - `publicConfidence01` caps the value at 1 but never omits the field, so every element of `publicResults` includes a `confidence` entry.

**Conclusion** – the alleged mismatches do not exist; the code correctly normalises both winner and competing confidences to the 0‑1 range and always supplies a confidence value in the public strategy results.

[iterations: 14 | termination: answer_given | latency: 8178ms]
