# Eval Checkoff - 2026-06-02

Repo: `/opt/ogzprime/OGZPMLV2`
Branch checked: `codex/multi-runtime-scope-build`
Canonical checklist: `ogz-meta/specs/eval-go-no-go-checklist-2026-05-23.md`

This is an evidence checkoff, not a rewrite of the canonical checklist.

## Evidence Commands

- `pm2 jlist` filtered for `ogz-prime-v2`, `ogz-websocket`, and `ogz-stripe`
- `node` read of `data/state.json`
- Alpaca adapter read-only credential/position probe
- `npm test -- --runTestsByPath test/config-loader-live-guard.test.js`
- `npm test -- --runTestsByPath test/eval-rule-engine.test.js test/eval-signal-path-proof.test.js test/trading-loop-trace-spine.test.js`
- `npm test -- --runTestsByPath test/ttp-cutoff-enforcer.test.js test/eval-rule-engine.test.js`
- Dashboard WebSocket 60-second capture:
  `ogz-meta/cognition-history/live-eval/2026-06-02T00-09-40-282Z-gate-check-ws-dashboard-60s.jsonl`

## Gate A - Runtime Posture

Status: BLOCKED for stock eval.

Running trading process `ogz-prime-v2`:

```json
{
  "TRADING_PAIR": "BTC-USD",
  "BROKER": "kraken",
  "ASSET_CLASS": "crypto",
  "SESSION_ROUTER_ENABLED": "false",
  "PAPER_TRADING": "true",
  "LIVE_TRADING": "false",
  "RISK_MANAGER_BYPASS": "false",
  "ACCOUNT_DRAWDOWN_BYPASS": "false",
  "EXECUTION_MODE": "paper"
}
```

Checked:

- [x] `SESSION_ROUTER_ENABLED=false`
- [x] `RISK_MANAGER_BYPASS=false`
- [x] `ACCOUNT_DRAWDOWN_BYPASS=false`
- [x] Startup hard-fails for illegal live bypass combinations. Evidence: `test/config-loader-live-guard.test.js`, 35 passed.

Not checked / blocked:

- [ ] `BROKER=alpaca` is not true on `ogz-prime-v2`.
- [ ] `ASSET_CLASS=stocks` is not true on `ogz-prime-v2`.
- [ ] `ALPACA_SYMBOLS=TSLA` is empty on `ogz-prime-v2`.
- [ ] `TRADING_PAIR=TSLA` is not true on `ogz-prime-v2`.
- [ ] `PAPER_TRADING=false` is not true.
- [ ] `LIVE_TRADING=true` is not true.
- [ ] `WEBHOOK_DRY_RUN=false` was not present in the filtered PM2 env.

Conclusion: the running trade process is a crypto paper visibility runtime, not the stock eval runtime.

## Gate B - State And Broker Truth

Status: PARTIAL.

`data/state.json` read result:

```json
{
  "mtime": "2026-05-31T22:23:34.283Z",
  "isTrading": true,
  "recoveryMode": false,
  "pauseReason": null,
  "lastError": null,
  "activeTradeCount": 0,
  "symbolHaltKeys": [],
  "balance": 10000,
  "scope": {}
}
```

Checked:

- [x] Local default state file is flat: no active trades, no symbol halts, no recovery mode, no pause reason, no last error.

Not checked / blocked:

- [ ] Broker account TSLA position could not be verified from this shell because Alpaca credentials were not available in the shell environment.
- [ ] Local state and broker positions cannot be marked matched until the Alpaca position read succeeds.
- [ ] The default state file lacks top-level `brokerId`, `assetClass`, `executionMode`, `timeframe`, and `scopeKey`, so immutable scope presence is not green from this file snapshot.
- [ ] Restart reconciliation is not proven in this pass.

## Gate C - Signal Path Proof

Status: BLOCKED for TSLA eval, PARTIAL for current BTC paper runtime.

Dashboard WebSocket capture authenticated and received current data for 60 seconds.

Frame counts:

```json
{
  "auth_success": 1,
  "state_update": 3,
  "funding_rate": 2,
  "fear_greed": 2,
  "liquidation_data": 5,
  "market_internals": 8,
  "smart_money": 3,
  "cvd_update": 20,
  "bot_thinking": 2,
  "depth_update": 5405,
  "historical_candles": 2,
  "trace_event": 296,
  "price": 19,
  "broker_status": 19,
  "delta": 19,
  "divergence": 3,
  "pattern_analysis": 1,
  "narrator_event": 1,
  "signal_analysis": 1,
  "golden_setup_state": 1
}
```

Symbols observed:

- `historical_candles`: `TSLA` once, `BTC-USD` once
- Live runtime frames: `BTC-USD` only for `price`, `delta`, `trace_event`, `bot_thinking`, `pattern_analysis`, `signal_analysis`, and edge analytics.

Trace events observed:

```json
{
  "CANDLE_INGRESS": 127,
  "CANDLE_NORMALIZED": 127,
  "CANDLE_PROCESSOR_RECEIVED": 19,
  "CANDLE_ACCEPTED": 19,
  "TRADING_CYCLE_TRIGGER": 1,
  "ANALYSIS_START": 1,
  "STRATEGY_DECISION": 1,
  "DECISION_SKIP": 1
}
```

