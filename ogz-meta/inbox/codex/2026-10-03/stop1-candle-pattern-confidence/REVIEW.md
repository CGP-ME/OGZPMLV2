# Candle-pattern setting API connection

Reviewed candidate: 23e521bee0b95eea2222b615f81927b960ff734b. Review base commit: e9faed6357b999774e3bfaae85ac43eff18c9262. Pinned harness: a5ecf975923c1c024ee98adf849016181dd6e482.

Run: 2026-10-03T01-11-39-689Z-5cbc8371faa9. Termination: answer_given. Raw private-review-result.json SHA-256: 3b9d3aeb345774750078cd6b584b0170ea002a26ed5a992174dc270391a0d677.

Behavior: behavior.json and invalid-reload.json. The exact staged ConfigLoader blob still matches the reviewed candidate after independent TradingLoop commit 925415e7; that commit removes obsolete exit-balance inputs and leaves the pattern filter unchanged.

Scope: expose one existing setting through the existing API. No new runtime guard, throw, default, filter, or config value. Existing settings validation applies. No dashboard UI, full strategy decision, broker execution, or runtime activation proven. Mercury performed static review; its full-file/exhaustive wording is not adopted as proof of such coverage.

## Mercury answer (trailing whitespace normalized)

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 5 of 5
- foundation/ConfigLoader.js – declaration of `confidence.candlePatternMinConfidence` in `EDITABLE_SETTINGS`, `getSettingsView` exposure, `saveSettings` persistence logic.
- config/settings.json – default value `0.7` for `confidence.candlePatternMinConfidence`.
- core/TradingLoop.js – consumer of the setting via `ConfigLoader.get('confidence.candlePatternMinConfidence')`.
- core/WebSocketManager.js – settings API endpoint that returns `ConfigLoader.getSettingsView()` and invokes `ConfigLoader.saveSettings`.
- captured diff receipt – shows no structural change to the setting’s handling between the baseline and current commit.

AST EVIDENCE:
- `foundation/ConfigLoader.js` lines 2621‑2625 declare the setting as an editable field with effect `next_pattern_evaluation`【open_file†L2621-L2625】.
- `foundation/ConfigLoader.js` lines 2961‑2972 expose all editable fields, including the new setting, via `getSettingsView`【open_file†L2961-L2972】.
- `foundation/ConfigLoader.js` lines 3070‑3073 persist changes and update the in‑memory snapshot after a successful `saveSettings` call【open_file†L3070-L3073】.
- `core/TradingLoop.js` line 2083 reads the setting at each loop iteration【open_file†L2083-L2084】.
- `core/WebSocketManager.js` line 107 returns the full settings view to the client【open_file†L107-L108】.

INHERITED:
- foundation/ConfigLoader.js – present, fully read, no missing sections.
- config/settings.json – present, default value confirmed.
- core/TradingLoop.js – present, consumer verified.
- core/WebSocketManager.js – present, API exposure verified.

FOURTH SHAPE CLASSIFIER: classified 3 of 3
- `saveSettings` guard for hot‑editable validation (line 2988) – gate.
- `saveSettings` type/value validation for each entry (lines 2990‑2995) – guard.
- `saveSettings` revision & hash consistency checks (lines 3004‑3008) – guard.

ALLEGATIONS:
- MECHANICAL: the setting is correctly declared, exposed, persisted, and consumed.
- SUBSTANTIVE: none – no functional regression or missing exposure detected.

SUBSTANTIVE RESOLUTION: none

WHAT I DID: examined the declaration in `EDITABLE_SETTINGS`, the exposure via `getSettingsView`, persistence in `saveSettings`, default value in `config/settings.json`, consumer usage in `core/TradingLoop.js`, and the settings API endpoint in `core/WebSocketManager.js`. Verified all paths with open_file and search tools.

WHAT I DID NOT DO: invoke any AST‑level caller analysis beyond the explicit `ConfigLoader.get` usage, as the search results already provided concrete references.

WHAT I ASSUMED: the repository state reflects the current commit `23e521bee0b95eea2222b615f81927b960ff734b`.

WHY THIS VERDICT: the setting `confidence.candlePatternMinConfidence` is present in `EDITABLE_SETTINGS`, included in the settings view returned by the API, persisted correctly, and actively used by the trading loop. No missing exposure or regression was found.

IF INCOMPLETE, WHY: not incomplete – all relevant code paths have been examined and verified.
