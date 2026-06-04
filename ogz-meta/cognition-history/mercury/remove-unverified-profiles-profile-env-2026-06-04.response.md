[MERCURY-BRIDGE] Index contains 24106 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury/live-bypass-guard-followup-2026-05-23.md:1-25 (doc_section: Mercury follow-up attack: live bypass guard with constructor guard context#part2) sim=0.809
  2. ogz-meta/ledger/NARRATOR_SYSTEM/WebSocketManager.js:29-239 (method: initializeDashboardWebSocket#part7) sim=0.720
  3. ogz-meta/MATRIX-SWEEP-EXTENSIBILITY.md:193-207 (doc_section: What Phase 2-5 of config consolidation fixes) sim=0.778
  4. ogz-meta/ledger/pc/phase-C/06-WebSocketManager.js:30-241 (method: initializeDashboardWebSocket#part7) sim=0.703
  5. TradingProfileManager.js:501-536 (method: loadCustomProfiles) sim=0.654
  6. ogz-meta/anchor-runner.js:91-165 (function: runP0#part1) sim=0.683
  7. ogz-meta/ledger/fixes.jsonl:79-79 (jsonl_record: FIX-2026-04-30-MATRIX-SWEEP-TRADING-PAIR#part5) sim=0.791
  8. core/WebSocketManager.js:47-256 (method: initializeDashboardWebSocket#part7) sim=0.698
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (490ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**1. Can any external source (parent env, dotenv, configEnv, instrumentEnv, CLI parsing, or the default‑argument behaviour) still cause an un‑verified/re‑constructed profile to be selected or silently change profile‑owned settings?**
No.

* The only profiles that exist are the two entries defined in *tools/tuning‑profiles.js* (lines 13‑44 and 46‑76).
* `resolveTuningProfile()` (lines 84‑90) throws an error for any name that is not in `PROFILE_DEFINITIONS`.
* In *tools/backtest‑worker‑env.js* the default `profileName` argument is set to `DEFAULT_TUNING_PROFILE` (line 182) and never reads from `process.env`.
* `buildWorkerBaseEnv()` (lines 151‑159) copies **only** the keys listed in `WORKER_ENV_ALLOWLIST`; `TUNING_PROFILE` and `BACKTEST_TUNING_PROFILE` are **not** on that allowlist, so they are never inherited from the parent environment.
* CLI entry points (`parallel‑backtest.js` lines 672‑672 and `matrix‑sweep.js` lines 726‑726) initialise `profileName` to `DEFAULT_TUNING_PROFILE` and only change it when an explicit `--profile`/`--profile=` flag is supplied.

Thus an un‑verified profile cannot be selected or silently influence the worker env.

---

**2. Can P0 still be moved by an ambient `TUNING_PROFILE` / `BACKTEST_TUNING_PROFILE` after the change?**
No.

* The worker env is built from the filtered base env (lines 151‑159) and later the resolved profile’s `env` is merged (lines 196‑199).
* After that merge the code **overwrites** the two variables with the resolved profile’s name (lines 207‑208).
* The test in *test/backtest‑worker‑env.test.js* confirms that, even when the source env contains `TUNING_PROFILE=legacy-wide` and `BACKTEST_TUNING_PROFILE=missing-profile`, the resulting env still has `TUNING_PROFILE='current-eval'` and `BACKTEST_TUNING_PROFILE='current-eval'` (lines 84‑85).

Therefore ambient values cannot move P0.

---

**3. Did this fix close the underlying mechanism, or only the visible `config‑d‑flat` symptom?**
It closes the underlying mechanism.

* The removal of the “reconstructed” profiles (`config‑d‑flat` and `balanced20‑flat`) from `PROFILE_DEFINITIONS` eliminates the hidden entry points.
* `resolveTuningProfile()` now throws on any unknown name (lines 84‑90), which prevents fallback to a default or “eval‑sizing” profile.
* The test suite explicitly checks that an unknown profile (`missing-profile` or `config‑d‑flat`) throws (`lines 112‑115).

Consequently the root cause—selection of arbitrary or reconstructed profiles via environment or defaults—is eliminated, not just the symptom that `config‑d‑flat` failed.

---

**4. What new failure mode, if any, was introduced?**

The only new failure mode is **explicit rejection of any profile name that is not in the whitelist**.

* When a caller supplies an invalid `profileName` (e.g., `--profile=config‑d‑flat` or an environment variable), `resolveTuningProfile()` throws an error (lines 84‑90).
* The test suite now expects this error (`test('unknown tuning profile fails loudly…'`, lines 112‑115).

Thus scripts that previously fell back silently to the default “eval‑sizing” profile will now abort with an exception. No other silent bypasses or regressions were observed.

[iterations: 6 | termination: answer_given | latency: 5268ms]
