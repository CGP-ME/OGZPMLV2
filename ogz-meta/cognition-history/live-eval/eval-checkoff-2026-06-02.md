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

## Pass 2 - 2026-06-02T00:23:56+00:00

This pass checked the runtime/env split without restarting PM2 or modifying runtime files.

### PM2 Env Truth

Filtered `pm2 jlist` showed:

- `ogz-prime-v2`: `TRADING_PAIR=BTC-USD`, `BROKER=kraken`, `ASSET_CLASS=crypto`, `EXECUTION_MODE=paper`, `PAPER_TRADING=true`, `LIVE_TRADING=false`, `SESSION_ROUTER_ENABLED=false`.
- `ogz-websocket`: `TRADING_PAIR=TSLA`, `ALPACA_SYMBOLS=TSLA`, `PAPER_TRADING=true`, `SESSION_ROUTER_ENABLED=false`.
- `ogz-stripe`: `TRADING_PAIR=TSLA`, `ALPACA_SYMBOLS=TSLA`, `PAPER_TRADING=true`, `SESSION_ROUTER_ENABLED=false`.
- None of the filtered PM2 launch envs exposed Alpaca credential keys. Repo-local dotenv does expose them to modules that call `dotenv.config()`.

Conclusion: the active trade process remains a BTC/Kraken paper runtime. The TSLA stock relay posture exists in the web-facing processes, not the running trade engine.

### Repo-Local Dotenv Truth

`dotenv.config()` parsed repo-local `.env` as:

```json
{
  "TRADING_PAIR": "TSLA",
  "BROKER": "alpaca",
  "ASSET_CLASS": "stocks",
  "ALPACA_SYMBOLS": "TSLA",
  "PAPER_TRADING": "true",
  "LIVE_TRADING": "false",
  "CONFIRM_LIVE_TRADING": "false",
  "SESSION_ROUTER_ENABLED": "false",
  "RISK_MANAGER_BYPASS": "false",
  "ACCOUNT_DRAWDOWN_BYPASS": "true",
  "WEBHOOK_ORDERS_ENABLED": "true",
  "WEBHOOK_DRY_RUN": "true",
  "CANDLE_TIMEFRAME": "15m",
  "PRIMARY_ASSET": "TSLA"
}
```

Conclusion: the repo-local default can support TSLA/Alpaca paper rehearsal, but it is not eval-ready because drawdown bypass and webhook dry-run are enabled, and eval rules are not enabled.

### Read-Only Alpaca Broker Proof

Read-only paper Alpaca probe using repo-local dotenv:

```json
{
  "account": {
    "status": "ACTIVE",
    "equity": 100000,
    "buyingPower": 200000,
    "portfolioValue": 100000
  },
  "positionCount": 0,
  "tslaPositions": [],
  "openOrderCount": 0,
  "tslaOrders": []
}
```

Conclusion: broker account truth is now checked for the paper Alpaca account. It is flat for TSLA and has no open TSLA orders.

### ConfigLoader Eval Readiness

Current repo-local dotenv loads successfully as TSLA/Alpaca paper rehearsal:

- broker: `alpaca`
- trading pair: `TSLA`
- asset class: `stocks`
- Alpaca credentials: present
- risk manager bypass: `false`
- account drawdown bypass: `true`
- webhook orders enabled: `true`
- webhook dry-run: `true`
- eval rules enabled: `false`
- TTP rules enabled: `false`

Forcing `LIVE_TRADING=true`, `CONFIRM_LIVE_TRADING=true`, `PAPER_TRADING=false`, `ACCOUNT_DRAWDOWN_BYPASS=false`, `RISK_MANAGER_BYPASS=false`, `WEBHOOK_DRY_RUN=false`, `EVAL_RULES_ENABLED=true`, and `TTP_RULES_ENABLED=true` correctly fails unless all TTP account limits are explicitly configured:

```text
TTP_ACCOUNT_START_OF_DAY_DATE must be YYYY-MM-DD for daily loss pause
TTP_ACCOUNT_START_OF_DAY_EQUITY must be configured for daily loss pause
TTP_DAILY_LOSS_LIMIT_DOLLARS must be configured for daily loss pause
TTP_MAX_LOSS_THRESHOLD_EQUITY must be configured for max loss enforcement
TTP_PROFIT_TARGET_DOLLARS must be configured for consistency enforcement
```

With explicit TTP account limits and `INITIAL_BALANCE=100000`, ConfigLoader accepts the full eval override shape:

