# Session 2026-05-23 - Dashboard, Eval Gate, And Runtime Handoff

**Branch:** `rebuild/clean-from-baseline`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Session status:** Dashboard fixes committed and pushed; eval checklist committed and pushed; paused-state entry enforcement committed; startup entry-state logging committed; bot-side Alpaca REST hydration committed; runtime bot online with TSLA 15m boot hydration working; stale liveness pause cleared through `StateManager.resumeTrading()`; entries are enabled in paper mode, but eval remains NO-GO until live-market signal path and TTP rule layer are proven.
**Latest code head recorded in this form:** `78ba71c` (`Fixed Alpaca bot candle hydration`)

This session form fills the gap after the May 22 forms. It does not replace the earlier append-only records:

- `ogz-meta/sessions/session-2026-05-22-state-flatten-restart.md`
- `ogz-meta/sessions/session-2026-05-22-full-visibility-runtime-integrity.md`
- `ogz-meta/sessions/session-2026-05-22-alpaca-tsla-runtime-switch.md`

Those forms remain the source for the flatten/restart and Alpaca switch history. This form captures the May 23 dashboard, stock-data, eval-gate, and current runtime handoff state.

## What Changed

### 1. Stock dashboard historical candles were fixed

**Commit:** `d08ddd0` - `Fixed stock dashboard historical candles`

**Root cause:** Alpaca historical bar requests for non-default timeframes returned old bars because the adapter did not request newest bars first. Long timeframes appeared blank because candles loaded far to the left of the visible chart window.

**Fix:** `server/stock-data-adapter.js` now requests newest bars first, reverses them back to ascending order for the frontend, and normalizes bars into canonical `{ time, open, high, low, close, volume }` candles.

**Verification:**

