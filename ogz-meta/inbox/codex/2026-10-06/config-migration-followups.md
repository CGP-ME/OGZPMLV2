# Configuration migration follow-ups

This is a bounded deferred list for the current configuration migration. It records evidence and unresolved ownership questions; it does not authorize new controls, gates, or deletions.

## 1. Confidence and confluence relationship

- **Severity:** Unresolved behavior/intent question; no confirmed fatal defect.
- **Evidence:** `core/StrategyOrchestrator.js:823-824` reads `confidence.regimeMinConfidence` and `confidence.confluenceMinScore`. The regime scoring path reads `regimeBoosts` at `core/StrategyOrchestrator.js:2639-2677`. Confluence is counted and combined with regime for sizing at `core/StrategyOrchestrator.js:2890-2897`; the current output reports the resulting sizing at `core/StrategyOrchestrator.js:3001-3028`.
- **User intent to preserve:** Strategy/archetype matching the current market regime should earn a confluence boost.
- **What must be resolved:** Trace the intended relationship between the preserved confidence thresholds, regime boost scoring, and confluence sizing. Confirm whether the existing `regimeBoosts` path already expresses the intended behavior and document the relationship before changing or retiring either control.
- **Status:** Open, unverified relationship. Preserve both controls pending trace; do not add a gate or delete either setting.

## 2. Stale live-guard test import

- **Severity:** Confirmed test-suite blocker for this existing test file; no production fatality established.
- **Evidence:** `test/config-loader-live-guard.test.js:103` requires `../config/trading.config.json`, and the repository has no `config/trading.config.json` (`test -f config/trading.config.json` returned exit code 1). The same test continues to assert that legacy file's defaults at `test/config-loader-live-guard.test.js:109-110`.
- **What must be resolved:** Reconcile this test with the current `config/settings.json` plus `config/internals.json` ownership and loader snapshot, or explicitly retire the stale assertions through the authorized migration workflow. The separate sizing load/save proof remains the bounded evidence for sizing behavior.
- **Status:** Confirmed stale import and likely test failure when this file executes; production impact is unverified. No fix is made here.

## 3. Existing partial strategy test configurations

- **Severity:** Confirmed baseline test failures; production impact is not established by these fixtures.
- **Evidence:** Before the NoWick confidence change, the focused NoWick scope and exit-geometry suites construct modules without required configuration. NoWick constructors lack required keys; orchestrator cases lack an MTF base timeframe; other exit-geometry cases provide incomplete LiquiditySweep/SmartMoney/FVG configuration. Captured details: `ogz-meta/inbox/codex/2026-10-06/nowick-confidence/baseline-test-limitations.md`.
- **What must be resolved:** Bring test producers into agreement with the actual required configuration, then rerun those cases. Do not restore production defaults merely to make old partial fixtures pass.
- **Status:** Deferred test-fixture work. Isolated migration proofs use complete explicit configurations; the existing suites are not claimed as passing.

## 4. Maximum-position control scope and domain

- **Severity:** Confirmed mismatch between a prepared UI label/domain claim and committed consumers; no new runtime defect introduced.
- **Evidence:** At commit `dab768d3`, `core/TradingLoop.js:1466-1467` reads trades for one symbol and `positionSizing.maxPositions`; its count check at `1619-1627` uses that symbol's trades. `git show dab768d3:foundation/ConfigLoader.js` contains no maxPositions validation. The proposed safe-integer/minimum-one domain was mistakenly attributed to committed code but came from unrelated dirty loader work. The proposed label, “Maximum open positions,” omitted the symbol scope. The prepared proof uses two controlled same-symbol trades, not a portfolio-wide limit or proof of reachable production concurrency.
- **What must be resolved:** Establish whether the intended customer setting limits symbol trades, account positions, or a different count; reconcile its domain and existing contract-level concurrency before exposing it. Do not introduce a global count or new guard as a migration shortcut.
- **Status:** Resolved 2026-10-08 by exposing the existing control with an explicit per-symbol label and positive safe-integer UI domain. No runtime enforcement change or account-wide limit was introduced. Exact-source actual save/caller replay passed; `ogz-meta/inbox/codex/2026-10-08/max-position-ui/` preserves the evidence. The older claim of pre-existing committed validation remains corrected.

## 5. Aggregate exposure exists only in unrelated dirty work

