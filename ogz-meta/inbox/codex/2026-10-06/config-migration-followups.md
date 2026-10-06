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
