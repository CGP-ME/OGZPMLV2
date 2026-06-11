# Session Form - 2026-06-11 Eval Capture Runtime Fixes

## Session Identity

- Date: 2026-06-11
- Branch: `claude/new_beginnings`
- HEAD after pushed runtime fixes: `2e23d2bab0fedbffb6ea32fecab36dcd8be5be90`
- Scope: eval-live capture, Trade The Pool 5k MAX runtime posture, TSLA live market trace, and runtime bugs found during capture.
- Prior handoff for earlier 2026-06-11 work: `ogz-meta/sessions/session-2026-06-11-eval-readiness-handoff.md`

## Completed And Pushed Work

### `623adb4 Fixed eval starting balance env pass-through`

Root cause:

- `TradeJournalBridge` initialized from `STARTING_BALANCE`.
- Eval operator env passed `INITIAL_BALANCE=5000` but did not pass `STARTING_BALANCE`.
- Result risk: StateManager/eval rules could run against `$5,000` while journal/dashboard analytics initialized at `$10,000`.

Files changed:

- `ecosystem.config.js`
- `test/ecosystem-eval-profile.test.js`

Verification:

- `npm test -- --runInBand test/ecosystem-eval-profile.test.js`
- Result: pass, 3 tests.

### `abede10 Fixed incomplete active timeframe aggregation`

Root cause:

- Live Alpaca candles arrive as `1m` bars while the active strategy timeframe is `15m`.
- The live aggregation path rejected incomplete time windows only by time boundary, not by source-candle completeness.
- That allowed a risk class where a 15m decision could be formed from a partial or corrupted source set.

Files changed:

- `core/CandleAggregator.js`
- `run-empire-v2.js`
- `test/candle-aggregator-completeness.test.js`

Behavior now:

- `CandleAggregator.checkSourceCompleteness(...)` verifies every expected source slot exists.
- `_feedAggregatedActiveCandle()` refuses to feed the trading cycle when a `1m -> 15m` aggregate is incomplete.
- Incomplete aggregates emit `ACTIVE_CANDLE_AGGREGATE_REJECTED` with reason `incomplete_source_window`.
- Seconds-based timestamps are rejected as `invalid_source_timestamp_unit` instead of being silently coerced.

Verification:

- `npm test -- --runInBand test/candle-aggregator-completeness.test.js`
- Result: pass, 6 tests.
- P0 after fix: `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
- P0 log: `ogz-meta/cognition-history/live-eval/20260611T084511-0400-market-open-paper-capture/p0-after-aggregate-guard.log`
- Result: PASS, with existing zero-fee and consecutive-loss warnings printed by the gate.
- Mercury attacked the aggregate completeness fix. One real timestamp-unit ambiguity was fixed; the later boundary claim was refuted and covered by test.

### `2e23d2b Fixed stock webhook whole share planning`

Root cause:

- The webhook/SignalStack stock route was dispatching fractional TSLA share quantities.
- SignalStack rejected those orders with HTTP 403.
- A first guard blocked fractional webhook quantities, but the deeper route fix was to plan webhook entries as whole shares before dispatch.

Files changed:

- `core/OrderExecutor.js`
- `test/order-executor-pause-gate.test.js`

Behavior now:

- Webhook stock entries use `forceWholeShares`.
- Raw share quantity is floored before dispatch.
- `sizeUsd` is recomputed from the actual whole-share quantity.
- Sub-one-share entries block before webhook dispatch with `non_positive_order_quantity`.
- Non-integer webhook quantities remain blocked at the pre-dispatch boundary.

Verification:

- `npm test -- --runInBand test/order-executor-pause-gate.test.js`
- Result: pass, 49 tests.
- `npm test -- --runInBand test/webhook-order-adapter.test.js`
- Result: pass, 6 tests.
- `npm test -- --runInBand test/eval-rule-engine.test.js`
- Result: pass, 25 tests.
- Combined focused set passed, 40 tests.
- P0 after final planning fix: `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
- P0 log: `ogz-meta/cognition-history/live-eval/20260611T084511-0400-market-open-paper-capture/p0-after-webhook-whole-share-planning.log`
- Result: PASS, with existing zero-fee and consecutive-loss warnings printed by the gate.
- Mercury final attack returned CANNOT BREAK for the whole-share route-planning fix.