- **Severity:** Unfinished ownership/implementation question; no production fatality established.
- **Evidence:** `positionSizing.maxTotalExposure` is absent from committed settings/loader/executor at `dab768d3`. It appears in the shared uncommitted settings, loader validation and executor aggregate-exposure arithmetic. Those edits are not part of the delivered base/maximum position-size migration.
- **What must be resolved:** Identify the existing work's owner and approved intended exposure behavior before reviewing and delivering it. The uploaded UI field is not proof of a completed runtime setting.
- **Status:** Preserved untouched; no new aggregate-exposure policy, denominator or gate added.

## 6. NoWick extreme numeric geometry domain

- **Severity:** Existing accepted numeric-domain limitation; no confirmed fatal defect in this migration.
- **Evidence:** NoWick startup accepts finite non-negative stopBufferAtr and finite positive targetRR. The corresponding descriptors preserve those domains. In candidate `3853c39158fb3335cc5c453f7296c4655037f691`, `modules/NoWickImbalance.js:534-559` multiplies these values by ATR/risk; extreme finite inputs can overflow. Existing primary/fanout finite-geometry checks reject the resulting signal rather than emit a usable order.
- **What must be resolved:** Establish useful customer ranges or calculation-domain handling with actual market units before changing the existing domain. Do not invent arbitrary trading thresholds or add a runtime throw/fallback during migration.
- **Status:** Deferred. Normal saved-value BUY/SELL geometry is verified in `nowick-exit-geometry/final-exact-staged-proof.json`; extreme inputs and broker execution are not claimed as verified.

## 7. Adaptive timeframe per-share fee context

- **Severity:** Existing execution-path exception; held fee migration would make a model switch reach it in a retained selector. Production occurrence is not established by a live replay.
- **Evidence:** Committed `b99abbd0` runner constructs AdaptiveTimeframeSelector without feeContext at `run-empire-v2.js:773-778`, then evaluates it at `:1072-1076`. `_scoreTimeframe` calls roundTripFeePercent at `core/AdaptiveTimeframeSelector.js:168`; that method throws for per_share_minimum without quantity/notional context at `:256-265`. Current canonical fees already select per_share_minimum. The proposed live model reader would also expose this on a percent-to-per-share save. The active PnL calculateNetPnL caller supplies quantity/notional and is a separate path.
- **What must be resolved:** Establish the real notional/quantity producer for timeframe viability before claiming complete live-runner fee wiring. Do not invent a dollar/share assumption or add another guard/fallback.
- **Status:** The five fee controls and retained consumer reads are delivered in the 2026-10-08 fee-control change under Trey's instruction to defer pre-existing failures. This context defect remains open: canonical per-share fees already reached it before that change. Explicit feeContext in the passing fixture is not proof the runner supplies it. Updated exact-source evidence: `ogz-meta/inbox/codex/2026-10-08/fee-controls/`.

## 8. Total-round-trip fee metadata has a separate stored value

- **Severity:** Confirmed conflicting fee metadata ownership; no active fee calculation override established.
- **Evidence:** Committed settings store fees.totalRoundTrip .005. FeeModel calculates actual percent fees from maker/taker and per-share fees from quantity/notional. PolicyBuilder nevertheless copies totalRoundTrip into newly frozen policy metadata (`core/PolicyBuilder.js:53-62,547-557`), RuntimeConfigProof reports it, and ConfigLoader uses it in a tier warning/validation. No active frozenExitPolicy.fees or legacy FEES_ROUND_TRIP consumer was found in the bounded trace. Saving maker/taker through the held candidate leaves that stored metadata unchanged.
- **What must be resolved:** Determine whether this field is intended independent policy or obsolete duplicated fee metadata, then reconcile its producers/reports without introducing a calculated compatibility alias. Do not delete solely because the active calculation uses another field.
- **Status:** Metadata preserved unchanged when the five actual fee controls were delivered on 2026-10-08. Exact-source trace is `fee-model-group/runtime-trace.md`. Actual fee calculation changes with saved maker/taker or per-share values; independent totalRoundTrip metadata does not. No compatibility alias added.

## 9. Volume-profile bin-count resource domain

- **Severity:** Unresolved customer input domain for direct array allocation; no live failure claimed.
- **Evidence:** `core/VolumeProfile.js:218-219` allocates two arrays of canonical numBins and the following calculation loops over those bins for each candle. The native array-length maximum is not an operational memory/CPU budget. No existing producer establishes a useful resource limit.
- **What must be resolved:** Establish the intended supported profile resolution/resource budget before exposing numBins. Do not invent a cap or expose the entire native array range as a safe customer domain.
- **Status:** Canonical numBins and its calculation are preserved; six other profile controls migrate independently. No new numBins descriptor or runtime guard.

