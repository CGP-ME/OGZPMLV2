# Codex-1 G5 Fable Rerun: TimeSeriesMomentum

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: TimeSeriesMomentum
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false

## Run Ledger

- Superseded failed attempt: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:6
- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:10
- Run id: 2026-07-17T02-15-53-169Z-0c3b4489d199
- Mercury termination: answer_given
- Mercury iterations: 11
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

coherent-with-flaws.

Mercury first-pass called it incoherent. Fable challenged that because sign-of-N-bar return plus SMA trend filter is a recognizable time-series momentum shape. The supported flaw is not "one-candle return"; current code uses N-bar return. The supported flaw is that `minReturn` is zero, making the trigger extremely permissive.

## Supported Findings

Evidence:

- modules/TimeSeriesMomentum.js:97 reads `past` at `latestIndex - this.cfg.lookback`.
- modules/TimeSeriesMomentum.js:105 computes `trailingReturn = (price - past) / past`.
- modules/TimeSeriesMomentum.js:107-108 emits buy when `price > trendSMA` and `trailingReturn > minReturn`.
- modules/TimeSeriesMomentum.js:111-112 emits sell only if shorts are allowed and the symmetric condition holds.
- config/trading.config.json:2023-2026 sets lookback 100, trend period 200, `minReturn` 0, and shorts false.

Result: this is N-bar return plus SMA, not a literal one-candle trigger. But with `minReturn: 0`, any positive 100-bar return above SMA qualifies. That is weak TSMOM, not a robust persistence filter.

## Exit Fit

- config/trading.config.json:1508-1514 sets stop -2, target 4, trailing 1, trailing activation 1.5, max hold 240, non-structural exits, min confidence 0.6.
- modules/TimeSeriesMomentum.js:137-143 passes those exit hints through.

Fable challenged Mercury's "trailingActivation equals 150 percent of target" claim because Mercury did not cite the downstream consumer. This report does not treat that unit claim as proven.

## Reliability

Usable two-tier evidence after rerun. The earlier HTTP 400 is preserved as superseded line 6. Fable narrowed the verdict and forced landed config evidence.
