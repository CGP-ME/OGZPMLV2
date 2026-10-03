# Candle-pattern threshold connections

The canonical confidence.candlePatternMinConfidence value is already in config/settings.json. This change adds only its existing fractional domain to EDITABLE_SETTINGS; it does not alter detector/filter code or its value.

Working-source trace checked 2026-10-03 (other agents may shift line numbers):
- run-empire-v2.js:1475 constructs TradingLoop.
- core/TradingLoop.js:41 constructs CandlePatternDetector; :1341 calls _gatherData.
- core/TradingLoop.js:2069 calls detect; :2075 reads the current ConfigLoader value; :2076 filters candle patterns; :2077 combines retained candle patterns with memory patterns.
- core/WebSocketManager.js:124-134 routes settings reads/saves and returns a settings_result receipt.
- foundation/ConfigLoader.js:3063-3066 applies the canonical path; :3115-3124 persists before publishing the replacement snapshot.

behavior.json proves isolated saves at 0, 0.5 and 1 alter the exact production filter expression over explicitly supplied fixture confidences. It does not prove broker execution, a complete market decision, or running-process activation.

No get_settings/save_settings/settings_result references were found in public JavaScript/HTML. Browser wiring is a separate existing Stop 1 gap; this change is not represented as a working dashboard control.

Initial review invocation failed before provider review because I supplied an absolute MERCURY_RUN_LEDGER_DIR where the existing harness requires a repo-relative path. The corrected invocation completed with no_break_found after coordination allowed unrelated reviews. No Mercury source change was needed. See REVIEW.md.
