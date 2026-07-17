# Codex-1 G5 Fable Rerun: NoWickImbalance

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: NoWickImbalance
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false

## Run Ledger

- Superseded broad-config toolfail: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:7
- Superseded invalid-tool toolfail: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:8
- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:9
- Run id: 2026-07-17T02-14-07-540Z-bbd78b041577
- Mercury termination: answer_given
- Mercury iterations: 12
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

incoherent with the embedded NoWick intent spec, but not because of the claimed `age` crash.

## Supported Findings

NoWick implements some core pieces:

- modules/NoWickImbalance.js:102-140 detects bullish no-bottom-wick and bearish no-top-wick candles, with a body-size filter and floating tolerance.
- modules/NoWickImbalance.js:155-189 implements a swing-high/swing-low trend proxy.
- modules/NoWickImbalance.js:300-307 waits for tap of the stored NoWick level.
- modules/NoWickImbalance.js:314-325 re-checks trend at entry time.
- modules/NoWickImbalance.js:328-357 builds structural stop and 1:1 target from a recent swing plus breathing room.

But the canonical embedded intent had eight rules. Current source search and local reads show no implementation of the required news filter, first-three-hours-Asia session filter, FVG/imbalance-against filter, near-touch invalidation, or split-position rule. The code's trend proxy is swing-high/swing-low, not the specified BOS/CHoCH structure.

## Rejected Claim

Mercury first-pass claimed a fatal `age` ReferenceError. Fable challenged it. Mercury recheck refuted it:

- modules/NoWickImbalance.js:283 declares `const age = state.candleCount - level.formationCount`.
- modules/NoWickImbalance.js:296 declares the same `age` for the tap path.
- modules/NoWickImbalance.js:384,390,394 read `age` after that declaration.

So signal generation is not dead from `age`; the strategy is incoherent because multiple required intent filters/rules are absent or materially different.

## Reliability

Usable two-tier evidence after two failed attempts. The report keeps both failed attempts visible because they explain why the accepted run is line 9, not lines 7-8.
