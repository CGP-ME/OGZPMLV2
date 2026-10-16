# Astra obsolete-confidence retirement adjudication

**GO** for exact candidate `5850803d2a76bae76d11c2ed65de14178d4b9bdf` against `89affa44bda62f93158c1a125429adec6d34073b`. This covers the three explicitly authorized obsolete-control removals only. No introduced defect was established. Read-only source/evidence review; no tests, trading imports, production edits, or runtime operations performed.

The diff removes `confidence.regimeMinConfidence`, `confidence.confluenceMinScore`, and `indicators.optimized.twoPole.confidenceBase`, increments settings revision 13→14, removes the two unused Orchestrator assignments, and removes TwoPole's overwritten initialization/property. It changes no MTF methods or Loader code. The two Orchestrator instance properties had assignments only (base `core/StrategyOrchestrator.js:823-824`), while the actual threshold remains `confidence.minStrategyConfidence` (candidate `:935-936`). Other strategies' `confidenceBase` fields remain intact.

TwoPole's candidate `core/TwoPoleOscillator.js:253-262` assigns confidence on every branch, including the final else, before delta/filter arithmetic (`:264-282`). Consequently the deleted initial value never determined the returned score. The real source fixture's seven zone assertions match baseline/candidate outputs `[85,85,65,65,50,50,35]`; the candidate obsolete property is absent. All six executable fixture blobs match their exact manifest/base/candidate blobs.

Mercury's **found_break**, blocking verdict is preserved. Its four substantive allegations do not demonstrate a break introduced by this removal:

- **Missing MTF configuration:** false against the actual producer. Loader constructs `orchestrator.mtfConfluenceBooster` and `orchestrator.strategyMtfConfluence` from selected launch-profile confluence objects (`foundation/ConfigLoader.js:1116-1124`), rather than requiring same-named top-level JSON leaves. All seven canonical launch profiles contain both objects. The cited consumers (`StrategyOrchestrator.js:1287-1295`) are unchanged by this diff; none of the three removed keys supplies them.
- **Disabled RSI regime filter allows evaluation:** candidate `StrategyOrchestrator.js:1118-1121` returns `allowed:true, enabled:false` when the filter is disabled. This is unchanged disabled-filter behavior, not evidence of an introduced missing price/MA check.
- **Latest-candle timeframe condition inverted:** false. Candidate `:1224-1239` returns without an absence record when a nonempty timeframe exists, and records `mtf_missing_candle_timeframe` otherwise. The method is unchanged by the retirement.
- **TwoPole default loss:** Mercury itself acknowledges no scoring impact; the exhaustive assignment chain above establishes why the removed initializer is dead.

The supplied native Orchestrator fixture runs its actual `evaluate` method and observes identical winner confidence/minimum threshold. Collaborators and some instance methods are stubbed, the constructor is bypassed, and the output includes `HOLD` plus a NaN sizing diagnostic in both variants. This is focused confidence-selection evidence, not full constructor, sizing, execution, or MTF acceptance. The missing-MTF allegation is resolved by the real Loader/profile producer trace, not by those stubs.

No new guard, fallback, threshold, or unrelated MTF repair is warranted by this Mercury answer. No runtime activation or whole-configuration closure is claimed.
