# Percent-trailing candidate review

Candidate `52cf8f1d754db968b54b320313a5e2c8c8a6a4d7` was compared read-only with base `098aa50a`.

## Verdict

No reachable regression was established from the changed percent-trail activation or distance path.

`checkExitConditions()` computes `pnlPercent` in percent form before the managed-stop update (`core/ExitContractManager.js:341-343,421`). The candidate reads `trailingActivation` only for a percent contract (`:749-753`) and converts its percent-form `trailingStopPercent` to a decimal distance (`:768-770`). Long and short stop ratcheting remain direction-correct (`:825-830`). Channel contracts return before this code (`:738-740`); ATR contracts retain the candidate's explicit ATR/multiplier prerequisite (`:760-765`).

## Null-field adjudication

The candidate configuration has numeric percent trail activation and distance for every configured `trailType: "percent"` contract except `NoWickImbalance`, whose two values are intentionally both `null`. It reaches the existing `minActivation === null` refusal at `core/ExitContractManager.js:752-753`; it does not compute a zero-distance stop. Donchian and TimeSeriesMomentum declare null percent fields with non-percent trail modes.

Internal signal producers were inspected: percent producers write paired numeric values (PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, OpeningRangeBreakout, and the ATR contract builder); Donchian and TimeSeriesMomentum produce paired null values with channel/ATR modes. The editable configured percent fields are number descriptors, including explicit producer descriptors for ORB and RSI2. No internal producer was found that yields `trailType: "percent"`, a numeric activation, and a null/undefined percent distance.

## StopLossChecker allegation

`core/exit/StopLossChecker.js:47-63` contains the pre-existing `effectiveStop.toFixed` path, but it runs before the candidate's managed-stop update (`core/ExitContractManager.js:366-368` before `:421`). The candidate neither changes that file nor creates a new route into it. No candidate-introduced reachability was established.

The candidate still applies the existing frozen `profitManagement.trail` enablement and refinement fields after selecting the contract percent base distance. That is an existing managed-stop policy boundary, not a concrete break introduced by this one-file diff.
