# Codex-1 G5 Fable Rerun: EMATrendRetest

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: EMATrendRetest
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false
- Index scope: repo code plus ogz-meta/Alignment and ogz-meta/specs only

## Run Ledger

- Superseded stale/pre-rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:2
- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:3
- Run id: 2026-07-17T02-05-01-181Z-47b01c6eb49a
- Mercury termination: answer_given
- Mercury iterations: 11
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

coherent-with-flaws.

Mercury first-pass called the strategy incoherent. Fable rejected the overreach because Mercury's first counterexample used a candle spanning the EMA, which the cited code treats as distance 0 and quality 1, not quality 0. Fable forced a targeted recheck with landed config values.

## Supported Finding

The supported flaw is a boundary-quality retest acceptance issue, not a proven wrong-side strategy:

- modules/EMATrendRetest.js:250-256 sets `distance = 0` for candles spanning the EMA, otherwise computes distance to the EMA and accepts `distance <= zone`.
- modules/EMATrendRetest.js:256 computes `quality = 1 - distance / zone`; a non-spanning candle exactly at the zone boundary can have quality 0 and still pass.
- config/trading.config.json:1981 sets `touchZoneAtr` to 0.35.
- config/trading.config.json:1984-1988 sets confidence base/bonuses/max.
- modules/EMATrendRetest.js:278-287 turns that accepted retest into confidence.

Fable's recheck required landed arithmetic. Mercury recheck cited:

- `touchZoneAtr = 0.35`
- `minSlopePct = 0.03`
- `confidenceBase = 0.58`
- `confidenceSlopeBonus = 0.08`
- `confidenceRetestBonus = 0.12`
- `confidenceConfirmationBonus = 0.08`
- `maxConfidence = 0.88`
- `targetRR = 3`

Minimum accepted-signal confidence can still clear the exit contract floor even when retest quality is 0.

## Rejected Or Narrowed Claims

- Fable rejected Mercury's original "quality 0" spanning-candle example.
- Fable rejected the alleged direction failure because Mercury did not construct a wrong-side vote.
- Fable required actual config values instead of invented arithmetic.
- Local read confirmed stop geometry is ATR-derived from `atrStopMult` at modules/EMATrendRetest.js:279 and config/trading.config.json:1989-1993, not a fixed copied percentage.

## Reliability

Usable two-tier evidence. Fable challenged the first-pass verdict, Mercury rechecked with repo tools, and local reads confirmed the key file:line paths. Treat this as final-shape input, not an implementation command by itself.
