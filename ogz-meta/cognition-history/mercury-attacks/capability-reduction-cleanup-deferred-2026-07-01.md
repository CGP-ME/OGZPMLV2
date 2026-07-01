# Capability Reduction Cleanup - Deferred Mercury Attack Packet

Date: 2026-07-01
Branch: codex/multi-asset-symbol-state
Pre-commit head: ea1ccb40fbe41e73314020b8ec4561cc157752f1

## Why This Is Deferred

Mercury adversarial review was attempted after focused tests and P0, but the provider returned:

`HTTP 402 free_tier_quota_exceeded`

Run-ledger row:

- `ogz-meta/cognition-history/mercury-runs/2026-07-01.jsonl`
- run id: `2026-07-01T06-41-48-392Z-df948131f029`
- verdict: `tool_failure`

Trey approved documenting these fixes for Mercury rerun tomorrow morning, then committing/pushing and restarting the eval runtime today.

## Fixes That Must Be Attacked

### 1. EventLoopMonitor Critical Lag Is Alert Only

Files:

- `core/EventLoopMonitor.js:180-197`
- `test/event-loop-monitor-alert-only.test.js`

Expected behavior:

- Critical event-loop lag logs and broadcasts `action: 'ALERT_ONLY'`.
- It must not import `StateManager`.
- It must not call `pauseTrading`.
- It must not emit `TRADING_PAUSED`.

Tomorrow Mercury prompt:

```text
Mercury, break my fix. Attack EventLoopMonitor critical-lag behavior only. Current code is core/EventLoopMonitor.js:180-197 and test coverage is test/event-loop-monitor-alert-only.test.js. Find a concrete current-code path where event-loop warning, precise-lag, critical-lag, callback, dashboard, singleton, or test bypass can still call StateManager.pauseTrading, set isTrading false, emit TRADING_PAUSED, suppress the critical alert, or silently reduce trading capability. Require file:line evidence. If no such path exists, say what assumptions remain unproved.
```

### 2. Data Feed Liveness And Gap Backfill Do Not Pause Trading

Files:

- `core/CandleProcessor.js:1038-1046`
- `core/CandleProcessor.js:1122-1135`
- `run-empire-v2.js:3102-3129`
- `test/data-feed-liveness-no-pause.test.js`

Expected behavior:

- Stale candle detection logs stale data and keeps it visible.
- Gap backfill failure retries/backfills but does not pause trading.
- Runtime liveness watchdog attempts REST backfill and logs failure, but does not call `pauseTrading`.
- Missing liveness symbol/timeframe logs and returns without mutating trading state.

Tomorrow Mercury prompt:

```text
Mercury, break my fix. Attack data-feed liveness capability reduction only. Current code is core/CandleProcessor.js:1038-1046, core/CandleProcessor.js:1122-1135, and run-empire-v2.js:3102-3129, with test coverage in test/data-feed-liveness-no-pause.test.js. Find a concrete current-code path where stale-data detection, gap recovery, liveness watchdog missing scope, failed REST backfill, staleFeedPaused state, resume logic, or StateManager integration can still pause trading, set isTrading false, block entries, suppress exits, or leave the bot stuck in a liveness-derived reduced capability mode. Require file:line evidence.
```

### 3. TradeJournalBridge Visibility Persistence Failure Is Alert Only

Files:

- `core/TradeJournalBridge.js:1098-1113`
- `test/trade-journal-bridge-scope.test.js`

Expected behavior:

- Total visibility persistence failure still emits evidence.
- `visibilityTradingPauseAttempted` remains false.
- `visibilityTradingPauseConfirmed` remains false.
- Trading remains active; no `pauseTrading` call is made.

Tomorrow Mercury prompt:

```text
Mercury, break my fix. Attack TradeJournalBridge visibility-persistence behavior only. Current code is core/TradeJournalBridge.js:1098-1113 and focused test coverage is test/trade-journal-bridge-scope.test.js. Find a concrete current-code path where ledger write failure, fallback write failure, malformed scope, dashboard send failure, startup reconciliation, or shared bot/stateManager shape can still pause trading, set isTrading false, suppress visibility evidence, or incorrectly mark pause confirmation true. Require file:line evidence.
```

### 4. Webhook 2xx Accepted Without Order Id Does Not Become `missing_webhook_order_id`

Files:

- `core/OrderExecutor.js:401-417`
- `core/OrderExecutor.js:675-682`
- `core/OrderExecutor.js:1820-1896`
- `test/order-executor-pause-gate.test.js`

Expected behavior:

- Webhook 2xx/no-order-id responses like `Broker accepted. Order is in the pipe.` are treated as accepted.
- The execution result gets a local `WEBHOOK_PENDING_*` correlation id.
- State mutation still happens for entries and accepted exits.
- Dashboard broker frame marks `acceptedWithoutOrderId: true`.
- This path must not emit `ORDER_BLOCKED` with `missing_webhook_order_id`.

Broker-flat exception:

- Exit response bodies containing `No open positions for the asset` are not accepted-without-id.
- They are broker-flat rejects and attempt `StateManager.reconcileBrokerFlat`.

Tomorrow Mercury prompt:

```text
Mercury, break my fix. Attack webhook accepted-without-order-id execution only. Current code is core/OrderExecutor.js:401-417, core/OrderExecutor.js:675-682, and core/OrderExecutor.js:1820-1896, with focused tests in test/order-executor-pause-gate.test.js. Construct a concrete current-code sequence where a webhook 2xx accepted response without returned order id can still become missing_webhook_order_id, ORDER_BLOCKED, skipped state mutation, incorrect releaseExitSlot behavior, duplicate active trade, false broker identity, or a dashboard lie. Also attack the broker-flat exception: find any response body or action where `No open positions for the asset` is incorrectly accepted, or a valid accepted no-id order is incorrectly reconciled as broker-flat. Require file:line evidence.
```

## Proof Already Run Before Commit

Focused tests:

```text
npx jest test/data-feed-liveness-no-pause.test.js test/event-loop-monitor-alert-only.test.js test/order-executor-pause-gate.test.js test/trade-journal-bridge-scope.test.js --runInBand
PASS: 4 suites, 110 tests
```

Whitespace:

```text
git diff --check -- core/EventLoopMonitor.js core/OrderExecutor.js core/TradeJournalBridge.js test/event-loop-monitor-alert-only.test.js test/order-executor-pause-gate.test.js test/trade-journal-bridge-scope.test.js test/data-feed-liveness-no-pause.test.js
PASS: no output
```

P0:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
PASS
finalBalance: 10687.113526633222
totalTrades: 1598
winRate: 70.2
profitFactor: 1.16
latest: ogz-meta/gates/runs/multi-runtime-latest.json
report: /opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1782888086009-2969328-ef36ddbe-bc07-460a-90cf-d56678048045-phase0-canonical-multi-runtime-gate-2026-07-01T06-39-35-591Z-TSLA.json
```

## Commit Note

This packet is intentionally committed with the runtime fix so the deferred Mercury review has the exact attack prompts and cannot depend on chat memory.