- `node --check server/stock-data-adapter.js`
- Direct adapter checks for `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, and `1d`
- Mercury adversarial audit found no remaining stale/reversed/malformed/blank path inside the adapter
- Live WebSocket historical candle smoke later confirmed all seven dashboard timeframes returned ascending candles

### 2. Dashboard layout/celebration drop was deployed and then double-init was fixed

**Commit:** `251d4ac` - `Added dashboard layout celebration drop`

**Scope:** Frontend-only dashboard drop: 4-mode layout system, chart upgrade, and celebration modules. The web tier was restarted; the trading bot process was not restarted.

**Follow-up defect found:** The initial HTML manually initialized modules that `core.js` already auto-inits through `OGZ.init()`. This double-initialized `LayoutSwitcher` and the celebration modules. The visible symptom was duplicated layout menu items; the hidden symptom would have been duplicated toasts/sounds on real trade events.

**Fix disposition:** The redundant manual init block was removed from `public/unified-dashboard-v2.html` while script/link wiring stayed intact. The source of truth is the committed dashboard file, not stale staging copies under `ogz-meta/ledger/frontend/NEWESTDRP[`.

### 3. Chart panel timeframe and oscillator controls were deployed

**Commit:** `ed8657e` - `Added chart panel timeframe and oscillator controls`

**Files:**

- `public/js/panels/chart-panel.js`
- `CHANGELOG.md`

**Behavior added/fixed:**

- Ticker selection routes through a shared chart asset-switch path.
- RSI, MACD, ATR, and volume render as stacked oscillator panes below the main chart.
- Timeframe switches no longer blank the chart preemptively; the chart waits for historical data and uses a no-data watchdog.

**Verification:**

- `node --check public/js/panels/chart-panel.js`
- Static marker checks: `addOscPane=6`, `switchAsset=4`, `register('Chart')=2`
- Old `createOscillatorPane` path absent
- Served asset returned `HTTP 200`
- `ogz-websocket` restarted only
- `ogz-prime-v2` PID remained unchanged during deploy
- Live WebSocket smoke returned ascending candles for all seven timeframes:
  - `1m`: 398 candles
  - `5m`: 424 candles
  - `15m`: 373 candles
  - `30m`: 382 candles
  - `1h`: 213 candles
  - `4h`: 68 candles
  - `1d`: 500 candles

**Known follow-up:** Cowork Chrome smoke found volume pane default-on works but can restore slowly on fresh load. Logged as chart polish item `#44`, not treated as an eval blocker.

### 4. Watchlist ticker click routing was fixed

**Commit:** `e160461` - `Fixed watchlist ticker chart routing`

**Root cause:** `public/js/panels/watchlist-strip.js` had `onCardClick()` calling bare `setSelected({ symbol, broker })`, but `setSelected` only exists as `WatchlistStrip.setSelected()` on the API object. The resulting `ReferenceError` was swallowed by the local `try/catch`, so ticker clicks silently failed and never emitted `watchlist:select`.

**Fix:** `onCardClick()` now calls `WatchlistStrip.setSelected({ symbol, broker })`.

**Verification:**

- `node --check public/js/panels/watchlist-strip.js`
- `grep -c "WatchlistStrip.setSelected" public/js/panels/watchlist-strip.js` returned `1`
- Served asset returned `HTTP 200`
- `ogz-websocket` restarted only
- `ogz-prime-v2` PID remained unchanged
- Post-restart web log showed bot and dashboard reconnecting
- Post-restart web log showed a fresh `StockAdapter` NVDA `5m` historical fetch after dashboard interaction

**Backup created:**

- `public/js/panels/watchlist-strip.js.bak.1779520528.pre-watchlist-select-fix`

### 5. Eval go/no-go checklist was added

**Commit:** `b4c302d` - `Added eval go no-go checklist`

**File:** `ogz-meta/specs/eval-go-no-go-checklist-2026-05-23.md`

**Purpose:** Separate bot health from eval eligibility. The current bot can be used for dry-run readiness tracing, but it is not eval-go until the runtime flag posture, state/broker truth, signal trace, and Trade The Pool rule layer are implemented and verified.

**Current eval verdict:** NO-GO.

The current runtime is still simulation posture:

- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `WEBHOOK_DRY_RUN=true`
- `ACCOUNT_DRAWDOWN_BYPASS=true`
- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `ENABLE_TRAI=false`

The first recommended implementation target is a startup hard-fail for `LIVE_TRADING=true` with `ACCOUNT_DRAWDOWN_BYPASS=true`.

### 6. Paused-state entry enforcement was added

**Commit:** `594f023` - `Fixed paused state entry enforcement`

**Root cause:** `StateManager.pauseTrading()` correctly wrote `isTrading=false`, `pauseReason`, and `lastError`, but `OrderExecutor.executeTrade()` did not read that paused state before routing opening entries. PM2 being online could therefore be mistaken for "the bot is allowed to trade."

**Fix:**

- Added a supported-action whitelist in `core/OrderExecutor.js` so malformed/future action names cannot reach `orderRouter.sendOrder`.
- Added an entry-only paused-state gate for `BUY` and `SELL_SHORT`; outside real backtest mode, `StateManager.isTrading=false` returns `null` before sizing or routing.
- Added an `ENTRY-MODE` fail-loud guard so `enableBacktestMode` or `executionMode=backtest` cannot bypass the paused-state gate unless runtime `backtestMode=true`.
- Kept `SELL` and `COVER` exits outside the pause gate by design so recovery/close paths remain available while entries are paused.

**Verification:**

- `node --check core/OrderExecutor.js`
- `node --check test/order-executor-pause-gate.test.js`
- `npx jest test/order-executor-pause-gate.test.js --runInBand` - 4 passed
- `npm run test:smoke` - 13 passed, 0 failed, 1 existing Bombardier warning
- Mercury pass 1 found the backtest-mode spoof and drove the `ENTRY-MODE` guard
- Mercury pass 2 found unsupported action names could reach routing and drove the action whitelist
- Mercury pass 3 found no remaining unsupported-action, mode-spoof, paused-entry, exit-blocking, or P0/backtest blocker
- Fast P0: `$10059.713394730992 / 49 trades`
- Full P0: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`

**Evidence files:**

- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-2026-05-23.response.md`
- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-final-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-final-2026-05-23.response.md`
- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-whitelist-final-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-whitelist-final-2026-05-23.response.md`

### 7. Startup entry-state logging was fixed

**Commit:** `0cdc6ca` - `Fixed startup entry-state logging`

**Root cause:** After paused-state entry enforcement landed, PM2 startup still printed a broad "LIVE and trading" message even when persisted runtime state said entries were paused. That made process liveness look like trading readiness.

**Fix:**

- Replaced the unconditional live/trading startup banner in `run-empire-v2.js`.
- Startup now reports entry blockers from `StateManager.isTrading=false`, global halt state, and the active symbol halt.
- `StateManager.load()` now forces malformed persisted `isTrading` values into boolean paused state and saves that corrected shape back to disk.
- Added regression coverage for malformed persisted `isTrading`.

**Verification:**

- `node --check run-empire-v2.js`
- `node --check core/StateManager.js`
- `node --check test/state-manager-load.test.js`
- `npx jest test/order-executor-pause-gate.test.js test/state-manager-load.test.js --runInBand` - 5 passed
- `npm run test:smoke` - 13 passed, 0 failed, 1 existing Bombardier warning
- Mercury pass 1 found malformed persisted `isTrading`
- Mercury pass 2 found global/symbol halt log-lie coverage gap
- Mercury pass 3 found no remaining startup-banner log-lie for `isTrading=false`, malformed `isTrading`, global halt, or active-symbol halt
- Full P0: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`
- Restarted only `ogz-prime-v2`; fresh post-restart log correctly printed `[STARTUP] Bot online, but entries are blocked: Liveness watchdog: No data for 164s, backfill failed`

**Evidence files:**

- `ogz-meta/cognition-history/mercury/startup-entry-state-log-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/startup-entry-state-log-2026-05-23.response.md`
- `ogz-meta/cognition-history/mercury/startup-entry-state-log-final-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/startup-entry-state-log-final-2026-05-23.response.md`
- `ogz-meta/cognition-history/mercury/startup-entry-state-log-blocks-final-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/startup-entry-state-log-blocks-final-2026-05-23.response.md`

### 8. Bot-side Alpaca REST candle hydration was fixed

**Commit:** `78ba71c` - `Fixed Alpaca bot candle hydration`

**Root cause:** The dashboard stock-data path had already been fixed to request the latest bounded Alpaca bar window, but the live bot still used `brokers/AlpacaAdapter.js:getCandles()`. That adapter requested Alpaca bars without `start`, `end`, or `sort=desc`, so a weekend/closed-market restart returned zero TSLA intraday candles and boot hydration logged no usable TSLA 15m candles.

**Fix:**

- `AlpacaAdapter.getCandles()` now sends `start`, `end`, and `sort=desc` for stock bar requests.
- Intraday lookback uses at least seven days so closed-market/weekend restarts can hydrate from recent market bars.
- Returned candles preserve the existing adapter contract `{ t, o, h, l, c, v }` with `t` in epoch milliseconds and ascending time order.
- No dashboard files, Kraken/BTC adapter files, strategy code, or execution sizing logic were changed.

**Verification:**

- `node --check brokers/AlpacaAdapter.js`
- `node --check test/alpaca-adapter-candles.test.js`
- `npx jest test/alpaca-adapter-candles.test.js test/order-executor-pause-gate.test.js test/state-manager-load.test.js --runInBand` - 7 passed
- Direct live adapter check returned recent TSLA candles:
  - `1m`: 10 candles, latest `2026-05-22T20:53:00.000Z`
  - `5m`: 10 candles, latest `2026-05-22T20:50:00.000Z`
  - `15m`: 60 candles, latest `2026-05-22T20:45:00.000Z`
  - `1h`: 10 candles, latest `2026-05-22T20:00:00.000Z`
  - `1d`: 10 candles, latest `2026-05-22T04:00:00.000Z`
- `npm run test:smoke` - 13 passed, 0 failed, 1 existing Bombardier warning
- Mercury found no remaining closed-market/weekend zero-candle, stale ordering, contract-shape, Kraken/BTC, or backtest/P0 divergence issue in the adapter patch
- Full P0: `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`
- Restarted only `ogz-prime-v2`; fresh post-restart log showed `[BOOT][REST-HYDRATE] symbol=TSLA timeframe=15m candles=60 latest=2026-05-22T21:00:00.000Z close=425.04`

**Evidence files:**

- `ogz-meta/cognition-history/mercury/alpaca-adapter-candles-2026-05-23.md`
- `ogz-meta/cognition-history/mercury/alpaca-adapter-candles-2026-05-23.response.md`

### 9. Stale liveness pause was cleared after hydration proof

**Code commit:** none. This was a runtime state operation after `78ba71c` proved the TSLA 15m boot-hydration path.

**Reason:** `data/state.json` still carried the old liveness pause from before the Alpaca adapter fix:

- `isTrading=false`
- `pauseReason="Liveness watchdog: No data for 164s, backfill failed"`
- `lastError="Liveness watchdog: No data for 164s, backfill failed"`

**Action:** Used the built-in `StateManager.resumeTrading()` path, not a manual state-file edit.

**Pre/post state:**

- Before: `activeTrades=0`, `recoveryMode=false`, `isTrading=false`, stale liveness pause present
- After: `activeTrades=0`, `recoveryMode=false`, `isTrading=true`, `pauseReason=null`, `lastError=null`, `symbolEntryHalts={}`

**Post-resume restart verification:**

- Restarted only `ogz-prime-v2`.
- `ogz-prime-v2` PID changed to `1150476`.
- `ogz-websocket` stayed `1134427`.
- `ogz-stripe` stayed `3440510`.
- Fresh boot log showed `[BOOT][REST-HYDRATE] symbol=TSLA timeframe=15m candles=60 latest=2026-05-22T21:00:00.000Z close=425.04`.
- Fresh startup log showed `[STARTUP] Bot online and entries enabled`.
- After one watchdog interval, log showed `[WATCHDOG] market data quiet expected | broker=alpaca assetClass=stocks phase=closed next=Pre-market Monday 04:00 ET`.

**Important limitation:** This proves the runtime can boot cleanly, hydrate TSLA 15m, stay connected, and remain entry-enabled during expected closed-market quiet. It does not prove a market-hours signal, skip, broker order intent, order block, fill, or state mutation. That proof must happen during a live market session or controlled paper signal exercise.

## Smoke Test Results

| Check | Result | Evidence |
|---|---:|---|
| Stock historical candles | Pass | `d08ddd0`; adapter checks and live WebSocket smoke returned ascending candles for all seven timeframes |
| Chart panel syntax | Pass | `node --check public/js/panels/chart-panel.js` |
| Chart panel markers | Pass | `addOscPane=6`, `switchAsset=4`, `register('Chart')=2`, old `createOscillatorPane` path absent |
| Watchlist syntax | Pass | `node --check public/js/panels/watchlist-strip.js` |
| Watchlist marker | Pass | `WatchlistStrip.setSelected` marker count `1` |
| Web asset serving | Pass | `chart-panel.js` and `watchlist-strip.js` returned `HTTP 200` from local web tier |
| Web-tier restart isolation | Pass | `ogz-websocket` restarted; `ogz-prime-v2` PID stayed `1120365` |
| Eval checklist doc | Pass | `git diff --check` clean before commit |
| Paused entry enforcement | Pass | `594f023`; focused Jest, smoke, three Mercury passes, fast P0, full P0 |
| Startup entry-state logging | Pass | `0cdc6ca`; focused Jest, smoke, three Mercury passes, full P0, post-restart PM2 log shows entries blocked |
| Alpaca bot REST hydration | Pass | `78ba71c`; focused Jest, direct live adapter check, smoke, Mercury, full P0, post-restart boot hydrate loaded 60 TSLA 15m candles |
| Runtime state resume | Pass | Built-in `StateManager.resumeTrading()` cleared stale liveness pause; post-restart state has `isTrading=true` |
| Closed-market watchdog behavior | Pass | Post-resume watchdog logged expected stock-market quiet instead of pausing again |
| Eval readiness | Blocked | Runtime is still paper/dry-run posture and TTP rule layer/live-market signal path are not fully proven |

## Files Touched

| File | Action |
|---|---|
| `server/stock-data-adapter.js` | Fixed stock historical candle ordering/normalization |
| `public/unified-dashboard-v2.html` | Removed duplicate manual init block for auto-init modules |
| `public/js/panels/chart-panel.js` | Deployed chart timeframe and oscillator pane rebuild |
| `public/js/panels/watchlist-strip.js` | Fixed ticker click event routing |
| `core/OrderExecutor.js` | Added supported-action, backtest-mode, and paused-state entry guards |
| `core/StateManager.js` | Added persisted `isTrading` shape validation on load |
| `run-empire-v2.js` | Replaced unconditional startup trading banner with entry-block-aware startup log |
| `brokers/AlpacaAdapter.js` | Fixed bot-side Alpaca REST candle latest-window hydration |
| `test/order-executor-pause-gate.test.js` | Added focused pause-gate regression coverage |
| `test/state-manager-load.test.js` | Added malformed persisted `isTrading` regression coverage |
| `test/alpaca-adapter-candles.test.js` | Added Alpaca REST candle request/ordering coverage |
| `CHANGELOG.md` | Added entries for stock candles, chart panel, watchlist routing, and paused-state entry enforcement |
| `ogz-meta/cognition-history/mercury/orderexecutor-pause-gate-*.md` | Added Mercury attack prompts and responses for paused-entry enforcement |
| `ogz-meta/cognition-history/mercury/startup-entry-state-log-*.md` | Added Mercury attack prompts and responses for startup entry-state logging |
| `ogz-meta/cognition-history/mercury/alpaca-adapter-candles-*.md` | Added Mercury attack prompt and response for bot-side Alpaca REST hydration |
| `ogz-meta/specs/eval-go-no-go-checklist-2026-05-23.md` | Added eval readiness gate checklist |
| `ogz-meta/sessions/session-2026-05-23-dashboard-eval-gate-and-runtime-handoff.md` | Added this handoff/session form |

## Current Runtime Snapshot

Checked after clearing stale liveness pause and restarting `ogz-prime-v2` onto `78ba71c`:

| Process | Status | PID | Note |
|---|---:|---:|---|
| `ogz-prime-v2` | online | `1150476` | Restarted after resume; entries enabled in paper mode |
| `ogz-websocket` | online | `1134427` | Restarted for frontend asset deploys |
| `ogz-stripe` | online | `3440510` | Untouched |

Current `.env` posture:

- `TRADING_PAIR=TSLA`
- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `CANDLE_TIMEFRAME=15m`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `ENABLE_TRAI=false`
- `ACCOUNT_DRAWDOWN_BYPASS=true`
- `ATR_FILTER_ENABLED=true`
- `RISK_MANAGER_BYPASS=false`
- `WEBHOOK_DRY_RUN=true`

Current `data/state.json` snapshot:

```json
{
  "balance": 10000,
  "totalBalance": 10000,
  "activeTrades": 0,
  "closedTrades": 0,
  "tradeCount": 0,
  "dailyTradeCount": 0,
  "symbolEntryHalts": {},
  "recoveryMode": false,
  "isTrading": true,
  "lastError": null,
  "pauseReason": null
}
```

Important: PM2 being online is not the same as eval readiness. The current state file now has `isTrading=true`, but the runtime is still in paper/dry-run posture and has not yet produced a live-market signal-path proof.

Fresh post-restart startup evidence after `0cdc6ca`:

- `ogz-prime-v2` error log: `[BOOT][REST-HYDRATE] no usable candles returned for TSLA @ 15m`
- `ogz-prime-v2` error log: `[STARTUP] Bot online, but entries are blocked: Liveness watchdog: No data for 164s, backfill failed`

Fresh post-restart startup evidence after `78ba71c`:

- `ogz-prime-v2` out log: `[BOOT][REST-HYDRATE] symbol=TSLA timeframe=15m candles=60 latest=2026-05-22T21:00:00.000Z close=425.04`
- `ogz-prime-v2` error log: `[STARTUP] Bot online, but entries are blocked: Liveness watchdog: No data for 164s, backfill failed`

Fresh post-resume startup evidence:

- `StateManager.resumeTrading()` result: `success=true`, `activeTrades=0`, `recoveryMode=false`, `isTrading=true`, `pauseReason=null`, `lastError=null`
- `ogz-prime-v2` out log: `[BOOT][REST-HYDRATE] symbol=TSLA timeframe=15m candles=60 latest=2026-05-22T21:00:00.000Z close=425.04`
- `ogz-prime-v2` out log: `[STARTUP] Bot online and entries enabled`
- `ogz-prime-v2` out log after one watchdog interval: `[WATCHDOG] market data quiet expected | broker=alpaca assetClass=stocks phase=closed next=Pre-market Monday 04:00 ET`

## Git Log

Newest first:

- `78ba71c` Fixed Alpaca bot candle hydration
- `0cdc6ca` Fixed startup entry-state logging
- `594f023` Fixed paused state entry enforcement
- `e160461` Fixed watchlist ticker chart routing
- `b4c302d` Added eval go no-go checklist
- `ed8657e` Added chart panel timeframe and oscillator controls
- `d08ddd0` Fixed stock dashboard historical candles
- `b2cd6ed` Fixed broker-aware liveness watchdog
- `e4b9ea4` Added active timeframe REST boot hydration
- `d0b7799` Fixed timer-driven live entries
- `251d4ac` Added dashboard layout celebration drop
- `71da186` Added runtime visibility follow-up ledger
- `c46fcbe` Fixed Alpaca active timeframe candle ingestion
- `b1917d2` Added Alpaca TSLA runtime switch session form
- `f9dfbc0` Added state flatten restart session form

## Open Items

1. Observe the next live-market signal path end-to-end; do not call the bot eval-ready until the entry/skip reason is traceable through signal, gate, broker, state, and logs.
2. Keep runtime in paper/dry-run posture until the TTP rule layer and eval posture guard are implemented.
3. Do not flip eval while `PAPER_TRADING=true`, `LIVE_TRADING=false`, `WEBHOOK_DRY_RUN=true`, and `ACCOUNT_DRAWDOWN_BYPASS=true`.
4. Implement the runtime posture guard: `LIVE_TRADING=true` plus `ACCOUNT_DRAWDOWN_BYPASS=true` must hard-fail startup.
5. Implement the Trade The Pool eval rule layer, starting with the 5 percent previous one-minute volume rule.
6. Implement or explicitly gate the 15:50 ET liquidation/no-new-entry behavior.
7. Keep `SESSION_ROUTER_ENABLED=false` until SessionRouter pattern-bank isolation and cross-asset state rules are complete.
8. Keep `ENABLE_TRAI=false` until TRAI phantom feature defaults and phantom 1 percent position sizing are fixed.
9. Retire or refresh stale frontend staging folders after confirmed deploys so old drops cannot reintroduce fixed bugs.

## Half-Cooked Items Status

| Item | Disposition |
|---|---|
| Dashboard stock timeframe blanking | Closed by `d08ddd0` and live seven-timeframe WebSocket smoke |
| Dashboard celebration/layout double-init | Closed in committed dashboard HTML; stale staging folder must not be reused |
| Chart panel stacked oscillators | Shipped by `ed8657e`; cowork smoke verified core pane stacking |
| Chart panel volume restore latency | Open as polish item `#44`; not treated as eval blocker |
| Watchlist ticker click chart routing | Closed by `e160461`; final browser click recheck belongs to cowork/Chrome smoke |
| Eval go/no-go checklist | Added by `b4c302d`; code implementation still open |
| Paused-state entry enforcement | Closed by `594f023`; entries now refuse to route while `StateManager.isTrading=false` outside real backtest mode |
| Bot runtime state | Enabled in paper mode after built-in `StateManager.resumeTrading()` and restart; eval still blocked |
| Trade The Pool rule engine | Open; no eval flip until rule layer is implemented and verified |
| SessionRouter final architecture | Deferred; keep `SESSION_ROUTER_ENABLED=false` |
| TRAI | Deferred; keep `ENABLE_TRAI=false` until known phantom default paths are fixed |

## Context for Next Session

The latest code head recorded here is `78ba71c`. Dashboard chart and watchlist fixes are live through the web tier. Paused-state entry enforcement, startup entry-state logging, and bot-side Alpaca REST hydration are committed, pushed, deployed, and runtime-verified. The bot PM2 process is online, TSLA 15m boot hydration works, and `data/state.json` now has `isTrading=true`; next session must observe a live-market paper signal/skip path end-to-end before any eval flip.

## Recorder Pipeline Disposition

| Step | Status |
|---|---|
| Warden/scope | Dashboard drops and eval documentation were kept separate from trading-path rule-engine work |
| Forensics | Current PM2, `.env`, git log, and `data/state.json` were inspected before writing this form |
| Architect | Eval rule work was scoped into a separate go/no-go checklist rather than mixed into dashboard fixes |
| Approval | Trey approved dashboard re-drops and requested the session form/checklist path |
| Fixer | Frontend-only fixes landed through copied staged drops plus scoped verification |
| Debugger | Syntax, marker, HTTP asset, PM2, and WebSocket smoke checks were run where applicable |
| Critic | Cowork/Chrome smoke found the watchlist bug and volume restore latency; Mercury found two paused-entry hardening gaps before final clean pass |
| Validator | `git diff --check`, syntax checks, Jest, smoke, Mercury, fast P0, full P0, and PM2 process isolation were verified where applicable |
| Scribe | This session form records May 23 work, paused-entry enforcement, and current blockers |
| Committer | Changes were committed as separate logical commits; code commit `594f023` is the paused-entry rollback point |

## Next Recommended Move

Start with deploy/restart/resume discipline around the current liveness pause. The exact next question is:

> Is the bot paused because the market is closed/quiet and the watchdog state was not cleared, or because the Alpaca TSLA feed/backfill path is still failing?

Answer that with current logs, state, PM2 env, broker session timing, and the liveness watchdog code path before adding new eval-rule code.
