# Final consumer-scope evidence review

Read-only, bounded review of `../consumer-field-trace.md` and `../remaining-family-consumers.md`. Both documents explicitly pin `8d0e3d3e937eebbc860b02f14a38dd8e648bd72e`; they are historical source traces, not current-runtime acceptance receipts. The separate current manifest pins `9545c26ae3dd3eba46b705ea025c377f1c5727a3`. No tests, native imports, production edits, or runtime operations performed.

**Documentation correction required:** `remaining-family-consumers.md:43` overstates the effect of `trai.weight`: it says advisory/hybrid/autonomous, but `core/TRAIDecisionModule.js:678-680` hardcodes autonomous blending as `traiConfidence * 0.7 + originalConfidence * 0.3`. Configured weight affects the ordinary advisory branch (`:669`) and hybrid (`:675`); the advisory caution branch (`:662-663`) also bypasses it. These source locations are unchanged between the two pinned refs.

The existing configuration inventory/disposition search found `TRAI_WEIGHT` mappings to the configured blend reader, but no explicit static/deferred disposition for three independent controls embedded in those branches:

- Advisory caution threshold: `0.1`, `core/TRAIDecisionModule.js:662`.
- Advisory caution multiplier: `0.9`, `:663`.
- Autonomous TRAI share: `0.7`, with existing original-confidence share `0.3`, `:680`.

Record these as missing configuration-owner decisions or a subsequent bounded migration; existing `trai.weight` ownership does not close them. This review neither changes their values nor authorizes a different blending algorithm. The mapping search was confined to this config-closure packet and does not assert that no historical discussion exists elsewhere.

**Small effect-label correction:** `remaining-family-consumers.md:39` calls `TradingLoop.js:1978-1980` outcome persistence. The surrounding `:1982-1984` branch enables `recordObservation`; describe this as pattern observation recording. Actual outcome recording has separate callers. The cited learning flag is consumed, so this is not a claim that learning is unwired.

The inspected exit trace appropriately distinguishes active calculations from carried metadata and disabled controls. Its canonical facts are supported: all 17 partial-exit policies and scale-in policies are disabled; no contract timeframe override trees exist; the two `tpAtrMultiple` entries belong to Donchian and TimeSeriesMomentum. Percent TP reaches `ProfitExitPlanner.js:155-174,327-330`; percent trailing reaches `ExitContractManager.js:748-772`; volatility lookback reaches entry policy construction. `beScaleOut.feeBufferPercent`, remainder-trail execution, and scale-in sizing ladders are not falsely declared active. Channel behavior has an actual calculation at `ExitContractManager.js:574-601`, beyond the transport-only citation in the table.

The remaining-family trace also correctly limits TRAI risk fields to diagnostic assessment (`TRAIDecisionModule.js:731-749`) rather than execution authority, and preserves the two confidence assignments and legacy bank subtree as unresolved. Session-route consumers are conditional on selected mode; these source mappings do not prove scheduled routing is activated. At the historical ref, `PerformanceAnalyzer.js:83` only logged `updateIntervalMs`; the later retirement at the current ref must be described through its separate receipt, not by treating the old trace as current source.

No whole-bot closure claim appears in the reviewed documents. Their source mappings cannot establish arbitrary-input correctness, every downstream behavior, runtime activation, or completion of pending intent/PID/legacy-bank work. The running all-editable proof was not examined or inferred complete. After the two wording corrections and explicit accounting for the three hardcoded controls above, no further unsupported active-consumer claim was established by this bounded review.

## Resolution recorded by root

The documentation now limits trai.weight to advisory/hybrid blending and distinguishes observation recording from outcome persistence. The three hardcoded blend controls identified here were migrated and behavior-checked in `097ef8c3`; the native receipt preserves its exact scope. The earlier review remains historical evidence, not a fresh review of later commits.
