# Current configuration source gaps

This ledger is a bounded reconciliation of concrete unresolved or recently repaired consumers. It supplements the complete configuration inventory and ownership maps; construction, validation, or UI descriptor presence is not treated as proof that a trading control is active.

The current concrete dispositions are recorded in [current-source-gaps.jsonl](./current-source-gaps.jsonl):

- Two-pole negative extreme handling is fixed in `227b2922`; round-number trailing transport is fixed in `450895b5`; the explicit proof-publication broker owner is fixed in `d17aee91`. These are recorded as repairs, not open gaps.
- `exitContracts.*.profitManagement.beScaleOut.feeBufferPercent` is retired in `44901df4`: 17 archived canonical values, 16 removed UI descriptors, and no invented scale-out threshold. The researched design does not specify this field. The distinct trail fee buffer remains.
- `confidence.confluenceMinScore`, `confidence.regimeMinConfidence`, and `indicators.optimized.twoPole.confidenceBase` are archived and removed in `cbf7200c` under the user's explicit ruling. Actual zone scores and focused confidence selection are unchanged.
- Role-source correction `89affa44` fixes 18 nonexistent canonical source labels and other projection bookkeeping. Resolved values are unchanged; affected fingerprints intentionally change because source metadata is included.
- `featureCatalog.PATTERN_EXIT_MODEL` is constructed in shadow mode and tracked by the executor, but its evaluator has no active production caller. Eight configured settings lack model readers, and reversal names are hardcoded. This is deferred pattern-feature work.
- `tierPolicy` is loaded and exposed through `FeatureFlagManager` helpers, but the Oct. 11 caller trace found no active trading-path enforcement. This does not authorize adding gates or restrictions.
- `timeframeConfig` and `exitContracts.*.timeframes.*` remain fallback/override paths. Current built-in strategies own explicit exit contracts and canonical contracts contain no timeframe trees, so these are not active built-in controls.
- `fundTarget` reaches an uncalled legacy module factory and an uncalled Houston progress default. It has no entry, risk, or exit consumer.
- `scaleIn.addSizingLadder` is present only in disabled policies, cloned by `ExitContractManager`, and never read by `OrderExecutor`; it remains disabled/inert pending an explicit sizing design.

PID adjustment outputs and the legacy pattern bank remain separately deferred by explicit user instruction. They are not silently promoted into this repair ledger. No production changes or new gates are authorized by this document.

- Low/high volatility target multipliers are now strategy-owned and consumed (6f52bb08). The phantom performance interval was retired with its misleading log (9545c26a). TRAI blend controls are canonical and consumed (097ef8c3). These are committed source deliveries, not runtime activation.
- `partialExit.remainderTrail` is validated and emitted in intent evidence but has no confirmed execution consumer. All 17 canonical partial-exit policies are disabled and the field is noneditable. No new remainder-trail behavior was invented.

The retained inactive families and their exact ruling boundaries are in [remaining-dispositions.md](remaining-dispositions.md). Their preservation does not label them as working features. Final executable source identity is `a2d0872896881f7c0b54242dc4d4c0581ef9b8e1`; runtime activation remains held.
