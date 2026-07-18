# K3 Bakeoff Test 5 - Whole-System Architecture Pass

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-5.md`
Raw run logs:
- `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test5-whole-system-architecture.log`
- `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test5-whole-system-architecture-rerun.log`

## Index Receipt

- Mercury index SHA for code-bearing HEAD: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Reindex inserted chunks: `10329`
- Current HEAD when this report was written: `857dcb863c78b136f6816d6cc0d18177fd2453b8`
- Code relevance: current HEAD only adds report files after the reindex; runtime code did not change after `04d5a1cf`.
- Dirty tracked files at reindex and report time: `ogz-meta/Alignment/README.md`, `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`.

## Prompt Scope

Question: whole-system architecture audit over `core/`, `modules/`, `foundation/`, `config/trading.config.json`, `run-empire-v2.js`, `tools/matrix-sweep.js`, and `tools/parallel-backtest.js`.

Target classes: cross-file contradictions, unratified authority, dead wiring, config keys produced-but-never-consumed, duplicated private calculations, backtest/live divergence, and hidden mutable state.

Secrets boundary in prompt: no `.env`, no `ogz-meta/cognition-history`, no broker/account data, no `data/journal`, no `data/state`, no logs, no public proof account data, and no API keys.

## Result

Final bakeoff verdict for Test 5: `degraded / incomplete`

Reason: the first run produced Mercury architecture findings but had two malformed empty search calls. The bridge then skipped Kimi consensus because Mercury tool failures force `inconclusive_toolfail`. The rerun reached Kimi and Kimi marked the review blocking, but the Mercury recheck did not complete before the execution cap killed the process. The full Kimi review text was not emitted to the raw log, so this is not a clean completed fourth-eye architecture pass.

## Mercury Findings From Completed First Run

Mercury verdict: `architecture_flawed`, but run-ledger verdict: `inconclusive_toolfail`.

Tool quality: 36 tool calls, 34 succeeded, 2 failed from malformed empty `search({})` arguments.

Candidate findings Mercury reported:

1. Duplicate strategy/pipeline config mappings:
   - Evidence cited: `foundation/ConfigLoader.js:1010-1030`, `foundation/ConfigLoader.js:1700-1732`.
   - Local check confirms both mapping regions exist.

2. `pipeline.enableDashboard` appears config-owned but only logged:
   - Evidence cited: `foundation/ConfigLoader.js:1029`, `run-empire-v2.js:1778-1779`.
   - Local grep confirms `enableDashboard` in config mapping/logging. Consumption needs a focused follow-up before calling it dead with finality.

3. Direct env access in `core/MultiAssetManager.js`:
   - Evidence cited: `core/MultiAssetManager.js:40-52`.
   - Local grep confirms direct `process.env.BROKER` and `process.env.TRADING_PAIR` reads. This matches the config-authority disease class.

4. Public `ConfigLoader.setOverrides()` mutable surface:
   - Evidence cited: `foundation/ConfigLoader.js:4344`.
   - Local grep confirms the function exists. It is mode/test-caged in current code around `foundation/ConfigLoader.js:3746`, so this is a mutation-surface candidate, not proof of an unguarded live mutation door.

5. BacktestRunner hard missing-context checks:
   - Evidence cited: `core/BacktestRunner.js:143-152`.
   - Needs focused review before classification. Hard context requirements may be legitimate parity enforcement, not necessarily divergence.

6. `BreakAndRetest` module instantiation while disabled by roster:
   - Evidence cited: `core/StrategyOrchestrator.js:856`, `core/StrategyOrchestrator.js:1701-1702`.
   - Local grep confirms instantiated module plus toggle-filtered strategy path. Candidate dead-instantiation cleanup.

7. `enableORB` vs `enableOpeningRangeBreakout` naming split:
   - Evidence cited: `foundation/ConfigLoader.js:1021`, `foundation/ConfigLoader.js:1731`.
   - Local grep confirms naming bridge exists. This is a naming/migration surface, not necessarily runtime break.

8. `maxRiskPerTrade` multiple consumers:
   - Evidence cited: `core/ModuleInitializer.js:38-41`, `core/BacktestRecorder.js:138`, `core/PositionSizer.js:28`.
   - Local grep confirms multiple reads. Needs ownership ruling if RiskManager consolidation wants a single risk-seat read path.

9. Direct env reads in feature/narration guards:
   - Evidence cited: `core/TradeNarrator.js`, `core/AuthFailureGuard.js`, `core/FeatureFlagManager.js`.
   - Local grep confirms direct reads, including `core/FeatureFlagManager.js:68` and `core/AuthFailureGuard.js:47`.

10. Matrix sweep pipeline toggles may be logging/recording without injection:
   - Evidence cited: `tools/matrix-sweep.js:808-820`.
   - Needs focused verification against the hermetic backtest rider before treating as current break.

## Kimi Result

Kimi was not cleanly graded on Test 5.

- First run: Kimi was skipped by bridge policy because Mercury had tool failures.
- Rerun: Kimi was invoked as `openai/kimi-k3`, initialized successfully, and marked the consensus blocking.
- Rerun Kimi latency shown before recheck: 17.920s.
- The shell execution cap killed the run during the Mercury recheck, before the bridge printed the full Kimi review or final packet.

## Kimi Value

Partial, not earned for the 1M-context architecture seat yet.

What was proven:

- Kimi can be invoked on the whole-system prompt path.
- Kimi can challenge Mercury strongly enough to request a recheck.
- The current bridge still has an operational weakness for long architecture passes: a blocking Kimi review is not durable/reportable until the recheck completes and the final packet prints.

What was not proven:

- A complete Kimi architecture verdict.
- Direct Kimi repo inspection. Current `--consensus` still makes Kimi grade Mercury's packet, not independently browse files.
- Superior whole-system recall over Mercury/Fable for this class.

## Follow-Up Candidate

Bridge/reporting lane:

1. Persist the Fable/Kimi review text immediately before launching Mercury rechecks.
2. Make long-running rechecks resumable or separately invokable from a persisted recheck prompt.
3. Add a direct packed-context Kimi lane if Trey wants the advertised 1M-context test to mean Kimi itself sees the selected code surface instead of only Mercury's evidence packet.
4. Run focused follow-ups on the strongest architecture candidates above before converting any into code lanes.