```json
{
  "mode": {
    "execution": "live",
    "liveTrading": true,
    "paperTrading": false,
    "confirmLiveTrading": true
  },
  "broker": {
    "id": "alpaca",
    "tradingPair": "TSLA",
    "assetClass": "stocks",
    "apiKeyPresent": true,
    "apiSecretPresent": true
  },
  "risk": {
    "riskManagerBypass": false,
    "accountDrawdownBypass": false
  },
  "webhookOrders": {
    "enabled": true,
    "dryRun": false,
    "webhookUrlPresent": true
  },
  "evalRules": {
    "enabled": true,
    "ttpEnabled": true,
    "accountStartOfDayEquity": 100000,
    "dailyLossDollars": 3000,
    "maxLossThresholdEquity": 97000,
    "profitTargetDollars": 6000
  }
}
```

Conclusion: ConfigLoader blocks missing TTP limits and accepts the intended eval posture only when the eval account basis is explicit. This is code-ready, not runtime-active.

### Updated Checkoff State

- Gate B broker truth: upgraded from blocked to partial-green for Alpaca paper. Broker account is ACTIVE and flat for TSLA.
- Gate A runtime posture: still blocked for eval because `ogz-prime-v2` is launched as BTC/Kraken/paper.
- Gate C signal path: still blocked for TSLA live signal visibility until `ogz-prime-v2` is deliberately started/restarted in TSLA/Alpaca posture.
- Gate D/E/F eval rules: validator is green for explicit eval override shape, but live path remains unobserved.

### Next Checkoff Step

Before eval, run a controlled TSLA/Alpaca paper rehearsal under explicit safe overrides:

- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `TRADING_PAIR=TSLA`
- `ALPACA_SYMBOLS=TSLA`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `WEBHOOK_DRY_RUN=true`
- `ACCOUNT_DRAWDOWN_BYPASS=false`
- `RISK_MANAGER_BYPASS=false`
- `SESSION_ROUTER_ENABLED=false`

Then capture the same dashboard/trace ladder for TSLA:

1. candle ingress
2. normalization
3. state before
4. strategy decision or no-signal reason
5. risk/eval gate result if a trade intent appears
6. broker/webhook boundary if an order intent appears
7. state after
8. dashboard frame alignment

## Pass 3 - 2026-06-02T01:12:20+00:00

This pass checked read-only stock market-data visibility and dashboard ticker frame behavior without restarting PM2.

### Read-Only TSLA Market Data

Read-only Alpaca market-data probe for `TSLA` at `15m`:

```json
{
  "symbol": "TSLA",
  "timeframe": "15m",
  "nowIso": "2026-06-02T01:10:10.548Z",
  "ticker": {
    "bid": 397.65,
    "ask": 0,
    "last": 415.3,
    "volume": 621094
  },
  "candleCount": 20,
  "firstCandle": {
    "iso": "2026-06-01T16:00:00.000Z",
    "o": 421.4,
    "h": 422,
    "l": 419.35,
    "c": 419.48,
    "v": 24725
  },
  "lastCandle": {
    "iso": "2026-06-01T20:45:00.000Z",
    "o": 415.57,
    "h": 415.78,
    "l": 415.3,
    "c": 415.3,
    "v": 157,
    "ageMs": 15910548
  }
}
```

Conclusion: Alpaca data access works. The latest `15m` bar available during this after-hours probe was stale relative to wall clock, so the relay must not present it as live.

### Stock Snapshot Suppression

Current `server/stock-data-adapter.js` rejects stock snapshots older than `STOCK_TICKER_MAX_AGE_MS`:

- `fetchStockTicker()` parses `latestTrade.t || minuteBar.t || dailyBar.t`.
- If `Date.now() - parsedTimestamp > STOCK_TICKER_MAX_AGE_MS`, it logs `Stale snapshot timestamp for <symbol>` and returns `null`.
- `pm2 logs ogz-websocket --lines 160 --nostream` showed repeated stale snapshot rejections for `TSLA`, `NVDA`, `SPY`, `QQQ`, `COIN`, `MARA`, and `RIOT`.

Conclusion: blank/stale stock watchlist cards are honest under the current data age. The relay is suppressing stale stock snapshots instead of broadcasting old prices as live.

### Dashboard WebSocket Ticker Capture

Dashboard-classified 30-second capture:

`ogz-meta/cognition-history/live-eval/2026-06-02T01-10-stock-dashboard-capture.jsonl`

Raw capture is retained locally for grep/forensics but not committed because it is 8.9 MB; the compact counts below are the committed evidence.

