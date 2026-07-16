# Codex-1 G5 Logic Attack: RSI2MeanReversion

Date: 2026-07-16
Mission: G5 wake-five roster attack
Strategy: RSI2MeanReversion
Indexed SHA: 719f7bd8e7dbfb89775bea314f91fdf614d1f0e8
Index timestamp: 2026-07-16T20:17:32.367Z
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-16.jsonl:13
Mercury run id: 2026-07-16T20-38-41-142Z-f50aa08b0932

## Verdict

Mercury verdict: incoherent.

Review status: degraded. The bridge attempted `--adversarial-review`, but the Fable tier failed during review execution. Treat this as Mercury-only evidence until Fable review is rerun.

## Mercury Findings

| Link | Finding | Evidence cited by Mercury |
| --- | --- | --- |
| Thesis to trigger | The module gates long entry on `price > trendSMA && rsi < rsiEntry`, so Mercury argued an oversold RSI below the SMA is missed while an oversold RSI above the SMA can fire. | `modules/RSI2MeanReversion.js:113-115`, `config/trading.config.json:2003` |
| Trigger to direction | Long direction can fire in a falling-SMA context if price temporarily sits above the SMA and RSI is deeply oversold; Mercury said no SMA slope check exists. | `modules/RSI2MeanReversion.js:115-116` |
| Confidence math | With `confidenceBase=0.5`, `confidenceDepthMultiplier=0.4`, a shallow RSI trigger at RSI 9 yields `0.5 + 0.1 * 0.4 = 0.54`, below contract `minConfidence=0.62`. | `modules/RSI2MeanReversion.js:126-130`, `config/trading.config.json:1497`, `config/trading.config.json:2013-2015` |
| Exit fit | Mercury claimed the module only hints `rsiExitLong=80`, while actual close logic depends on platform exit-contract handling rather than module-owned RSI exit. | `modules/RSI2MeanReversion.js:147-155`, `config/trading.config.json:1500` |
| Platform interaction | Short branch exists but `allowShorts=false`; Mercury also flagged possible trend-regime interaction mismatch. | `modules/RSI2MeanReversion.js:118-121`, `config/trading.config.json:2007` |

## Reliability Notes

- Mercury tool status: success, 15 tool calls, 0 failures.
- No run checks.
- Fable tier failed and did not challenge or ratify Mercury.
- Some platform-line citations in Mercury output should be manually verified before coding because they reference orchestrator gates outside the module.

## Next Use

This is a strategy-logic indictment, not an implementation order. It should be reconciled against Trey's RSI2 seed doctrine and actual exit-contract invalidation wiring before changes.
