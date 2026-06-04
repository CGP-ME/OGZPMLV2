[MERCURY-BRIDGE] Index contains 24106 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. CHANGELOG.md:939-946 (doc_section: Atomic fix: 2 files, 15/-4 lines (`747909d`)) sim=0.772
  2. ogz-meta/ledger/spec fixes/_done/CC-SPEC-PARALLEL-BACKTEST-ENABLE-FLAGS.md:17-30 (doc_section: The Fix) sim=0.779
  3. ogz-meta/ledger/CC-SPEC-BACKTEST-PIPELINE-RESURRECTION.md:255-277 (doc_section: Mercury Prompt) sim=0.772
  4. ogz-meta/ledger/pre-apex-revised-audit-2026-04-13.md:660-676 (doc_section: Q30: Does tools/parallel-backtest.js worker spawn block set ENABLE_SMS=true and SMS_VP_RTH_ONLY=true? Cite file:line.) sim=0.757
  5. ogz-meta/BACKTEST-OPS.md:407-409 (doc_section: 5. Env Var Leaks in Parallel) sim=0.767
  6. ogz-meta/ledger/BACKTEST-OPS.md:319-321 (doc_section: 5. Env Var Leaks in Parallel) sim=0.767
  7. ogz-meta/ledger/NARRATOR_SYSTEM/BACKTEST-OPS.md:337-339 (doc_section: 5. Env Var Leaks in Parallel) sim=0.767
  8. ogz-meta/ledger/pc/phase-C/07-BACKTEST-OPS.md:367-369 (doc_section: 5. Env Var Leaks in Parallel) sim=0.767
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] Response empty after cleaning
[TRAI] LLM warm-up complete (486ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[REACT] Iteration 1/60
[REACT] Message history: 3 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing list_files({"path":"","pattern":"backtest-worker-env"})
[REACT] Iteration 2/60
[REACT] Message history: 5 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing list_files({"path":".","pattern":"backtest-worker-env"})
[REACT] Iteration 3/60
[REACT] Message history: 7 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"backtest-worker-env","file_pattern":"*","limit":20})
[REACT] Iteration 4/60
[REACT] Message history: 9 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing open_file({"path":"tools/backtest-worker-env.js","start_line":1,"end_line":400})
[REACT] Iteration 5/60
[REACT] Message history: 11 messages
[REACT] Assistant requested 1 tool call(s)
[REACT] Executing grep({"query":"DIRECTION_FILTER:","file_pattern":"*","limit":20})
[REACT] Iteration 6/60
[REACT] Message history: 13 messages
[REACT] Final answer on iteration 6

═══ ANSWER ═══

**1. Source‑env DIRECTION_FILTER is not silently overwritten by “both”**
- The whitelist that is copied from the parent process does **not** contain `DIRECTION_FILTER` (lines 9‑27).
- `resolveDirectionFilter` checks `configEnv.DIRECTION_FILTER` first, then `sourceEnv.DIRECTION_FILTER`, and only falls back to the canonical default “both” when **both** are missing (lines 196‑199).

**2. Config‑env DIRECTION_FILTER always wins over source‑env**
- `resolveDirectionFilter` returns the normalized `configEnv.DIRECTION_FILTER` before trying the source value (lines 196‑199).
- The effective filter is stored in `directionFilter` and then written back into the config object (lines 226‑230) and finally placed into the worker env (line 242).

**3. Alias values (“long”, “short”) are always normalized**
- The alias map is defined (lines 62‑65).
- `normalizeDirectionFilter` applies this map before any further processing (lines 181‑188).

**4. Invalid direction values now throw instead of falling back**
- `normalizeDirectionFilter` validates the normalized value against `VALID_DIRECTION_FILTERS` and throws an error for any unknown token (lines 188‑192).

**5. The summary reports the effective direction correctly**
- `summarizeWorkerEnv` copies the `DIRECTION_FILTER` field from the final env into the summary (lines 250‑255).
- The final env includes the resolved filter at `DIRECTION_FILTER: directionFilter` (line 242).

**6. Effect of the fix**
- The fix **closes the symptom** (silent overwrite, missing validation, and alias leakage) by adding explicit normalization, validation, and a deterministic precedence order.
- The underlying mechanism of merging three env layers (canonical → config → instrument) remains unchanged; it still relies on the same `Object.assign`‑style spread.
- **New failure mode:** any invalid `DIRECTION_FILTER` supplied in `sourceEnv` or `configEnv` now throws an exception (lines 188‑192) instead of being silently coerced to “both”. Callers that do not catch this error will cause the worker process to abort.

*All citations refer to `tools/backtest-worker-env.js` at the line numbers shown above.*

[iterations: 6 | termination: answer_given | latency: 8962ms]