Observed frame counts:

```json
{
  "auth_success": 1,
  "state_update": 2,
  "funding_rate": 1,
  "fear_greed": 1,
  "liquidation_data": 3,
  "market_internals": 5,
  "smart_money": 2,
  "cvd_update": 11,
  "bot_thinking": 2,
  "depth_update": 2115,
  "trace_event": 164,
  "price": 10,
  "broker_status": 10,
  "delta": 10,
  "pattern_analysis": 1,
  "narrator_event": 1,
  "signal_analysis": 1,
  "golden_setup_state": 1,
  "divergence": 1
}
```

Observed symbols:

- `price`: `BTC-USD` only
- `broker_status`: `BTC-USD` only
- `ticker_price`: `0` frames
- stock `price`/`ticker_price`: `0` frames

Conclusion: current live dashboard stream still exposes BTC/Kraken runtime frames only. No stock ticker frames reached the dashboard in this 30-second capture.

### Runtime Version Boundary

Current PM2 uptime:

- `ogz-websocket`: started `2026-05-28T20:45:28.639Z`
- `ogz-prime-v2`: started `2026-06-01T01:05:54.704Z`

Relevant ticker-frame commits on disk:

- `fc487f2` at `2026-05-29T16:50:55Z`: `Added dashboard ticker price frames`
- `e2f5cd2` at `2026-05-29T20:03:15Z`: `Fixed watchlist ticker price contract`
- `99fe4c0` at `2026-05-30T07:47:03Z`: `Fixed dashboard producer contract reconciliation`

Conclusion: `ogz-websocket` has not been restarted since before the ticker-price contract commits. The on-disk code builds valid `ticker_price` frames, but the live websocket process cannot be used as proof for those commits until it is restarted.

### Updated Checkoff State

- Stock data source: partial-green. Alpaca REST data access works, but the observed TSLA bar was stale during after-hours.
- Stock watchlist visibility: honest but not live. Stale stock snapshots are suppressed; no stale prices are broadcast as live.
- Dashboard ticker-price contract: code-ready, runtime-unproven. PM2 must restart before `ticker_price` can be verified live.
- TSLA signal path: still blocked until the trade runtime is started/restarted in TSLA/Alpaca posture.

### Next Checkoff Step

The next visibility pass requires runtime action:

1. Restart `ogz-websocket` so the pushed dashboard producer/ticker contract is actually live.
2. Restart or start `ogz-prime-v2` in controlled TSLA/Alpaca paper posture.
3. Capture dashboard frames again and require:
   - `ticker_price` frames for live-capable symbols or explicit stale/no-data status.
   - TSLA candle ingress through the trace ladder.
   - broker/status frames that identify Alpaca vs Kraken without cross-symbol contamination.

## Pass 4 - 2026-06-02T03:46:00+00:00

This pass performed the approved controlled TSLA/Alpaca paper restart and fixed a
dashboard-owned Alpaca stream collision found during the restart.

### Runtime Action

`ogz-websocket` was restarted after commit `3930bd6` loaded:

- `Fixed dashboard Alpaca stream ownership`
- `DASHBOARD_STOCK_STREAM_ENABLED` defaults to disabled.
- The dashboard relay now closes any existing Alpaca stock trade stream, clears
  any retry timer, and emits an explicit `broker_status` frame with
  `source=stock_price_stream` and `reason=disabled_bot_owns_stream`.

`ogz-prime-v2` was restarted with controlled paper overrides:

```text
BROKER=alpaca
ASSET_CLASS=stocks
PRIMARY_ASSET=TSLA
TRADING_PAIR=TSLA
ALPACA_SYMBOLS=TSLA
EXECUTION_MODE=paper
PAPER_TRADING=true
LIVE_TRADING=false
CONFIRM_LIVE_TRADING=false
SESSION_ROUTER_ENABLED=false
ACCOUNT_DRAWDOWN_BYPASS=false
RISK_MANAGER_BYPASS=false
WEBHOOK_ORDERS_ENABLED=true
WEBHOOK_DRY_RUN=true
CANDLE_TIMEFRAME=15m
```

### Mercury Attack

Focused Mercury attack:

```text
ogz-meta/cognition-history/mercury/dashboard-stock-stream-ownership-2026-06-02.md
```

Response:

```text
ogz-meta/cognition-history/mercury/dashboard-stock-stream-ownership-2026-06-02.response.md
```

