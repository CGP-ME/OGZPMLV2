Adversarial failure-mode review for the StateManager dashboard heartbeat contract after close-path evidence logging.

Reachable production path:
- `core/WebSocketManager.js:30-57` creates `this.ctx.dashboardWs = new WebSocket(wsUrl)` using `require('ws')`.
- `core/WebSocketManager.js:82-107` calls `stateManager.setDashboardWs(this.ctx.dashboardWs)` only after receiving `auth_success`.
- `core/StateManager.js:1760-1871` validates heartbeat config, close binding, `send()`, and open `readyState` before assigning the socket and starting heartbeat.
- `core/StateManager.js:1848-1853` logs when a connected dashboard socket closes and then clears heartbeat/socket state.
- `core/StateManager.js:1954-2005` builds and sends the `state_update` frame, returning false and logging when an assigned socket is no longer open.

Current intended behavior:
- Invalid heartbeat config, invalid socket shape, or non-open socket state should fail before `dashboardWs` assignment, connect snapshot, or heartbeat start.
- If a connected socket closes, StateManager should leave evidence that dashboard state updates stopped.
- If a previously assigned socket becomes non-open before a broadcast, the skipped `state_update` is logged with readyState evidence instead of silently disappearing.
- Socket close or non-open heartbeat state should clear the StateManager heartbeat.
- Dashboard broadcast failures in notify, connect, and heartbeat paths should be logged and not escape into trading state/listener mutation.

Question:
Using only inputs or timing reachable through the current production path above, find a concrete sequence where StateManager can still produce a false dashboard state, leak heartbeat intervals, drop real state updates without evidence, block trading/listener mutation, or accept invalid dashboard socket/config. Do not use an arbitrary forged in-process fake socket unless you can show a current production call site that can pass that object into `setDashboardWs`. If you find a failure, cite exact file:line evidence and the minimal sequence. If you cannot find a reachable failure, say so and name the strongest residual risk.
