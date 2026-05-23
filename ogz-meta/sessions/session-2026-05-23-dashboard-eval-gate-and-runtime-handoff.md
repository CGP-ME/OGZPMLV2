# Session 2026-05-23 - Dashboard, Eval Gate, And Runtime Handoff

**Branch:** `rebuild/clean-from-baseline`
**Repo:** `/opt/ogzprime/OGZPMLV2`
**Session status:** Dashboard fixes committed and pushed; eval checklist committed and pushed; runtime bot online but internally paused by liveness watchdog.
**Current pushed head:** `e160461` (`Fixed watchlist ticker chart routing`)

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

## Current Runtime Snapshot

Checked after the watchlist deploy:

| Process | Status | PID | Note |
|---|---:|---:|---|
| `ogz-prime-v2` | online | `1120365` | Bot process was not restarted by dashboard deploys |
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
  "isTrading": false,
  "lastError": "Liveness watchdog: No data for 164s, backfill failed",
  "pauseReason": "Liveness watchdog: No data for 164s, backfill failed"
}
```

Important: PM2 being online is not the same as the bot being enabled to trade. The current state file says `isTrading=false` due to a liveness watchdog pause. This must be diagnosed before claiming the runtime is trade-ready.

## Recent Commit Log

Newest first:

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

1. Diagnose the current `isTrading=false` liveness watchdog pause before claiming the bot is trading or ready to trade.
2. Verify whether the liveness pause is expected market-session quiet behavior, stale state from before the broker-aware liveness fix, or a real current data-flow failure.
3. Do not flip eval while `PAPER_TRADING=true`, `LIVE_TRADING=false`, `WEBHOOK_DRY_RUN=true`, and `ACCOUNT_DRAWDOWN_BYPASS=true`.
4. Implement the runtime posture guard: `LIVE_TRADING=true` plus `ACCOUNT_DRAWDOWN_BYPASS=true` must hard-fail startup.
5. Implement the Trade The Pool eval rule layer, starting with the 5 percent previous one-minute volume rule.
6. Implement or explicitly gate the 15:50 ET liquidation/no-new-entry behavior.
7. Keep `SESSION_ROUTER_ENABLED=false` until SessionRouter pattern-bank isolation and cross-asset state rules are complete.
8. Keep `ENABLE_TRAI=false` until TRAI phantom feature defaults and phantom 1 percent position sizing are fixed.
9. Retire or refresh stale frontend staging folders after confirmed deploys so old drops cannot reintroduce fixed bugs.

## Next Recommended Move

Start with the current liveness pause. The exact next question is:

> Is the bot paused because the market is closed/quiet and the watchdog state was not cleared, or because the Alpaca TSLA feed/backfill path is still failing?

Answer that with current logs, state, PM2 env, broker session timing, and the liveness watchdog code path before adding new eval-rule code.