## 10. Existing volume-profile weighting can make volume negative

- **Severity:** Reproduced baseline calculation defect with controlled narrow candles; live occurrence not established.
- **Evidence:** At committed base `c7c11aa2ec9dcca926fce6e372d607009732a31a`, core/VolumeProfile.js computes weight as `1 + (1 - minDist / maxDist)`. A candle narrower than its price bin can put the bin midpoint far enough away to produce a negative weight. The preserved baseline counterexample produces 50 negative bins, minimum -53465.22999997043, from positive input volume: `volume-profile-mechanics/baseline-negative-volume.json`. The migration's initial proof revealed this; it is present before the provider change.
- **What must be resolved:** Correct the volume-distribution calculation using actual candle/bin overlap semantics in the later defect pass. Do not hide the defect with a new default or gate during settings migration.
- **Status:** Logged and preserved. The six-control migration proof separately uses positive-volume geometry and verifies save/persistence, profile cadence, thresholds and market-state reads. That proof does not claim the original calculation defect is fixed.

## 11. MA intent and MTF annotation-only inputs

- **Severity:** Existing annotation-only or unwired settings; no newly established fatality.
- **Evidence:** At committed `84441cb6`, `modules/MADynamicSR.js:357-371` rejects a flat slope unconditionally; `conditionFlags.trendGate` does not control that rejection. `patternPersistBars` is validated/copied at `:177-204` but has no behavioral read. Separately, `core/StrategyOrchestrator.js:1424-1462,1486-1495,1549-1557` reads five MTF fields only to attach `type: 'annotation'` decision contributors: `orchestrator.emaCrossoverMtf.hourlyTrendVetoMultiplier`, `fourHourMacdBoostMultiplier`, `freshLongTermCrossoverMinTrendStrength`, `orchestrator.maDynamicSRMtf.compressionBandwidthThreshold`, and `orchestrator.ogzTpoMtf.bandwidthThreshold`. The other ten MTF ranking controls were delivered separately; these five do not change ranking score.
- **What must be resolved:** Establish intended slope-switch/persistence behavior and whether the five MTF annotations should become customer-changing ranking policy. Do not label annotations as multipliers, infer a missing consumer as unwanted, or add a gate simply to surface them.
- **Status:** The MA fields and five MTF inputs remain canonical and unexposed as effective customer controls. The thirteen effective MA condition/approach controls and ten ranking MTF controls are separate delivered groups. No new rejection or MTF scoring behavior was added. Evidence: `madynamicsr-condition-approach-flags/` and `strategy-mtf-ranking-controls/deferred-annotation-intent.md`.

## 12. OGZTPO adaptive mode has no behavioral consumer

- **Severity:** Existing intended-but-unwired flag; no newly established fatality.
- **Evidence:** In tree 2ef40fc5ce9a7fe9aa8bf333ab16e8e78c64c4da, core/OgzTpoIntegration.js normalizes strategies.OGZTPO.adaptive, but neither its update/vote/filter paths nor src/indicators/ogzTwoPoleOscillator.js consumes that flag.
- **What must be resolved:** Establish the intended adaptive algorithm before wiring or retiring the flag. Its presence alone is not proof an adaptive feature works.
- **Status:** Canonical value and validation preserved; it is not exposed as a working control. The separate 24-control migration does not claim to implement adaptive behavior.

## 13. SmartMoney volume-profile bins need a resource domain

- **Evidence:** SmartMoneySweep allocates and loops over vpBins for its profile. No producer establishes a supported operational memory/CPU budget; the native array limit is not that budget.
- **Action:** Establish supported profile resolution before exposing vpBins. Preserve the current canonical value; no invented cap or runtime guard added.

## 14. SmartMoney hold and sweep-offset intent

- **Evidence:** maxHoldBars and sweepMaxOffset are validated/copied in SmartMoneySweep but have no effective downstream behavioral reads in the bounded source trace.
- **Action:** Determine intended hold/sweep-offset behavior in the deferred pass. Both fields and validation remain; neither is presented as an effective customer control.

## 15. RSI2 no-hint period seed versus canonical entry period

