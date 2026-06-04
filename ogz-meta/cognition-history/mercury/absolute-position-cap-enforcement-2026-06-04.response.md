[MERCURY-BRIDGE] Index contains 24106 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. core/OrderExecutor.js:546-2469 (method: executeTrade#part9) sim=0.733
  2. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:27-36 (doc_section: Summary) sim=0.801
  3. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:15-26 (doc_section: Mercury Verdict#part1) sim=0.782
  4. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:15-26 (doc_section: Mercury Verdict#part2) sim=0.769
  5. ogz-meta/cognition-history/mercury/entry-order-quantity-plan-followup-2026-05-23.md:1-70 (doc_section: Mercury follow-up attack prompt: broker order quantity plan#part1) sim=0.772
  6. ogz-meta/cognition-history/mercury/ttp-volume-cap-gate-followup-2026-05-23.md:1-26 (doc_section: Mercury follow-up attack prompt - TTP 5% volume cap after hardening#part2) sim=0.776
  7. ogz-meta/cognition-history/mercury/ttp-consistency-profit-cap-2026-05-24.md:1-18 (doc_section: root) sim=0.779
  8. ogz-meta/cognition-history/mercury/entry-plan-preorder-gate-2026-05-23.response.md:1-94 (doc_section: root#part11) sim=0.771
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] Response empty after cleaning
[TRAI] LLM warm-up complete (579ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[REACT] Iteration 1/60
[REACT] Message history: 3 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"ABSOLUTE_POSITION_CAP","file_pattern":"*.js","limit":20})
[REACT] Iteration 2/60
[REACT] Message history: 5 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/OrderExecutor.js","start_line":400,"end_line":500})
[REACT] Iteration 3/60
[REACT] Message history: 7 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/OrderExecutor.js","start_line":800,"end_line":910})
[REACT] Iteration 4/60
[REACT] Message history: 9 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"_buildEntryPlan(","file_pattern":"*.js","limit":20})
[REACT] Iteration 5/60
[REACT] Message history: 11 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"test/order-executor-pause-gate.test.js","start_line":460,"end_line":540})
[REACT] Iteration 6/60
[REACT] Message history: 13 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"test/session-router-runtime-scope.test.js","start_line":140,"end_line":200})
[REACT] Iteration 7/60
[REACT] Message history: 15 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"staleCryptoConfig","file_pattern":"*.js","limit":20})
[REACT] Iteration 8/60
[REACT] Message history: 17 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"positionSizing.absoluteCapPercent","file_pattern":"*.js","limit":20})
[REACT] Iteration 9/60
[REACT] Message history: 19 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"entryLogic.sizing.absoluteCapPercent","file_pattern":"*.js","limit":20})
[REACT] Iteration 10/60
[REACT] Message history: 21 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"test/session-router-runtime-scope.test.js","start_line":1,"end_line":60})
[REACT] Iteration 11/60
[REACT] Message history: 23 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"class TradingConfig","file_pattern":"*.js","limit":20})
[REACT] Iteration 12/60
[REACT] Message history: 25 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"core/TradingConfig.js","start_line":850,"end_line":950})
[REACT] Iteration 13/60
[REACT] Message history: 27 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"absoluteCapPercent","file_pattern":"*.js","limit":20})
[REACT] Iteration 14/60
[REACT] Message history: 29 messages
[REACT] Final answer on iteration 14

=== ANSWER ===

**Result - the cap can no longer be exceeded and the stale config path is no longer used**

| Evidence | What it shows |
|----------|---------------|
| `core/OrderExecutor.js:418-424` | `_resolveAbsolutePositionCap()` reads **`entryLogic.sizing.absoluteCapPercent`** from `TradingConfig` and throws if the value is missing, non-finite or <= 0. |
| `core/OrderExecutor.js:433-438` | `_buildEntryPlan()` resolves the cap (`capPercent = absoluteCapPercent ?? this._resolveAbsolutePositionCap()`) and **forces it on the final `sizeUsd`** (`requestedSizeUsd > absoluteCapSizeUsd ? absoluteCapSizeUsd : requestedSizeUsd`). |
| `core/OrderExecutor.js:464-466` | The plan object includes `absoluteCapPercent`, `absoluteCapSizeUsd` and `cappedByAbsoluteCap` so downstream code can only see the capped size. |
| `core/OrderExecutor.js:841-847` | After confidence-multiplier sizing the code **re-applies the absolute cap** (`if (basePositionPercent > absoluteCap) ...`) before the entry plan is built. |
| `test/order-executor-pause-gate.test.js:469-516` (especially 512-516) | The test sets `entryLogic.sizing.absoluteCapPercent = 0.04` and asserts that the plan returned to the pre-order gate contains `sizeUsd: 400` (the capped value) and `cappedByAbsoluteCap: true`. This proves the cap is honoured after confidence & confluence multipliers. |
| `grep "positionSizing.absoluteCapPercent"` - **no matches** | The old stale path is not referenced anywhere in the current codebase, confirming it no longer controls execution. |
| `grep "entryLogic.sizing.absoluteCapPercent"` - only the three lines cited above | The only active reads are the ones shown in the executor, guaranteeing the new path is the sole source. |

### Does the fix close the underlying mechanism or only the symptom?

The fix removes **all** reads of the obsolete `positionSizing.absoluteCapPercent` path and replaces them with a single, validated read of `entryLogic.sizing.absoluteCapPercent`. Because the cap is now:

1. **Validated early** (`_resolveAbsolutePositionCap` throws on missing/invalid values), and
2. **Enforced twice** - once after confidence-multiplier sizing (lines 841-847) and again when the final USD size is computed in `_buildEntryPlan` (lines 433-438),

the underlying mechanism (the absolute-position-cap enforcement) is fully corrected, not merely a symptom.

### New failure modes introduced by the fix

| New mode | Why it appears |
|----------|----------------|
| **Immediate abort on invalid/zero cap** - `_resolveAbsolutePositionCap` throws an error if the config value is missing, non-finite, or <= 0 (lines 420-422). | Previously an invalid cap would be silently ignored; now the executor halts before any order planning. |
| **Potential double-capping** - the cap is applied both after confidence sizing (lines 841-847) **and** inside `_buildEntryPlan` (lines 433-438). If a future change modifies one of those stages, the final size could be smaller than intended. | The current code is safe because both stages use the same `absoluteCap` value, but any divergence could unintentionally shrink orders. |
| **Dependency on `TradingConfig` overrides** - if a test or runtime environment forgets to provide `entryLogic.sizing.absoluteCapPercent`, the executor will throw (as seen in the direct `_buildEntryPlan` call in `session-router-runtime-scope.test.js`). | This is intentional for safety, but callers must ensure the config is present. |

Overall, the fix eliminates the stale configuration path, guarantees that the absolute-position-cap is always respected after all sizing multipliers, and replaces silent failures with explicit errors. The only new behaviours are the early error on a bad cap and the possibility of double-capping if future changes diverge from the current implementation.

[iterations: 14 | termination: answer_given | latency: 15371ms]
