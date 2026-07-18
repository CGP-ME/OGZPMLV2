# K3 Bakeoff Test 5 Rerun - Split Architecture Pack

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-5-rerun.md`
Raw run dir: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18-rerun/`

## Why This Rerun Exists

The first Test 5 prompt was too broad. It bundled many architecture hunt vectors into one Mercury question, which violated the one-question rule and caused tool thrash. This rerun split the architecture pass into single-candidate questions. Each Mercury run asked one thing, Kimi reviewed that packet, and blocking Kimi critiques launched one Mercury recheck.

## Index Receipt

- Indexed runtime-code SHA: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Current HEAD while writing: report/data commits after the index.
- Runtime-code relevance: no `core/`, `modules/`, `foundation/`, `config/`, `run-empire-v2.js`, or sweep-tool code changed after the indexed SHA.
- Dirty tracked files: `ogz-meta/Alignment/README.md`, `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md` existed before this report lane and were not touched.

## Split Runs

| Run | One Question | Mercury/Kimi Result | Tool Quality | Disposition |
| --- | --- | --- | --- | --- |
| 5A0 | Config authority, still too broad | timed out before answer | incomplete | Superseded by 5A1-5A5. Raw log kept. |
| 5A1 | Is `enableDashboard` consumed or dead? | Kimi verdict `pass`; Mercury verdict consumed | 9/9 tools succeeded; Kimi latency 8.926s | Earlier dead-config claim is false. |
| 5A2 | Does `MultiAssetManager` directly read env for broker/pair/asset class? | Kimi verdict `found_break`; recheck clean | pass 4/4 tools, recheck 6/6 tools; Kimi latency 25.860s | Real config-authority issue. |
| 5A3 | Can `ConfigLoader.setOverrides()` mutate live/paper config? | Kimi first verdict `needs_more_evidence`; recheck listed all call sites | pass 8/8 tools, recheck 2/2 tools; Kimi latency 17.127s | Caged to Jest/test callers; earlier live-mutation claim is not proven. |
| 5A4 | Is `BreakAndRetest` instantiated even when disabled? | Kimi first verdict `needs_more_evidence`; recheck supplied constructor and `shouldRegister` evidence | pass 11/11 tools, recheck 6/7 tools; Kimi latency 13.714s | Real dead-instantiation cleanup candidate; one recheck range-too-large failure marked degraded. |
| 5A5 | Does BacktestRunner context behavior diverge from live TradingLoop? | Kimi first verdict `needs_more_evidence`; recheck clean | pass 9/9 tools, recheck 25/25 tools; Kimi latency 22.483s | Real contract mismatch candidate; needs design ruling before calling it a defect. |

## Findings

### 1. `enableDashboard` Is Consumed

Result: `consumed`

Mercury found and Kimi accepted concrete runtime consumers:

- `foundation/ConfigLoader.js:1029-1030` defines `strategies.enableDashboard`.
- `foundation/ConfigLoader.js:1740-1741` maps `pipeline.enableDashboard`.
- `run-empire-v2.js:1041-1044` gates Dashboard WebSocket initialization.
- `run-empire-v2.js:1427-1434` gates DashboardBroadcaster construction.

Disposition: remove `enableDashboard is dead` from the architecture issue list.

### 2. `MultiAssetManager` Has Direct Env Reads

Result: `env_bypass_found`

Rechecked evidence:

- `core/MultiAssetManager.js:40` reads `process.env.BROKER`.
- `core/MultiAssetManager.js:47` reads `process.env.TRADING_PAIR`.
- `core/MultiAssetManager.js:52` reads `process.env.BROKER` again for configured broker comparison.
- `foundation/ConfigLoader.js:5-7` states the owner rule: only ConfigLoader reads `process.env`.
- `config/trading.config.json` currently does not define broker/trading-pair/asset-class behavioral config, which means there is not yet a clean profile-owned replacement surface for this module.

