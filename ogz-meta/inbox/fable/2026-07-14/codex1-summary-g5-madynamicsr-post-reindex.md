# codex1: G5 MADynamicSR logic attack post-reindex

## Index contract

- Active Mercury index timestamp: `2026-07-14T21:29:42.731Z`
- Active Mercury indexed SHA: `a476afbed787c79a210f427a8509afa11123f9a0`
- HEAD at dispatch: `a476afbed787c79a210f427a8509afa11123f9a0`
- Stale-index result: `PASS` for this run. The attack did not trail HEAD.
- Dirty tracked files at reindex: `run-empire-v2.js`, `test/aggregate-source-backfill.test.js`. These are outside the MADynamicSR strategy scope and were not touched by this report.

## Verdict

`incoherent`

MADynamicSR still emits direction from slope plus absolute EMA proximity. It does not prove the candle approached the EMA from the correct side. That lets the strategy label a resistance retest from below as a long pullback into support, or a support retest from above as a short pullback into resistance.

## Two-tier result

Mercury Pass 1 returned `incoherent` with clean tool telemetry:

- `tool_calls=18`
- `succeeded=18`
- `failed=0`
- tools: `git_diff`, `git_show`, `open_file`, `search`
- run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-14.jsonl:7`

Fable review returned `needs_more_evidence` because Mercury's main 200-EMA argument was not supported by the cited doctrine. Fable required a recheck on the trend gate and the spec text.

Mercury Recheck 1 answered the requested point with clean tool telemetry:

- `tool_calls=14`
- `succeeded=14`
- `failed=0`
- tools: `open_file`, `search`

## Tier disagreement

Fable correctly rejected Mercury's unsupported premise that the local trigger must be gated by the 200-EMA. The operator doctrine says 9/20(/50) on the trading timeframe are entry structure, while 50/200 on 1h+ are regime/bias congruence only:

- `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:134-142`

So this report does **not** use "missing 200-EMA gate" as the load-bearing defect.

The supported defect is narrower and stronger: the current trigger does not distinguish pullback-to-support from underside retest/resistance, because the touch check is absolute distance and direction is assigned from EMA slope only.

## Findings

### 1. Thesis -> trigger: absolute proximity can satisfy the trigger while violating the pullback thesis

Evidence:

- `modules/MADynamicSR.js:337-339` calculates `ma20`, `ma200`, and `atr`.
- `modules/MADynamicSR.js:343-345` sets `touchingMA` from `_isTouchingEMA(price, ma20)`.
- `modules/MADynamicSR.js:643-645` implements `_isTouchingEMA` as absolute percentage distance only.
- `modules/MADynamicSR.js:375-398` emits a signal whenever `touchingMA` is true and the MA slope is rising or falling.

Counterexample:

- 20 EMA is rising.
- Price is below the 20 EMA and rallies upward into the underside of the EMA.
- `_isTouchingEMA` returns true because distance is small.
- `maSlope === 'rising'` assigns `direction = 'buy'`.

That is an underside retest into resistance, not a long pullback into rising support.

### 2. Trigger -> direction: the trend gate is not a side-of-approach gate

Evidence:

- `modules/MADynamicSR.js:380-385` assigns buy on rising MA slope and sell on falling MA slope.
- `modules/MADynamicSR.js:679-687` defines the trend gate as `maSlope === 'rising' || maSlope === 'falling'`.

The trend gate proves non-flat slope. It does not prove the candle is pulling back from above into rising support or from below into falling resistance.

### 3. Confidence math: current landed config is not dead-zoned

Mercury raised a hypothetical dead-zone where `extensionMin` is set to zero. That is not a landed-code break in this run.

Evidence:

- `config/trading.config.json:1617-1629` sets explicit multipliers.
- `config/trading.config.json:1618` has `extensionMin: 0.7`.
- `modules/MADynamicSR.js:689-704` clamps the extension multiplier between `extensionMin` and `1`.

Current config can penalize but does not mathematically zero the strategy by this branch.

### 4. Exit fit: structural levels are calculated but not handed to the exit policy

Evidence:

- `modules/MADynamicSR.js:820-872` computes structural stop/take-profit geometry.
- `modules/MADynamicSR.js:397-409` computes `structural` and includes it in `signalData`.
- `core/StrategyOrchestrator.js:1394-1402` explicitly removes override-level extraction and returns `signalData` only.
- `config/trading.config.json:1293-1302` still uses the static MADynamicSR exit contract: `-0.8%` stop, `1%` target, `0.5%` trail, `0.7%` activation, `180` minute max hold.

This is not necessarily a wiring bug for G5, but the logic fit is incomplete: the module computes structure-specific geometry, while the trade birth path uses the fixed contract instead of strategy-owned structural levels.

### 5. Platform interaction: MTF can add another trend opinion after the module's own slope logic

Mercury flagged possible double trend pressure. This report keeps it as a watch item, not the core verdict.

The module's own local slope check and confidence profile already include trend state. Any later MTF confluence penalty/boost must be inspected during the strategy sweep so it does not silently override a locally coherent pullback setup.

## Reliability

- Mercury index was fresh for HEAD.
- Mercury tool layer had zero failures in Pass 1 and Recheck 1.
- Fable did challenge the unsupported 200-EMA premise and forced a narrower recheck.
- Final verdict is based on repo evidence plus the recheck, not on the rejected 200-EMA assumption.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-madynamicsr-logic-attack-prompt-post-reindex.md`
- Raw two-tier output: `ogz-meta/inbox/fable/2026-07-14/g5-madynamicsr-bridge-output-post-reindex.txt`
- Superseded stale-index report: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-madynamicsr.md`

## No code changes

This mission is report-only. No strategy, config, runtime, or test files were changed.
