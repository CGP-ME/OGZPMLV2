# Codex-1 G5 Fable Rerun: PropSafeEMAPullback

Date: 2026-07-17
Mission: G5 rerun batch, post-Fable repair
Strategy: PropSafeEMAPullback
Runtime changes: none

## Index Contract

- Mercury index timestamp: 2026-07-17T01:58:04.507Z
- Indexed SHA: b06d474a6612b896911474980f873e033edefddc
- Active chunks: 10163
- Dirty tracked at index: false

## Run Ledger

- Accepted rerun line: ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:4
- Run id: 2026-07-17T02-07-00-545Z-62a148691d52
- Mercury termination: answer_given
- Mercury iterations: 14
- Fable review: ok, effective verdict needs_more_evidence
- Recheck: completed

## Verdict For Trey

incoherent, because the verdict-driving pullback-window defect is live in current code.

## Supported Finding

The strategy claims to evaluate a pullback window, but both signal branches pass a single-candle array into the pullback-distance helper.

Evidence:

- modules/PropSafeEMAPullback.js:232-249 defines `_pullbackDistance(candles, pullback, atr)` and slices `candles.slice(-this.cfg.pullbackLookbackBars)`.
- modules/PropSafeEMAPullback.js:256 calls `_pullbackDistance([latest], pullback, atr)` in the long path.
- Mercury recheck also found the same `[latest]` call at line 280 in the short path.
- config/trading.config.json:1954 sets `pullbackLookbackBars` to 4.

Result: the config key exists, but the runtime call site constrains the helper to one candle. That makes the pullback-window logic a surface-level config, not a real four-candle pullback search.

## Narrowed Claims

- Fable did not accept the first-pass answer as-is because it could have been echoing the degraded prior lead.
- Fable required verbatim `_pullbackDistance` call-site evidence.
- The recheck supplied that evidence, and local read confirms it.
- Direction criticism is secondary: local code shows slope checks at modules/PropSafeEMAPullback.js:253-255 before pullback distance. The strongest live defect is the broken lookback producer.

## Reliability

Usable two-tier evidence. Mercury first-pass had citation-quality warnings, but Fable forced the exact producer proof and the current file confirms it.
