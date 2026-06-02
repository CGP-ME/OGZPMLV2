Mercury attack: state_update runtime scope projection

Target repo: /opt/ogzprime/OGZPMLV2
Branch: codex/multi-runtime-scope-build

Context:
The dashboard needs `state_update` heartbeats to prove which runtime scope a flat account belongs to. A previous live TSLA/Alpaca paper capture showed state_update frames with only balance/tradeCount and no symbol/broker/asset/mode/timeframe. That makes a flat dashboard state ambiguous.

Attack target:
- core/StateManager.js:1368-1401
- core/StateManager.js:2000-2055
- run-empire-v2.js:923-955
- run-empire-v2.js:2149-2161
- test/state-manager-dashboard-frame.test.js:100-226

Current intended mechanism:
1. `StateManager.setDashboardRuntimeScope()` stores the current runtime scope built through the existing immutable trade-scope builder.
2. Account scope is treated as incomplete when it came from the implicit `default` account path.
3. `broadcastToDashboard()` always exposes `runtimeScopeStatus`:
   - `complete` when all runtime scope fields are authoritative.
   - `incomplete` when scope exists but has implicit/default account identity.
   - `unset` when no runtime scope is known.
4. Top-level `symbol`, `brokerId`, `assetClass`, `executionMode`, `timeframe`, and `scopeKey` are stamped only when the runtime scope is complete and there are zero open positions.
5. Active positions retain their own immutable position scope; frame-level runtime scope must not overwrite position scope.
6. SessionRouter transition listener clears the old runtime scope before building the new one, then broadcasts a transition `state_update`. If the new scope cannot be built, the next frame is explicitly `unset`, not stale.

Attack request:
Construct a concrete state/input/event sequence where this implementation still makes the dashboard lie about the scope of a `state_update` frame.

Try especially:
- Missing or default account ID becoming a top-level authoritative scope anyway.
- SessionRouter switching stocks <-> crypto and a heartbeat still advertising the old symbol/session after transition.
- Open positions for one symbol being overwritten by runtime scope for another symbol.
- Backtest/file mode receiving live or broker-derived scope by accident.
- `runtimeScopeStatus` or `runtimeScopeMissing` being internally inconsistent with the fields present on the frame.
- Any code path that bypasses `setDashboardRuntimeScope()` and silently emits an ambiguous state_update without `unset`.

Architecture question:
Did this close the underlying mechanism (flat account state has explicit runtime scope status), or only patch the TSLA symptom? What new failure modes did it introduce?

Return:
- PASS only if you cannot construct a dashboard-lie sequence from current code.
- FAIL with exact file:line evidence and a minimal reproduction sequence if you can.