## Runtime Capture Evidence

Capture directory:

- `ogz-meta/cognition-history/live-eval/20260611T084511-0400-market-open-paper-capture/`

Important files:

- `operator-change-manifest.md`
- `eval-live-env-validation-5k-max.json`
- `pm2-ogz-prime-v2-live.log`
- `dashboard-ws-live.jsonl`
- `state-snapshot.json`
- `alpaca-paper-snapshot.json`
- `p0-after-aggregate-guard.log`
- `p0-after-webhook-whole-share-guard.log`
- `p0-after-webhook-whole-share-planning.log`

Capture process status at session-form write time:

- PM2 log capture still running from PID file `pm2-log-capture.pid`.
- Dashboard WebSocket capture still running from PID file `ws-capture.pid`.
- `dashboard-ws-live.jsonl` had 1351 lines.
- `pm2-ogz-prime-v2-live.log` had 4820 lines.

Verified process state at session-form write time:

- `pm2 describe ogz-prime-v2`: process online, PID-managed by PM2, cwd `/opt/ogzprime/OGZPMLV2`, uptime 117 minutes, restarts 139.
- `data/state.json`: flat `$5,000` state, no active trades, `isTrading=true`, no pause reason, no last error.

## Eval 5k MAX Mapping Used

Operator supplied Trade The Pool 5k MAX values:

- Account size: `$5,000`
- Daily loss / daily pause: `$50`
- Total loss threshold: `$150`, mapped to stop-out equity `$4,850`
- Day-trading profit target: `$300`
- Best trade profit cap: 30 percent of target
- Previous one-minute volume cap: 5 percent
- Day-trading liquidation: 15:50 ET

Validation-only env file:

- `eval-live-env-validation-5k-max.json`

That validation had zero errors and zero warnings for the mapped 5k MAX values.

## Runtime Observations

Confirmed good:

- TSLA live market bars flowed.
- Alpaca data stream authenticated.
- Dashboard WebSocket capture authenticated.
- Active 15m candle aggregation produced trace frames from live 1m Alpaca bars.
- Eval-live posture started with entries enabled after the state/journal reset.
- State remained flat after blocked webhook attempts.
- Alpaca paper REST snapshot showed 0 positions and 0 open orders after the final restart snapshot.

Confirmed fixed:

- Sub-one-share webhook plans now block before dispatch as `non_positive_order_quantity`.
- Whole-share route planning changed live dispatch quantities from fractional shares to integer share quantities.

Still not closed:

- SignalStack/webhook broker ack is not proven.
- After the final whole-share fix, later live traces dispatched `quantity=1` but still received `http_403`.
- That means the fractional-share bug is closed, but the webhook authorization/route rejection remains open.
- Eval launch cannot claim a clean broker-ack path until the HTTP 403 cause is fixed or intentionally replaced with the correct execution route.

## Open Items From This Session

1. Fix or replace the SignalStack/webhook route that is returning HTTP 403 for valid whole-share orders.
2. Capture one accepted broker/webhook round trip before eval start.
3. Keep `STARTING_BALANCE=5000` coupled with `INITIAL_BALANCE=5000` in eval operator env.
4. Keep active timeframe source-completeness checks in place for all live `1m -> 15m` aggregation.
5. Continue treating `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` as useful only when the report freshness path is verified.

## Dirty Worktree Notes

Do not stage broadly.

Known unrelated or unfinished tracked dirt at session-form time:

- `public/proof/track-record/data/index.json`
- `test/claude-bridge-edit-ledger.test.js`
- `test/claude-bridge-finish-gate.test.js`
- `trai_brain/claude-bridge/edit-ledger.js`
- `trai_brain/claude-bridge/finish-gate.js`
- `trai_brain/claude-bridge/post-edit.js`

The Claude bridge files are covered by the separate in-progress session form for this same date.
