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
[TRAI] LLM warm-up complete (359ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**Concrete breakage introduced by the patch**

| Symptom | Evidence |
|--------|----------|
| **Non‑solo sweeps unintentionally run in *solo* mode** – when the user supplies `--solo=…` the flag is stored in `process.env.SOLO_STRATEGY` (lines 687‑694). Later, for every generated config the child‑worker env is built with `selectedSoloStrategy = config.env?.SOLO_STRATEGY || process.env.SOLO_STRATEGY` (lines 329‑330). Most sweep presets (e.g. `real`, `full`, `atr`) do **not** set `SOLO_STRATEGY` in `config.env`, so the fallback pulls the parent’s solo flag and injects it into the worker env (line 329). Consequently the worker runs with `SOLO_STRATEGY` set and the corresponding `ENABLE_*` toggles are added (line 358), even though the sweep was meant to be a multi‑strategy baseline. This changes the execution path and breaks the “backtest‑and‑live parity” guarantee. | `tools/parallel-backtest.js` lines 329‑330 – `const selectedSoloStrategy = config.env?.SOLO_STRATEGY || process.env.SOLO_STRATEGY;`<br>`tools/parallel-backtest.js` lines 687‑694 – `process.env.SOLO_STRATEGY = strat;` (sets the parent env) |
| **Solo‑only env‑toggles are missing when a config does not include them** – the `generateGauntlet` helper (lines 107‑110) only adds `SOLO_STRATEGY` to the child env, relying on `buildDormantStrategyEnableEnv` to add `ENABLE_NOWICK`, `ENABLE_ORB`, `ENABLE_BREAKRETEST`. If a user runs a solo sweep **and** also passes an explicit `ENABLE_*` flag on the command line (e.g. `ENABLE_NOWICK=false`), the later spread of `...config.env` (line 368) overwrites the flag set by `buildDormantStrategyEnableEnv`, leaving the strategy disabled and resulting in **zero active strategies** for that worker. | `tools/parallel-backtest.js` lines 107‑110 – `env = { SOLO_STRATEGY: strat };`<br>`tools/parallel-backtest.js` lines 358‑368 – `...dormantStrategyEnv, ...config.env, ...instrumentEnv` (order lets `config.env` override) |
| **Parity break for dormant‑strategy toggles** – `core/TradingConfig.js` disables the three optional strategies by default (lines 844‑850). The patch’s `buildDormantStrategyEnableEnv` only enables them when a solo strategy is detected. Because of the fallback described above, a non‑solo sweep that inherits a solo flag will enable a dormant strategy **without** the corresponding `SOLO_STRATEGY` being part of the sweep’s config (the sweep’s `config.env` still contains the original `SOLO_STRATEGY` from the parent). This leads to a mismatch between the backtest runner (which thinks the strategy is active) and the live runner (which never receives the flag), breaking parity. | `core/TradingConfig.js` lines 844‑850 – `enableBreakRetest: envBool('ENABLE_BREAKRETEST', false), … enableOpeningRangeBreakout: envBool('ENABLE_ORB', false), … enableNoWickImbalance: envBool('ENABLE_NOWICK', false)` |
| **Sibling runner that still needs the same fix** – `tools/matrix-sweep.js` builds its child‑worker env by explicitly setting the `ENABLE_*` flags for the solo strategies (lines 247‑254). It does **not** fall back to `process.env.SOLO_STRATEGY`, so it is not affected by the bug above. However, any other runner that mirrors the old pattern (e.g. a future `tools/gauntlet-sweep.js` that copies the `parallel-backtest` logic) would inherit the same issue and therefore requires the same guard (remove the fallback or clear `process.env.SOLO_STRATEGY` before non‑solo sweeps). | `tools/matrix-sweep.js` lines 233‑236 – `SOLO_STRATEGY: strat,`<br>`tools/matrix-sweep.js` lines 247‑254 – explicit `ENABLE_*` assignments |

**Minimal reproducer**

```bash
# 1️⃣ Set a solo flag (process env)
node tools/parallel-backtest.js --solo=BreakRetest --real
# The `real` preset does not set SOLO_STRATEGY in its configs,
# but the child workers receive SOLO_STRATEGY=BreakRetest (line 329)
# and ENABLE_BREAKRETEST=true (line 358), turning a multi‑strategy
# baseline into a solo‑only run → parity broken.
```

**Why the bug survives code inspection**

- The fallback to `process.env.SOLO_STRATEGY` is intentional for the “solo‑only” CLI mode, but it is **not** guarded against being active when a non‑solo sweep is selected.
- The patch moved `prepareResultsDir`/`cleanupParallelStateFiles` behind the `main` guard (lines 654‑655) – this does **not** affect parity, but the real regression is the env‑fallback described above.

**Summary**

The patch introduces a hidden path where `process.env.SOLO_STRATEGY` leaks into every child‑worker env, causing solo‑only toggles to be applied to multi‑strategy sweeps and potentially resulting in zero active strategies when a user explicitly disables an `ENABLE_*` flag. The fix should either clear `process.env.SOLO_STRATEGY` after parsing the CLI flag or remove the fallback in `selectedSoloStrategy`. The same pattern should be audited in any other runner that builds child‑worker envs (e.g., future gauntlet‑sweep scripts).

[iterations: 19 | termination: answer_given | latency: 23112ms]
