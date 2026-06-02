[MERCURY-BRIDGE] Index contains 16420 chunks
[MERCURY-BRIDGE] Query router: type=landmine mode=hybrid-classified boost=landmine top-k=0
[MERCURY-BRIDGE] Rationale: landmine/rules pattern detected; boost landmine and guardrails
[MERCURY-BRIDGE] Starter context: skipped (router policy=skip)
[MERCURY-BRIDGE] Starter context: 0 chunks
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (195ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**Result – no parity break was found.**

All of the places that could cause the three “symptoms” are covered by the new logic in `tools/parallel‑backtest.js` and the existing wiring in `tools/matrix‑sweep.js`:

| Symptom | Evidence that it is **not** happening |
|---------|----------------------------------------|
| **1. Solo‑strategy child‑worker registers zero active strategies** – the worker builds the required enable‑flags (`ENABLE_NOWICK`, `ENABLE_ORB`, `ENABLE_BREAKRETEST`) from the solo‑strategy name (`buildDormantStrategyEnableEnv`) and injects them into the child‑process env **before** the orchestrator runs. <br>```js\nconst dormantStrategyEnv = buildDormantStrategyEnableEnv(selectedSoloStrategy);\n... // later spreads …dormantStrategyEnv into env\n```<br>Lines 339‑374 of `tools/parallel‑backtest.js` show the env is assembled with the toggles present. |
| **2. Config‑path where `SOLO_STRATEGY` differs from parent and wrong toggle is set** – the sweep configs generated for the *strategy‑sweep* set `SOLO_STRATEGY` explicitly (e.g. `{ env: { SOLO_STRATEGY: 'NoWickImbalance' } }` at line 260‑262). The child picks it up via `config.env?.SOLO_STRATEGY || process.env.SOLO_STRATEGY` (line 340) and then builds the matching toggles (line 342). No mismatch can arise because the parent’s `SOLO_STRATEGY` is ignored when a sweep supplies its own. |
| **3. Non‑solo path silently changes operator‑specified env** – when no solo strategy is supplied `parseSoloStrategies` returns an empty array, `buildDormantStrategyEnableEnv` returns `{}` (line 94‑100) and the code simply spreads `...config.env` (line 383) without adding any toggle. The `cleanEnv` is only stripped of keys that *do* appear in `dormantStrategyEnv` (line 343‑345), so a non‑solo run never alters user‑provided flags. |
| **4. Live/back‑test parity break from exported helpers or moved init** – the helpers (`STRATEGIES`, `parseSoloStrategies`, `buildDormantStrategyEnableEnv`, `assertDormantStrategyEnvCompatible`) are pure functions; exporting them does not affect runtime. The calls to `prepareResultsDir()` and `cleanupParallelStateFiles()` are still executed at the start of `main()` (lines 669‑670), preserving the original side‑effects. |
| **5. Underlying mechanism vs. symptom** – the patch fixes the *environment‑toggle* mechanism for dormant strategies (the only symptom that existed). The sibling runner `tools/matrix‑sweep.js` already injects `ENABLE_SMS` for `SmartMoneySweep` (lines 245‑249) and, after this patch, the two runners now share the same “solo‑strategy → enable‑toggle” model. No other runner in the repo needs the same treatment. |

**Conclusion** – after inspecting the relevant sections (STRATEGIES list 69‑82, solo‑parsing 84‑90, env‑builder 92‑100, assert 103‑111, child‑env assembly 330‑384, sweep definitions 250‑262, and the unit‑test 1‑52) there is no evidence of a broken path, a mismatched `SOLO_STRATEGY`, or a parity regression. The assumptions that the patch could leave a solo‑strategy without its required toggle, or that it could silently override user‑provided env vars, were all disproved by the code.

[iterations: 22 | termination: answer_given | latency: 29802ms]