Checked for current BTC paper runtime:

- [x] Real candle stream is entering.
- [x] Candle ingress has symbol, broker, account, asset class, execution mode, timeframe, and trace ID in trace frames.
- [x] Strategy decision and skip reason are visible.
- [x] Dashboard receives state, price, delta, trace, depth, pattern, signal, narrator, and edge frames.
- [x] Required symbol fields were present on captured `price`, `delta`, `historical_candles`, `trace_event`, `pattern_analysis`, and `bot_thinking` frames.

Not checked / blocked for stock eval:

- [ ] Real TSLA live candles are not entering the trading process.
- [ ] TSLA strategy decision path is not proven.
- [ ] TSLA no-signal or trade-intent trace is not proven.
- [ ] Dashboard cannot be marked aligned to TSLA trading state while `ogz-prime-v2` is BTC/Kraken/paper.

## Gate D/E/F - Eval Rule Engine And Rule Coverage

Status: CODE/TEST PARTIAL, LIVE-PATH UNPROVEN.

Focused tests passed:

- `test/eval-rule-engine.test.js`
- `test/eval-signal-path-proof.test.js`
- `test/trading-loop-trace-spine.test.js`
- `test/ttp-cutoff-enforcer.test.js`
- `test/config-loader-live-guard.test.js`

Mechanically checked by tests/code:

- [x] 5 percent previous one-minute volume pass/fail.
- [x] Zero previous-minute volume fallback.
- [x] Same-symbol aggregate cap fail.
- [x] 15:49 pre-cutoff entry behavior.
- [x] 15:50 liquidation/no-entry behavior.
- [x] Earnings-night block.
- [x] Missing earnings status fails closed unless a provider supplies status.
- [x] Daily loss pause from fixed start-of-day equity.
- [x] Stale start-of-day equity blocks.
- [x] Max loss boundary.
- [x] Illegal live runtime flag combinations hard-fail.
- [x] `OrderExecutor` emits `EVAL_RULE_CHECK` before broker/webhook/state side effects.

Still not green:

- [ ] These rule checks have not been observed on a live TSLA signal path in this pass.
- [ ] Alpaca broker account state was not verified in this pass.
- [ ] Consistency/profit-concentration guard live behavior was not observed in this pass.
- [ ] Copy-trading non-applicability is not checked here.

## Gate G - Verification Discipline

Status: PARTIAL.

Checked:

- [x] Focused tests were run for eval rule and config guard mechanics.
- [x] Runtime PM2 env was read directly.
- [x] Dashboard WebSocket was observed with real authentication and a real data capture.

Not checked:

- [ ] No PM2 restart was performed.
- [ ] No broker account proof was captured.
- [ ] No P0 was run in this pass because no trading-path code was changed in this checkoff pass.
- [ ] No Mercury was run in this pass because no code was changed in this checkoff pass.

## Gate H - Dashboard Visibility

Status: PARTIAL.

Checked:

- [x] Dashboard stream receives real trace and state events for current BTC/Kraken/paper runtime.
- [x] Edge analytics frames are firing for BTC.
- [x] Pattern, signal, narrator, and golden setup frames are firing for BTC.
- [x] Historical TSLA candles can be requested and returned through the dashboard relay.

Not checked / blocked:

- [ ] Live TSLA dashboard state is not proven because the trade process is not running TSLA/Alpaca.
- [ ] Live trade report cannot be fully proven without a TSLA trace through strategy, eval gates, broker boundary, and state-after.
- [ ] No broker ack/reject was observed in this 60-second capture.
- [ ] No trade frame was observed in this 60-second capture.

## Red Items Found During This Pass

1. `ogz-prime-v2` is BTC/Kraken/paper, not TSLA/Alpaca eval.
2. Running `ogz-prime-v2` logs still show the pre-restart decision-ledger integer timestamp failure:
   `Decision ledger skeleton failed schema validation: candleTimestamp: Invalid input: expected int, received number`.
   The repo has commit `c23a3aa` for this, but the running PM2 process has not been restarted onto it.
3. Dashboard relay logs show stale stock snapshots for TSLA/NVDA/SPY/QQQ/COIN/MARA/RIOT. This is honest red evidence for live stock watchlist freshness.
4. Broker account truth for TSLA was not checked because the shell environment did not expose Alpaca credentials to the read-only probe.

## Next Checkoff Step

Gate A must be resolved before TSLA eval visibility can be marked green:

1. Decide the controlled rehearsal target: TSLA/Alpaca paper first, not live eval.
2. Restart only after approval so `ogz-prime-v2` picks up the pushed ledger timestamp and websocket fixes.
3. Verify PM2 env after restart.
4. Capture live TSLA candle ingress through `ANALYSIS_START`, `STRATEGY_DECISION`, and either `DECISION_SKIP` or `EVAL_RULE_CHECK`.
5. Verify Alpaca broker positions and local state agree before any eval flip.
