# Codex1 Summary: G5 MADynamicSR Logic Attack

## SUPERSEDED

Status: SUPERSEDED by stale Mercury index check on 2026-07-14.

Reason:

- Active Mercury index metadata reported `indexed_at=2026-07-13T00:51:45.988Z`.
- Active Mercury index metadata reported `head_sha=3086ff7f9f70a2c0a37868cc0df9267b3535f741`.
- R2 merge commit `acd3e82d061759d335a3850ba43d2e1c9b2ac452` landed at `2026-07-14 05:11:14 +0000`.
- Current HEAD for this check was `a476afbed787c79a210f427a8509afa11123f9a0`.

Disposition: do not use this verdict for Trey ruling. Reindex Mercury, then rerun MADynamicSR G5 from the saved prompt or a refreshed equivalent.

Date: 2026-07-14
Branch: codex/multi-asset-symbol-state
Mission: G5-ROSTER, strategy 1 of 8
Strategy: MADynamicSR
Code changes: none

## Verdict

**incoherent**

The supported break is the trigger-to-direction link: the code treats any touch of a rising 20 EMA as a long, without checking whether price approached the EMA from above as support or from below as resistance. Fable rejected Mercury's first weaker counterexample, but Mercury's Fable-requested recheck confirmed the stronger counterexample with file:line evidence.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-madynamicsr-logic-attack-prompt.md`
- Raw two-tier bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-madynamicsr-bridge-output.txt`
- Mercury run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-14.jsonl:2`

## Mechanism Compliance

- Mercury pass 1 ran with repo tools.
- Fable adversarial review ran and marked the first pass `needs_more_evidence`.
- Mercury recheck ran from Fable's exact challenge.
- Toolfail status: none.
- Evidence quality: mixed but usable. Initial Mercury overclaimed; Fable caught it; recheck confirmed one core logic break.

## Supported Findings

### 1. Trigger -> Direction: Side-of-EMA Approach Is Not Checked

Current code:

- `modules/MADynamicSR.js:343` sets `touchingMA = this._isTouchingEMA(price, ma20)`.
- `modules/MADynamicSR.js:643-645` uses absolute distance only: `Math.abs(price - ema) / ema * 100`; no above/below or prior-candle approach check.
- `modules/MADynamicSR.js:346` computes only MA slope.
- `modules/MADynamicSR.js:614-616` maps slope to `rising`, `falling`, or `flat`.
- `modules/MADynamicSR.js:375-395` enters the touch block.
- `modules/MADynamicSR.js:380-382` emits `direction = 'buy'` for any touch when slope is rising.
- `modules/MADynamicSR.js:383-385` emits `direction = 'sell'` for any touch when slope is falling.
- `modules/MADynamicSR.js:415-418` returns that direction in the signal.

Constructed counterexample confirmed by Mercury recheck:

- Price has been trading below a rising 20 EMA.
- Price rallies up into the rising 20 EMA from below.
- That is a resistance-rejection context, not a pullback into support.
- `_isTouchingEMA` returns true because distance is absolute.
- `maSlope === 'rising'` makes the strategy emit `direction='buy'`.

Why this breaks the doctrine:

- G5 intent says dynamic MA S/R requires long pullbacks into rising MA support and short pullbacks into falling MA resistance.
- A rising MA touched from below is not rising-MA support. The code cannot distinguish it from a valid pullback from above.

### 2. Exit Fit Is Not Strategy-Owned In The Module

Current code:

- `modules/MADynamicSR.js:397-409` computes confidence and structural profile.
- `modules/MADynamicSR.js:420-426` includes `structural` under `signal.levels`.
- `core/StrategyOrchestrator.js:1394-1402` explicitly says SL/TP extraction was removed and exit contracts handle exits now.
- `config/trading.config.json:1293-1302` gives MADynamicSR a static contract: `stopLossPercent -0.8`, `takeProfitPercent 1`, `trailingStopPercent 0.5`, `trailingActivation 0.7`, `maxHoldTimeMinutes 180`.
- `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:22-33` says each strategy defines its own stop/target/trail geometry and trend strategies get runners.

Disposition:

- Not enough to say exits are "missing"; a per-strategy contract exists.
- The logic still violates strategy-owned exit doctrine because the module's structural S/R profile does not own the actual exit geometry; the static contract closes the trade.

## Unsupported Or Challenged Mercury Claims

### Min-confidence claim is not accepted as stated

Mercury claimed no min-confidence guard exists. Fable correctly challenged that claim.

Current code shows downstream gating:

- `core/StrategyOrchestrator.js:1378-1380` drops MADynamicSR if `conf < this.minStrategyConfidence`.
- `core/StrategyOrchestrator.js:2446` also qualifies final results by `rankingScore >= this.minStrategyConfidence`.
- `core/StrategyOrchestrator.js:629` sources `this.minStrategyConfidence`.

Conclusion:

- There may be no module-local `minConfidence`, but the G5 claim "no minimum-confidence guard exists" is unsupported.

### Zero-multiplier dead-zone claim is not accepted as stated

Mercury used a hypothetical zero multiplier. Current config validation and values do not support that exact claim:

- `modules/MADynamicSR.js:206-210` requires multipliers and structural values to be positive.
- `config/trading.config.json:1617-1629` landed multipliers are positive, including `extensionMin 0.7`, `pullbackCooldown 0.6`, `structuralInvalid 0.7`.

Conclusion:

- Confidence can be reduced, but the specific zero-dead-zone claim is not supported by current config.

### MTF contradiction claim is not accepted as stated

Mercury claimed MTF penalties break self-containment.

Current code:

- `core/StrategyOrchestrator.js:1094-1118` applies MADynamicSR MTF confidence adjustments/annotations.
- `config/trading.config.json:1766-1770` owns those values.

Fable correctly noted confidence down-weighting is not automatically a doctrine violation because the mission allows confluence/multipliers. This remains a platform-interaction note, not a proven incoherence finding.

## Fable Disagreement, Verbatim

> Mercury's Section 2 claim that "price above the 20-EMA but maSlope rising -> direction='buy' votes the wrong side." Per the prompt's own doctrine (long pullbacks into rising MA support), price above a rising MA touching it from above IS the correct long setup. The counterexample proves intended behavior, not a break. Secondary disagreement: "No minimum-confidence guard exists" asserted without checking StrategyOrchestrator.js:1908, which was in the provided scope.

## Mercury Recheck Result

Mercury answered yes: when price is below a rising 20 EMA and rallies up to touch it from below, the code emits `direction='buy'`.

Recheck evidence:

- `modules/MADynamicSR.js:343`
- `modules/MADynamicSR.js:643-645`
- `modules/MADynamicSR.js:346`
- `modules/MADynamicSR.js:614-616`
- `modules/MADynamicSR.js:375-395`
- `modules/MADynamicSR.js:380-382`
- `modules/MADynamicSR.js:415-418`

## Required Trey Ruling Input

MADynamicSR should not move to tournament until the side-of-approach defect is fixed or Trey explicitly rules that a rising-EMA touch from below is allowed to long. If fixed, the red test should construct the below-rising-EMA rally-into-touch state and prove the strategy does not emit `buy`.

## Not Done

- No code changes.
- No tests.
- No P0 run.
- No commit/push.
- No PM2 restart.
