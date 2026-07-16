# Codex1 Summary: MADynamicSR Approach-Side Fix

Date: 2026-07-16
Branch: codex/multi-asset-symbol-state
Base commit at proof time: df3a11a7 Fixed OGZTPO restoration
Status: diff ready for Trey review; not committed

## Scope

Implemented the MADynamicSR approach-side correction requested after the G5 finding.

Touched files:

- config/trading.config.json
- modules/MADynamicSR.js
- test/masr-restoration.test.js

No PM2 restart.
No staging or commit for this MADynamicSR slice.

## Fix Shape

MADynamicSR previously treated a 20 EMA touch as absolute distance only, then assigned direction only from the 20 EMA slope. That allowed this false-positive class:

- prior close below the 20 EMA
- current candle rallies into/touches a rising 20 EMA from below
- current price is below or at the 200 EMA regime line
- strategy emits buy

The patch adds a config-owned approach-side hard condition:

- `conditionFlags.approachSide`
- `approachRules.allowLongFromAbove`
- `approachRules.allowLongFromBelowBullReclaim`
- `approachRules.allowLongFromBelowOutsideBull`
- `approachRules.allowShortFromBelow`
- `approachRules.allowShortFromAboveBearReclaim`
- `approachRules.allowShortFromAboveOutsideBear`

Default is strict v1:

- from-above long pullback allowed
- from-below bull reclaim exists but is disabled for tournament flipping
- from-below outside bull regime is rejected
- symmetric short-side arms are config-owned

## Red Test

Focused test added:

- `test/masr-restoration.test.js`: rejects from-below rally into rising EMA when price is below the 200MA regime line

Parent/current-before-fix behavior was red:

```text
Expected: "neutral"
Received: "buy"
```

The patched code returns:

- direction: `neutral`
- reason: `approach_side_reject`
- approachSide.priorSide: `below`
- approachSide.currentRegime: `below_sr_ma`
- approachSide.allowed: `false`

Also added a config-arm proof showing `allowLongFromBelowBullReclaim: true` deliberately permits the looser bull-reclaim variant when price is above the 200 EMA.

## Verification

Passed:

```text
node --check modules/MADynamicSR.js
npx jest test/masr-restoration.test.js --runInBand
npx jest test/strategy-orchestrator-pipeline-toggles.test.js --runInBand
git diff --check
```

Focused Jest results:

- `test/masr-restoration.test.js`: 6/6 passing
- `test/strategy-orchestrator-pipeline-toggles.test.js`: 9/9 passing

P0 gate:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Exact PASS:

- final balance: 8338.146639366509
- trades: 1551
- win rate: 52.2%
- profit factor: 0.64

Gate artifact:

- ogz-meta/gates/runs/multi-runtime-latest.json

## Mercury / Fable

First Mercury attack found no surviving counterexample but had tool failures, so evidence was marked degraded.

Second Mercury attack:

- tool calls: 20
- succeeded: 20
- failed: 0
- run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:9

Fable challenged a boundary-classification gap:

- if `_sideOfLevel` used tolerance, a strictly below close could classify as `at`
- `at` routes to `allowLongFromAbove`

Mercury recheck quoted `_sideOfLevel`:

```js
if (price > level) return 'above';
if (price < level) return 'below';
return 'at';
```

No tolerance/epsilon path exists. Strictly below remains `below`.

Local follow-up checks:

- `config/trading.config.json` has `"approachSide": true`
- `core/StrategyOrchestrator.js` constructs MADynamicSR with `ConfigLoader.get('strategies.MADynamicSR')`
- no observed orchestrator bypass of the module config block

## Current Git State

Tracked dirty files for this slice:

- config/trading.config.json
- modules/MADynamicSR.js
- test/masr-restoration.test.js

Untracked cognition/ledger piles still exist and were not touched.

## Review Decision Needed

Trey review required before commit.

If approved, stage exactly:

```text
config/trading.config.json
modules/MADynamicSR.js
test/masr-restoration.test.js
```

Suggested commit:

```text
Fixed MADynamicSR approach-side entries
```