Disposition: real config-authority issue. It should become its own lane: add profile-owned broker/asset/pair routing inputs or route this module through existing broker/session ownership, then delete these direct env reads.

### 3. `ConfigLoader.setOverrides()` Is Caged

Result: `caged_to_tests_backtests`

Evidence:

- `foundation/ConfigLoader.js:3742-3747` guard throws unless the process is a Jest runtime.
- `foundation/ConfigLoader.js:4344-4347` `setOverrides()` calls that guard before mutation.
- Mercury recheck listed 43 `ConfigLoader.setOverrides` call sites, all under `test/`.

Kimi value: Kimi rejected the first answer because Mercury did not show the full caller list. The recheck produced the caller inventory.

Disposition: not a live/paper mutation door at current HEAD. Keep it on the watch list as a test-only mutable surface, but do not classify it as live authority.

### 4. `BreakAndRetest` Dead Instantiation

Result: `dead_instantiation_found`, evidence degraded but sufficient for a cleanup candidate.

Evidence:

- `core/StrategyOrchestrator.js:850-860` instantiates `this.breakAndRetestModule = new BreakAndRetest();` without a config guard.
- `core/StrategyOrchestrator.js:1512-1515` `shouldRegister()` only checks the solo-strategy filter.
- `core/StrategyOrchestrator.js:2126` applies `pipeline.enableBreakRetest` later in the pipeline toggle map.

Kimi value: Kimi forced Mercury to show `shouldRegister()` and the constructor context before accepting the dead-instantiation shape.

Disposition: real cleanup lane candidate. It is not the same as an active-strategy bug; it is dormant runtime allocation/state surface after the router/roster cleanup era.

### 5. `BacktestRunner` Context Contract Needs Ruling

Result: `needs_design_ruling`

Evidence:

- `core/BacktestRunner.js:141-150` throws if `ctx.symbol`, `ctx.timeframe`, `ctx.storeTimeframeCandle`, or `ctx.handleMarketData` are missing.
- Mercury recheck found `core/TradingLoop.js` does not read `this.ctx.symbol`; it routes symbols through method arguments and `symbolContexts`.
- Mercury recheck found `core/TradingLoop.js` does not reference `ctx.storeTimeframeCandle` or `ctx.handleMarketData`.
- For timeframe, TradingLoop uses runtime scope/config fallback and can throw when router routing is active if timeframe is still absent.

Disposition: do not call this a confirmed backtest/live defect yet. It is a contract-shape mismatch: BacktestRunner requires explicit mirror hooks that the live TradingLoop does not own under the same names. That may be intentional parity scaffolding or a stale harness contract. It needs a focused code lane before any fix.

## Kimi Grade

Verdict: `partial seat earned`

Kimi performed well as an adversarial evidence reviewer:

- It passed a supported claim when evidence was sufficient (`enableDashboard`).
- It caught Mercury contradiction and missing inspection (`MultiAssetManager`).
- It forced full caller inventory (`setOverrides`).
- It forced constructor/helper proof (`BreakAndRetest`).
- It blocked an overclaimed parity finding until exact live field behavior was traced (`BacktestRunner`).

Kimi did not prove the advertised "1M direct whole-repo inspection" mode, because current `--consensus` architecture makes it review Mercury's evidence, not directly inspect repo files. The correct future lane remains a direct packed-context Kimi runner if Trey wants that specific capability.

## Corrected Architecture Queue From This Rerun

1. `MultiAssetManager` config-authority lane: remove direct broker/pair env reads by introducing or consuming a profile/session-owned source.
2. `BreakAndRetest` dead-instantiation cleanup: instantiate only if live in the roster path, or delete if permanently dormant.
3. BacktestRunner context contract review: decide whether its required mirror hooks are current law or stale harness shape.

Removed from issue list:

1. `enableDashboard` dead-config claim.
2. `ConfigLoader.setOverrides` live/paper mutation-door claim.
