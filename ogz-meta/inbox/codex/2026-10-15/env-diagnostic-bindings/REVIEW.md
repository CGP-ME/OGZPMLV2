# Diagnostic configuration reader reconciliation

Date: 2026-10-15 UTC. Source: scoped working-tree diff on codex/archive-legacy-env; candidate.json records the reviewed Git tree.

Terra independently reviewed the canonical reader/constructor changes and found that null take-profit and hold settings were coerced to zero. The reader now honors each strategy's off modes; both canonical DonchianBreakout and TimeSeriesMomentum contracts are exercised by the probe. Actual constructor-only smoke passed without processing candles.

Mercury initially alleged a nullable entry contract. The caller accepts only buy/sell results; StrategyOrchestrator.js:3039 constructs its exitContract before returning its output at 3149, and ExitContractManager.js:1076 returns the normalized object. A hold output is not passed to executeEntry. No fallback contract or guard was added.

The final broad Mercury answer reports no_break_found but its ledger records no_claim and leaves an absent-config allegation supported. This is not represented as a clean review; the focused Mercury pass also did not inspect ConfigLoader and returned cannot_verify (2026-10-15T05-11-05-164Z-7cde22b03902). Independent Astra then traced the actual producers and found no reachable defect in the changed readers; see REVIEW-ASTRA.md. Delivery uses Trey's explicit Astra-go ruling for unresolved Mercury evidence, not an invented clean Mercury result. Numeric canonical bindings passed actual ConfigLoader probes; candle input requires the existing run descriptor. Without that invocation input the diagnostic is not a valid run.

The isolated probes do not execute the legacy simulator or certify its full exit simulation, strategy profitability, runtime deployment, or Stop 1 completion. Backtesting remains outside this task. No service reload occurred.
