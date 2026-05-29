Adversarial failure-mode review for OrderExecutor dashboard `trade` telemetry through reachable execution call sites only.

Reachable call sites:
- BUY entry frame is built at `core/OrderExecutor.js:1118-1132`.
- SELL_SHORT entry frame is built at `core/OrderExecutor.js:1322-1335`.
- SELL exit frame is built at `core/OrderExecutor.js:1619-1632`.
- COVER exit frame is built at `core/OrderExecutor.js:2117-2130`.
- All four call `_broadcastDashboardTrade()`, which calls `_dashboardTradePayload()` and `_sendDashboardFrame()`.

Current intended behavior:
- Dashboard `trade` frames use the execution-path payloads from the four call sites above, not arbitrary external payloads.
- Entry fallback frames may use `{ orderId, symbol }` when the active trade is not yet readable, but they must remain honest incomplete frames (`scopeComplete:false`) instead of inventing broker/account/scope.
- If both payload and trade record provide symbol and disagree, no frame is emitted and the build failure is logged.
- If both payload and trade record provide orderId/tradeId and disagree, no frame is emitted and the build failure is logged.
- Missing dashboard socket is logged for live/paper and intentionally quiet for backtest no-dashboard runs.
- Non-open dashboard socket and send exceptions are logged and cannot alter order execution.

Question:
Using only data values that can flow through the four listed OrderExecutor entry/exit call sites, find a concrete sequence where this change can still drop a real live/paper `trade` frame without evidence, emit a frame with wrong symbol/scope/order/strategy/exitReason, let a dashboard send failure alter order execution, or create fake trade telemetry. Do not use an arbitrary direct call to `_broadcastDashboardTrade(payload, trade)` unless you can show how the same payload/trade values are produced by one of the four call sites above. If you find a failure, cite exact file:line evidence and the minimal sequence. If you cannot find a reachable failure, say so and name the strongest residual risk.