- **Severity:** Unresolved ownership of the legacy period seed; no new production change.
- **Evidence:** At committed `84441cb6`, `strategies.RSI2MeanReversion.rsiPeriod` is the entry evaluator's period (`modules/RSI2MeanReversion.js:95,111`) and emitted hints snapshot it (`:143,154`). The queued `rsi2-exit-contract-ownership/` packet intentionally keeps `exitContracts.RSI2MeanReversion.rsiPeriod` as the existing no-hint seed. `core/ExitContractManager.js:363` selects a default contract only when a trade lacks `exitContract`; invalidation then reads that contract's period at `:524-534`. The ordinary orchestrator creates each winner contract with its signal overrides at `core/StrategyOrchestrator.js:2990-3002`, so a new RSI2 signal carries the entry period. The bounded trace found no separate production `createExitContract('RSI2MeanReversion', {})` caller; the legacy/no-contract fallback remains real through `checkInvalidation`.
- **What must be resolved:** Decide whether a legacy trade without a frozen exit contract must retain its independent exit seed or should derive a period from a recorded entry source. A later customer edit to strategy `rsiPeriod` would affect new hints but not that no-hint seed. Do not remove the seed or claim all duplicate owners are defects without a legacy-trade producer/contract-history decision. Similar percent seeds in the committed PropSafe/EMA migrations are documented no-hint ECM behavior, not proof of a global duplication defect.
- **Status:** The RSI2 packet is uncommitted. Keep the duplicate seed visible in review and require an explicit canonical-trust decision before calling the queued exit migration single-owner complete.

## 16. NoWick review leads in unchanged code

Mercury run 2026-10-08T01-40-38-724Z-577e7b3aa622 flags multiplier/penalty validation (`core/StrategyOrchestrator.js:1365,1405`), generic strategy exception handling (`:2529`) and placeholder-URL parsing (`foundation/ConfigLoader.js:1324`). Root verified those blocks are unchanged between d913f924 and NoWick candidate 9d8b1452. No migration-caused failure was established; no new guard or behavior is authorized. These are unverified inherited leads for the deferred pass, not four proven production defects. Full review: `exit-owner-sequential-rebase/nowick/delivery-review-answer.txt`.

## 17. ORB review lead in unchanged MTF initialization

Mercury 2026-10-08T01-48-05-116Z-2520f243c947 conditionally alleges absent orchestrator.mtfConfluenceService or orchestrator.mtfAdapter would cause dereference errors at core/StrategyOrchestrator.js:944-951. Root verified the cited block is byte-identical between 5d5a6cfb and ORB candidate 87251661. No missing producer or ORB-migration-caused failure was established. Preserve as an unverified inherited lead for the deferred pass; do not add guards/defaults. Full answer: `exit-owner-sequential-rebase/orb/delivery-review-answer.txt`.

## 18. Settings UI review leads in unchanged browser code

Mercury 2026-10-08T01-50-34-561Z-3510be25b104 flags the existing send catch (`public/js/panels/configuration-settings.js:82-89`), custom-alerts ordering (`public/unified-dashboard-v2.html:1150-1160`) and CDN integrity metadata (`:39-43`). Root verified all three blocks are byte-identical between 4a6327b8 and UI candidate 86901962. No layout-caused failure is established. These are deferred inherited leads; script-order comments and missing catches/metadata alone do not prove the claimed runtime consequence. Preserve existing transport and do not add gates. Complete review: `settings-ui-rough-layout/delivery-review-answer.txt`.

## 19. Position-limit review leads in unchanged loader code

Mercury 2026-10-08T02-45-59-803Z-14b87c235787 flags credential role handling, dotenv selection, broker-mode construction and role-mismatch error returns at foundation/ConfigLoader.js:528-533,1105-1120,2494-2509. The sole production change is a four-line descriptor at :2940; all cited behavior predates it. Mercury explicitly says that descriptor is not a defect. Preserve these as unverified inherited leads, not confirmed credential or trading failures. Review: `ogz-meta/inbox/codex/2026-10-08/max-position-ui/delivery-review-answer.txt`.

## 20. Fee-control review leads in unchanged loader code

Mercury run 2026-10-08T02-53-27-041Z-ae51e117d9af alleges missing null-context and circular-reference guards at foundation/ConfigLoader.js:1027-1029,2151-2156. Both blocks are byte-identical between fef382ef and fee candidate 41dbeaec. No concrete invalid producer or migration-caused failure was supplied. Preserve as unverified inherited leads under Trey's scope instruction; do not add speculative guards. Review: `ogz-meta/inbox/codex/2026-10-08/fee-controls/delivery-review-answer.txt`.
