# Volatility target owner migration

Baseline: `8d0e3d3e937eebbc860b02f14a38dd8e648bd72e`. Reviewed production tree: `6deafa7ea6b50d6e85d4fd92251fd81970e492e5`. `source-manifest.json` pins every production dependency; `change.patch` is the exact scoped delta.

PolicyBuilder previously fixed low/high volatility target factors at 0.8/1.4 (lines 280/290). Both now read each strategy's canonical `profitManagement.volatilityAdjustment.lowTargetMultiplier` / `highTargetMultiplier`. All 17 owners preserve those exact initial values. Settings revision advances 11→12. The 16 strategy owners expose 32 positive numeric fields for new trade policies. Neutral and disabled factors remain 1. No new throws, trading gates, fallbacks or alias owners were added.

## Verification

`python3 .../volatility-target-owner/reproduce.py` reconstructs exact Git blobs and runs baseline and candidate through `scripts/test-isolated.py`. The fixture uses the actual loader, actual AST-extracted ECM contract builder, and actual PolicyBuilder. It verifies all 17 original owners, changed save/persistence/reload for all 16 editable owners, first-tier target amounts under distinct low/high saved factors, neutral/disabled factors, and retained pre-save frozen policies. Baseline rejects the new editable fields; candidate accepts them. `verification.txt` records both passing runs. This proves policy target construction, not a live broker exit.

## Review and correction

Initial candidate `647d7a43022db6a3ae440c0380c4a3218815d2d3` also extended run-descriptor override admission. Astra found that this new admission accepted negative multipliers. The final candidate removes that extension completely: the preexisting run-descriptor surface is unchanged, consistent with the user's deferred backtesting scope. Backtest canonical snapshots still receive the canonical values; run descriptors cannot override these newly added fields.

Mercury's initial two allegations and Astra's disposition are preserved in separate review records. Manual generic profile overrides retain their existing validation limits; this migration does not claim a broader override-validator redesign. Runtime activation remains held; no PM2 operation occurred.
