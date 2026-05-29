Re-attack the revised uncommitted dashboard producer-contract patch after the first Mercury finding.

First attack finding:
- Adding `symbol` fields at the producers was insufficient because `_sendDashboardFrame` did not enforce the scoped frame contract.
- `_broadcastDecision`, `_broadcastAndReturn`, and `_broadcastGateEvent` could still send malformed frames if a caller provided missing symbol/scope.

Revised code to attack:
- `core/TradingLoop.js:38-44`
  - `SCOPED_DASHBOARD_FRAME_TYPES` includes `signal_analysis`, `bot_thinking`, `golden_setup_state`, and `gate_event`.
- `core/TradingLoop.js:131-152`
  - `_missingDashboardScopeFields(frame)` requires `symbol`, `brokerId`, `accountId`, `assetClass`, `executionMode`, and `timeframe`.
  - `_sendDashboardFrame(frame)` refuses scoped frame types with missing required fields before websocket send.
- `core/TradingLoop.js:627-645`, `core/TradingLoop.js:955-956`, `core/TradingLoop.js:1241`
  - all current `_broadcastDecision`, `_broadcastAndReturn`, and pattern-analysis calls pass `symbol`.
- `core/TradingLoop.js:1347-1435`
  - decision frames spread `_dashboardScope(symbol)` onto `signal_analysis`, `bot_thinking`, and `golden_setup_state`.
- `run-empire-v2.js:2606-2678`
  - pattern analysis requires normalized symbol plus complete scope before sending.
- `core/TRAIDecisionModule.js:298-342`
  - direct TRAI `bot_thinking` requires complete scope before sending.

Attack question:
Find any remaining real input sequence where `signal_analysis`, `bot_thinking`, `golden_setup_state`, `gate_event`, or `pattern_analysis` can still reach the dashboard websocket without a truthful top-level symbol and complete scope, or where this revised guard blocks a legitimate frame because a real producer does not have the required fields. Also check whether this changes trade execution/P0 behavior, introduces a stale-scope leak, uses a default/fallback instead of real config/runtime scope, or leaves another active producer path for these same frame types outside the guarded send surfaces.

Do not validate generally. Break the patch with exact current file:line evidence.
