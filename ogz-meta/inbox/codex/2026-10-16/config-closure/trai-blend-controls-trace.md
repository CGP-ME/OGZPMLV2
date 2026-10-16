# TRAI blend-confidence control trace

Pinned source: committed `HEAD=097ef8c3ff3fa2af3c7c90795e215d094003f206`. The blend-owner migration is delivered in that commit; this document records the bounded source trace and does not claim runtime activation.

## Current transport and behavior

`run-empire-v2.js:803-809` passes the canonical `settings.json:trai` values into `TRAIDecisionModule`: `weight` becomes `confidenceWeight`, while `mode`, `maxRisk`, `emergencyStopLoss`, `minConf`, `maxConf`, `legacyPatternMinSamples`, and `trackDecisions` are passed as their corresponding constructor fields. `TRAIDecisionModule` stores that object at `core/TRAIDecisionModule.js:38-44`.

The exact `blendConfidences` method is `core/TRAIDecisionModule.js:648-685` in committed `097ef8c3`:

- `passive` returns `originalConfidence` unchanged.
- `advisory` reads `trai.advisoryUnknownPatternThreshold` and `trai.advisoryUnknownPatternPenaltyMultiplier` through ConfigLoader for the low-confidence branch. Otherwise it adds `traiConfidence * this.config.confidenceWeight` and clamps to `1.0`.
- `hybrid` uses the configured `confidenceWeight` and clamps the additive result to `1.0`.
- `autonomous` reads `trai.autonomousTraiWeight` and uses its existing complement for original confidence, ignoring `confidenceWeight`.
- Unknown modes return `originalConfidence`.

The `1.0` values are confidence-domain clamps and the `passive`/unknown-mode behavior is mode control flow. They are not proposed as new settings. The actual candidate knobs are the advisory threshold `0.1`, advisory penalty multiplier `0.9`, and autonomous weights `0.7/0.3`.

## Existing ownership and historical inventory

Committed `config/settings.json:3823-3825` owns all three values, and `foundation/ConfigLoader.js:2766-2770` registers their `next_trai_confidence_blend` descriptors. `trai.weight` remains the separate advisory/hybrid additive contribution control.

The older Fable Stop 1 inventory is historical context only; its constructor `confidenceWeight: 0.3` discrepancy is not current HEAD. Current runner transport supplies `trai.weight`, and the committed settings/descriptors now explicitly own the three blend literals. The historical list did not establish ownership; the current committed source and isolated migration proof do.

## Smallest behavior-preserving ownership proposal

Add three independent canonical `trai` fields to the existing settings/descriptors/save path, with their current literal values:

- `trai.advisoryUnknownPatternThreshold = 0.1` — confidence fraction, inclusive range `[0,1]`; used only by the advisory low-confidence branch.
- `trai.advisoryUnknownPatternPenaltyMultiplier = 0.9` — multiplier, inclusive range `[0,1]`; used only for that advisory penalty branch.
- `trai.autonomousTraiWeight = 0.7` — confidence fraction, inclusive range `[0,1]`; autonomous original-confidence weight is the existing complement `1 - autonomousTraiWeight`, preserving the current `0.7 + 0.3` semantics without creating a second independently drifting owner.

That migration is committed in `097ef8c3`. It replaces only the advisory literals and autonomous `0.7/0.3` expression with these existing-config reads/complement. It leaves `trai.weight` as the existing advisory/hybrid additive contribution and does not alias the autonomous setting to it. Existing mode selection, confidence clamping, risk assessment, opinion-only authority, and execution ownership remain unchanged.

The three descriptors intentionally use `next_trai_confidence_blend`; the committed source proof covers the saved values and actual blend branches. This trace does not claim runtime activation.
