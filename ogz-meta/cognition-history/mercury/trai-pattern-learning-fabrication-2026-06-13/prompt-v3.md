Mercury, break my fix.

Attack the final patched closure for the fake trade-close metadata bug class.

Previous attack found these concrete issues:
- `core/StateManager.js` persisted missing full-close `exitReason` as `unknown`.
- `core/StateManager.js` persisted missing full-close `strategy` as `unknown`.
- `core/StateManager.js` could create fake hold time from `Date.now() - 0`.
- `core/StateManager.js` persisted missing partial-close reason as `partial`.
- `core/tradeLogger.js` persisted missing `type` as `unknown`.
- `core/TRAIDecisionModule.js` displayed missing trend as `unknown`.

Current patched ranges:
- `core/StateManager.js:96-110`: `firstNonEmptyString` and `holdTimeMsOrNull`.
- `core/StateManager.js:832-890`: full-close ledger outcome and closedTrades record.
- `core/StateManager.js:1005-1018`: partial-close decision-ledger exit entry.
- `core/tradeLogger.js:212-225`: persisted trade type normalization.
- `core/TRAIDecisionModule.js:832-838`: display trend string.
- `core/OrderExecutor.js:52-123`: finite/string/size helpers and TRAI indicator extraction.
- `core/OrderExecutor.js:1959-2075`, `2175-2388`, `2477-2828`: close/proof/logging/risk/PID/TRAI learning paths.
- `core/trai_core.js:761-830`, `core/UnifiedPatternMemory.js:322-370`, `core/PatternMemoryBank.js:444-575`: learning sinks.

Break it by finding a concrete state where missing exit reason, strategy, hold time, trade type, size, P&L, trend, volatility, MACD signal, or BB width still becomes a plausible fake persisted value or mutating learning/adaptive input in this patched closure.

Also attack zero-value handling. Find a concrete case where legitimate zero P&L, zero fees, zero confidence, or zero MACD histogram is blocked or changed to null.

For each issue, include exact file:line, input state, sink corrupted, and whether it is inside this patched closure or a separate sibling. If the only remaining fallback is display/count/report-only, classify it that way with file:line evidence.
