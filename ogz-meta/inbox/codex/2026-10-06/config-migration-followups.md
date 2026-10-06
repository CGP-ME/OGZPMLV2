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
- **Status:** Candidate held and uncommitted under `max-position-limits/`; original setting and runtime behavior preserved. Author/reviewer claims are corrected by these exact-source findings.

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
- **What must be resolved:** Establish the real notional/quantity producer for timeframe viability before exposing fee-model switching or claiming complete fee hot-read wiring. Do not invent a dollar/share assumption or add another guard/fallback.
- **Status:** Entire prepared fee-model group is held and uncommitted. Candidate, isolated fixtures and exact caller trace remain under `fee-model-group/`; explicit feeContext in a fixture is not proof the runner supplies it. Continue other migration groups; resolve this in the deferred pass.

## 8. Total-round-trip fee metadata has a separate stored value

- **Severity:** Confirmed conflicting fee metadata ownership; no active fee calculation override established.
- **Evidence:** Committed settings store fees.totalRoundTrip .005. FeeModel calculates actual percent fees from maker/taker and per-share fees from quantity/notional. PolicyBuilder nevertheless copies totalRoundTrip into newly frozen policy metadata (`core/PolicyBuilder.js:53-62,547-557`), RuntimeConfigProof reports it, and ConfigLoader uses it in a tier warning/validation. No active frozenExitPolicy.fees or legacy FEES_ROUND_TRIP consumer was found in the bounded trace. Saving maker/taker through the held candidate leaves that stored metadata unchanged.
- **What must be resolved:** Determine whether this field is intended independent policy or obsolete duplicated fee metadata, then reconcile its producers/reports without introducing a calculated compatibility alias. Do not delete solely because the active calculation uses another field.
- **Status:** Preserved with the held fee group; exact-source trace is `fee-model-group/runtime-trace.md`. No fee value or runtime policy changed.

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

## 11. MA trend-gate and pattern-persistence intent

- **Severity:** Existing annotation-only/unwired settings; no newly established fatality.
- **Evidence:** At production tree eaefb0a8b075c3871874b3ef9dd003619e822706, modules/MADynamicSR.js rejects a flat slope unconditionally in update; conditionFlags.trendGate does not control that rejection. patternPersistBars is validated and copied in the constructor but has no behavioral consumer. The thirteen effective condition/approach controls are separate.
- **What must be resolved:** Establish the intended slope-switch and pattern-persistence behavior before wiring or removing these settings. Do not interpret lack of a consumer as proof the feature was unwanted.
- **Status:** Both canonical fields preserved and not exposed as effective customer controls. Scoring metadata reports the actual always-active slope condition; no new rejection added. Evidence: madynamicsr-condition-approach-flags/candidate.patch and root-proof.log.

## 12. OGZTPO adaptive mode has no behavioral consumer

- **Severity:** Existing intended-but-unwired flag; no newly established fatality.
- **Evidence:** In tree 2ef40fc5ce9a7fe9aa8bf333ab16e8e78c64c4da, core/OgzTpoIntegration.js normalizes strategies.OGZTPO.adaptive, but neither its update/vote/filter paths nor src/indicators/ogzTwoPoleOscillator.js consumes that flag.
- **What must be resolved:** Establish the intended adaptive algorithm before wiring or retiring the flag. Its presence alone is not proof an adaptive feature works.
- **Status:** Canonical value and validation preserved; it is not exposed as a working control. The separate 24-control migration does not claim to implement adaptive behavior.