Result: Mercury found the first attempt still allowed an existing disabled
relay stream to survive when the function returned early with no dashboard
clients. The patch was revised so the disabled ownership branch runs before
client/symbol early returns and also blocks the reconnect scheduler. The second
attack concluded the dashboard relay cannot consume the Alpaca stream by
default and that the underlying stream-ownership mechanism is torn down rather
than hidden.

### Tests

Passed:

```text
node --check ogzprime-ssl-server.js
node --check server/dashboard-stock-stream-config.js
node --check test/dashboard-stock-stream-config.test.js
npm test -- --runTestsByPath test/dashboard-stock-stream-config.test.js test/dashboard-ticker-frame.test.js test/stock-data-adapter-ticker.test.js
```

Jest result: 3 suites passed, 12 tests passed.

### Live Bot Evidence

Post-restart `ogz-prime-v2` logs showed:

```text
[Alpaca] Connected - account verified
[BOOT][REST-HYDRATE] symbol=TSLA timeframe=15m candles=60 latest=2026-06-01T21:00:00.000Z close=415.3
[Alpaca] RX ctrl: success {"T":"success","msg":"connected"}
[Alpaca] RX ctrl: success {"T":"success","msg":"authenticated"}
[Alpaca] Data stream authenticated
[Alpaca] TX subscribe(bars): {"action":"subscribe","bars":["TSLA"]} | url: wss://stream.data.alpaca.markets/v2/iex
[Alpaca] RX ctrl: subscription {"T":"subscription","bars":["TSLA"]}
```

The previous Alpaca `406 connection limit exceeded` line was in the error log
before the restart. Evidence:

```text
ogz-prime-v2 process created at: 2026-06-02T03:40:51.420Z
ogz-prime-v2 error log mtime: 2026-06-02T03:40:38.263936904Z
```

Conclusion: after the dashboard relay stream was disabled, the bot authenticated
and subscribed to TSLA bars without a new observed 406 during this pass.

### Dashboard Capture

60-second authenticated dashboard capture:

```text
ogz-meta/cognition-history/live-eval/2026-06-02T03-42-tsla-paper-dashboard-capture.jsonl
```

Observed frame counts:

```json
{
  "auth_success": 1,
  "broker_status": 39,
  "price": 39,
  "state_update": 3,
  "ticker_price": 39
}
```

Observed live symbols:

```json
{
  "price": ["BTC-USD", "ETH-USD", "SOL-USD"],
  "ticker_price": ["BTC-USD", "ETH-USD", "SOL-USD"]
}
```

Latest broker status samples included:

```json
{
  "name": "alpaca",
  "ok": false,
  "source": "stock_price_stream",
  "reason": "disabled_bot_owns_stream",
  "attemptedCount": 7,
  "successCount": 0
}
```

and:

```json
{
  "name": "kraken",
  "ok": true,
  "source": "crypto_price_fanout",
  "reason": "rest_ok",
  "attemptedCount": 3,
  "successCount": 3
}
```

### Updated Checkoff State

- Gate A runtime posture: green for controlled TSLA/Alpaca paper rehearsal
  posture after restart. Not green for live eval because `LIVE_TRADING=false`,
  `PAPER_TRADING=true`, and `WEBHOOK_DRY_RUN=true` by design.
- Gate B broker truth: partial-green. Paper Alpaca account was previously
  verified flat; this pass verified bot authentication and TSLA bar
  subscription.
- Gate C TSLA signal path: partial. TSLA historical REST hydrate and Alpaca bar
  subscription are proven. Intraday TSLA live bar ingress was not observed
  during this pass because the capture ran at `2026-06-01 23:45 EDT`, outside
  regular market hours.
- Gate H dashboard visibility: improved. `ticker_price` is now visible for live
  crypto symbols after the websocket restart, and the dashboard receives an
  explicit stock-stream-disabled broker status instead of silently implying a
  live stock stream.

### Remaining Red Items

1. TSLA live intraday `price`/`ticker_price`/trace ladder still needs a market
   hours capture. This pass cannot prove live TSLA ticks because it ran after
   hours.
2. Stock REST snapshots remain honestly suppressed as stale after hours:
   `stock_price_fanout` reports `reason=no_valid_tickers`.
3. No `trade`, `broker_ack`, or `broker_reject` frame was observed. That still
   requires a real strategy intent/order path.
4. The dashboard stream shows crypto `price`/`ticker_price` frames while the bot
   is in TSLA paper posture because the dashboard relay still performs its
   independent crypto REST fanout for watchlist visibility. This is acceptable
   only because those frames are symbol-stamped and separate from the bot-owned
   TSLA bar stream.
