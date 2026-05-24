Mercury adversarial attack: live webhook dry-run startup guard.

Patch under review:
- `foundation/ConfigLoader.js:251-258` now owns `WEBHOOK_ORDERS_ENABLED`,
  `WEBHOOK_DRY_RUN`, `SIGNALSTACK_WEBHOOK_URL`, `WEBHOOK_TIMEOUT_MS`, and
  `WEBHOOK_ORDER_LOG_CAP` under `config.webhookOrders`.
- `foundation/ConfigLoader.js:346-350` rejects live startup when the SignalStack
  webhook route is enabled but still dry-run, or enabled with no URL.
- `foundation/ConfigLoader.js` also validates enabled SignalStack URLs as
  parseable `https://` URLs before runtime adapter construction.
- `foundation/ConfigLoader.js:360-364` validates webhook timeout and order log
  cap.
- `core/WebhookOrderAdapter.js:10-16` no longer reads `process.env`; it uses
  constructor-injected config only.
- `core/WebhookOrderAdapter.js:18-20` rejects live initialization when the
  adapter itself receives `enabled:true` and `dryRun:true`, closing the direct
  constructor bypass identified in the first Mercury pass.
- `core/WebhookOrderAdapter.js` now throws in live mode for missing, malformed,
  or non-https SignalStack URLs instead of silently disabling the route.
- `run-empire-v2.js:1129-1138` injects `resolvedConfig.config.webhookOrders`
  into `new WebhookOrderAdapter(...)`.
- `test/config-loader-live-guard.test.js` adds focused tests for the illegal
  live+webhook+dry-run posture, missing SignalStack URL, and direct-live-broker
  route with webhook orders disabled.
- `test/webhook-order-adapter.test.js` adds focused tests for the adapter-level
  live dry-run invariant.

Attack question:
Find any real input/configuration sequence where this patch still allows
`LIVE_TRADING=true` with SignalStack/webhook orders enabled while
`WEBHOOK_DRY_RUN=true`, silently disables an intended live SignalStack route,
breaks the direct live broker route when `WEBHOOK_ORDERS_ENABLED=false`, leaves
any webhook order env var outside ConfigLoader ownership, changes webhook order
payload semantics, or changes P0/backtest behavior. Include exact file:line
evidence and a concrete failing sequence. Also say whether this closes the
underlying mechanism or only patches the symptom, and identify any new failure
modes introduced.
