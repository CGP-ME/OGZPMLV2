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
