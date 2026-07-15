# codex1: G5 Donchian Logic Attack Summary

## SUPERSEDED

Status: SUPERSEDED by stale Mercury index check on 2026-07-14.

Reason:

- This report was produced before the approved Mercury reindex.
- The active pre-reindex Mercury index metadata reported `indexed_at=2026-07-13T00:51:45.988Z`.
- The active pre-reindex Mercury index metadata reported `head_sha=3086ff7f9f70a2c0a37868cc0df9267b3535f741`.
- Current post-reindex HEAD for G5 is `a476afbed787c79a210f427a8509afa11123f9a0`.

Disposition: do not use this verdict for Trey ruling. Donchian must be rerun post-reindex before final G5 scoring.

Date: 2026-07-14
Mission: G5 strategy logic coherence, DonchianBreakout
Report type: read-only attack summary
Runtime changes: none

## Verdict

coherent-with-flaws

## Two-tier mechanism

- Mercury Pass 1 verdict: incoherent
- Fable review verdict: found_break in Mercury's evidence quality
- Mercury recheck verdict: answer_given on the exact confidence-threshold challenge
- Tool reliability: no toolfails reported. Mercury pass telemetry reported 12/12 tool calls succeeded. Recheck telemetry reported 9/9 tool calls succeeded.

## Fable review challenge

Fable did not accept Mercury's broad incoherent verdict:

> Mercury's "incoherent" verdict is not internally supported by its own evidence. Citations are malformed throughout ... Finding 1 attacks the doctrine itself, not the implementation ... Finding 4's arithmetic refutes its own conclusion ... Finding 3's "unreachable votes" rests on a hypothetical 0.90 threshold, not landed config ... The confidence floor of 0.55 ... is the one plausibly real finding, but even it is overstated.

Required recheck:

- Quote landed Donchian minConfidence / equivalent threshold from `config/trading.config.json:1365-1377` and `config/trading.config.json:1727-1737`.
- Recompute the `0.55..0.85` confidence band against landed config only.

## Supported Findings

### 1. Confidence floor auto-passes current thresholds

Evidence:

- `modules/DonchianBreakout.js:120-122` computes confidence as `0.55 + min(0.30, extensionAtr * 0.15)`, clamped to `0..1`.
- `config/trading.config.json:1365-1377` sets `exitContracts.DonchianBreakout.minConfidence` to `null`.
- `config/trading.config.json:1727-1738` defines `strategies.DonchianBreakout` without a strategy minConfidence key.
- `config/trading.config.json:5` sets global `confidence.minStrategyConfidence` to `0.35`.

Arithmetic:

| extensionAtr | confidence |
| --- | ---: |
| 0.00 | 0.55 |
| 1.00 | 0.70 |
| 2.00+ | 0.85 |

Result: every Donchian vote that the module emits clears the current global strategy threshold because the minimum emitted confidence is 0.55 and the global threshold is 0.35. The implementation still scales with breakout extension, so it is not a dead confidence term, but the floor means the confidence layer does not reject marginal breakouts.

### 2. Short-side logic exists but is disabled by config

Evidence:

- `modules/DonchianBreakout.js:90-98` emits a sell only when `this.allowShorts && price < channel.lower`.
- `config/trading.config.json:1731` sets `allowShorts` to `false`.

Result: current Donchian is long-only. This is not inherently incoherent if intended, but it should be treated as a live doctrine question because the lower-channel thesis path is present in code and inactive in config.

### 3. Exit fit is broadly trend-compatible, but validation is not proven

Evidence:

- `modules/DonchianBreakout.js:78` computes `stopPct = atrStopMult * atr / price * 100`; when used as a percent of price, this equals an absolute `atrStopMult * ATR` stop distance.
- `modules/DonchianBreakout.js:103-117` attaches an `exitContractHint` with stop, take profit, trailing, max hold, and invalidation conditions.
- `config/trading.config.json:1365-1377` sets the static exit contract to stop `-2.5`, take profit `12`, trailing stop `1.5`, activation `1`, max hold `10080`, and `_validated: null`.

Result: Mercury's claim that the percent stop "shrinks with price" is false for the quoted formula. The geometry is trend-runner shaped, but `_validated: null` means this should remain a sweep/exit-fit question, not a clean bill of health.

## Rejected Or Unsupported Mercury Claims

- "Spike then reversal" is not an implementation break by itself; it is the inherent false-positive class of a raw Donchian breakout thesis.
- The stop-distance arithmetic defect was false; the formula produces an absolute ATR-multiple stop when applied as a percentage of entry price.
- The "votes can never clear minConfidence" claim used a hypothetical 0.90 threshold, not landed config.
- Claims that regime, fee model, or MTF layers silently contradict Donchian were not supported with enough file:line evidence in this G5 run.

## Trey Ruling Inputs

- Decide whether Donchian should keep the 0.55 confidence floor, lower it, or add an explicit per-strategy threshold.
- Decide whether Donchian should remain long-only or whether the short path should be enabled and tuned.
- Treat exit validation as a separate G4/exit-fit item, because this G5 pass did not prove the invalidation conditions are consumed by the live exit path.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-donchian-logic-attack-prompt.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-donchian-bridge-output.txt`
