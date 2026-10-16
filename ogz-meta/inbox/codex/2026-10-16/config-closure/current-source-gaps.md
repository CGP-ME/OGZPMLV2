# Current configuration source gaps

This ledger is a bounded reconciliation of concrete unresolved or recently repaired consumers. It supplements the complete configuration inventory and ownership maps; construction, validation, or UI descriptor presence is not treated as proof that a trading control is active.

The current concrete dispositions are recorded in [current-source-gaps.jsonl](./current-source-gaps.jsonl):

- Two-pole negative extreme handling is fixed in `227b2922`; round-number trailing transport is fixed in `450895b5`; the explicit proof-publication broker owner is fixed in `d17aee91`. These are recorded as repairs, not open gaps.
- `exitContracts.*.beScaleOut.feeBufferPercent` is exposed for sixteen contracts and carried into frozen policy, but does not affect a planner decision. Its intended use/removal from the panel is awaiting the user’s requested ruling; no threshold has been invented.
- `confidence.confluenceMinScore` and `confidence.regimeMinConfidence` are assigned in `StrategyOrchestrator.js:823-824` and never read afterward. They remain preserved noneditable settings pending intended semantics.
- `indicators.optimized.twoPole.confidenceBase` is initialized at `core/TwoPoleOscillator.js:251` but every confidence-zone branch at `:254-263` overwrites it. It remains pending explicit user ruling.
- `featureCatalog.PATTERN_EXIT_MODEL` is constructed in shadow mode and tracked by the executor, but its evaluator has no active production caller. Eight configured settings lack model readers, and reversal names are hardcoded. This is deferred pattern-feature work.
- `tierPolicy` is loaded and exposed through `FeatureFlagManager` helpers, but the Oct. 11 caller trace found no active trading-path enforcement. This does not authorize adding gates or restrictions.
- `timeframeConfig` and `exitContracts.*.timeframes.*` remain fallback/override paths. Current built-in strategies own explicit exit contracts and canonical contracts contain no timeframe trees, so these are not active built-in controls.
- `fundTarget` reaches an uncalled legacy module factory and an uncalled Houston progress default. It has no entry, risk, or exit consumer.
- `scaleIn.addSizingLadder` is present only in disabled policies, cloned by `ExitContractManager`, and never read by `OrderExecutor`; it remains disabled/inert pending an explicit sizing design.

PID adjustment outputs and the legacy pattern bank remain separately deferred by explicit user instruction. They are not silently promoted into this repair ledger. No production changes or new gates are authorized by this document.
