# Mercury attack: webhook order dispatch trace

Attack this proposed OrderExecutor change as trading-path code, not as a confirmation review.

Current branch: codex/ttp-eval-gates

Changed files:
- core/OrderExecutor.js
- test/order-executor-pause-gate.test.js

Exact code under attack:
- core/OrderExecutor.js:221-276 `_emitWebhookOrder(action, signal, traceFields = {})`
- core/OrderExecutor.js:836-850 BUY webhook call site
- core/OrderExecutor.js:1034-1048 SELL_SHORT webhook call site
- core/OrderExecutor.js:1331-1346 SELL webhook call site
- core/OrderExecutor.js:1792-1806 COVER webhook call site
- core/WebhookOrderAdapter.js:48-132 existing `emit(signal)` behavior
- core/TraceSpine.js:189-197 existing `emitTrace(ctx, event, fields)`

Intent:
- Preserve the existing non-blocking SignalStack webhook side-channel.
- Stop throwing away the adapter result.
- Emit `WEBHOOK_ORDER_DISPATCH` before the adapter call and `WEBHOOK_ORDER_RESULT` after the promise settles.
- Do not claim broker acceptance/fill. This event is only local webhook/vendor HTTP dispatch truth. Direct broker route already has `BROKER_ORDER_REQUEST` and `BROKER_ORDER_RESULT`.

Attack questions:
1. Can this helper stall, crash, or unhandle a promise rejection in the live trading path?
2. Can it lie by marking a failed, dry-run, non-2xx, malformed, or missing adapter result as successful?
3. Can a malicious or weird adapter return value make TraceSpine throw or mutate trading state?
4. Do the four call sites preserve exact previous order payloads and side semantics?
5. Does this close the root observability gap, or only add another misleading event?
6. What new failure modes did this introduce?

Tests already added:
- `webhook side-channel emits dispatch and local result trace events without blocking`
- `webhook side-channel converts rejected adapter promises into failed result traces`

Return concrete findings with file:line evidence. If you think the event naming or success fields are misleading, say exactly what the dashboard would falsely infer and what field/event name would be safer.
