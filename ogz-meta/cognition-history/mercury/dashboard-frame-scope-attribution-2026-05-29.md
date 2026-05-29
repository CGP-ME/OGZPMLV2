Attack the current uncommitted dashboard producer-contract patch.

Goal of the patch:
- Stop dashboard analysis/thinking/pattern/setup frames from entering the websocket pipe without a real symbol/scope.
- Preserve existing price/delta/historical/trade behavior, which already carries symbol in current code.
- Do not invent frontend fallbacks or default symbols.

Changed files and line ranges:
- `core/TradingLoop.js:607-626`
  - direction-filter HOLD returns now pass `symbol` into `_broadcastAndReturn`.
- `core/TradingLoop.js:935-936`
  - normal decision broadcast now passes `symbol` into `_broadcastDecision`.
- `core/TradingLoop.js:1222`
  - pattern analysis call now passes `symbol`.
- `core/TradingLoop.js:1328-1412`
  - `_broadcastAndReturn` and `_broadcastDecision` now require `symbol`.
  - `signal_analysis`, `bot_thinking`, and `golden_setup_state` frames include `_dashboardScope(symbol)`.
  - `bot_thinking.data` also includes the same scope.
- `run-empire-v2.js:2606-2678`
  - `broadcastPatternAnalysis(patterns, indicators, symbol)` now requires a normalized symbol.
  - unscoped pattern broadcasts throw into the local catch and are not sent.
  - scoped pattern frames include top-level `symbol` plus runtime envelope fields.
- `core/TRAIDecisionModule.js:298-340`
  - TRAI `bot_thinking` frames build scope from the decision context.
  - if `context.symbol` is missing, the frame is not sent.

Attack question:
Find any real input sequence or current code path where this patch still lets a dashboard frame of type `signal_analysis`, `bot_thinking`, `golden_setup_state`, or `pattern_analysis` reach the websocket without a truthful `symbol`, or with stale broker/account/asset/timeframe scope from a previous symbol/session. Also find any path where the patch breaks a legitimate dashboard frame, changes trade execution, changes backtest/P0 behavior, masks an upstream missing-symbol bug with a default, or only fixes the symptom instead of the producer-contract mechanism.

Do not validate generally. Break the patch. Use exact file:line evidence from the current repo. If a claim depends on an uncalled/dormant file, say it is dormant. If a claim depends on `run-empire-v2.js` top-level bootstrap, account for the singleton lock side effect when requiring that file.
