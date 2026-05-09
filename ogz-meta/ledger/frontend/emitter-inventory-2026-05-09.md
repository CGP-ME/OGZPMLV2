# Bot Emitter Inventory — 2026-05-09

**Audit by:** CC-D. Read-only enumeration of every WebSocket frame the bot emits to the dashboard.
**Cross-ref:** `wolf-cotwerk-extract-2026-05-09.md` (Wolf's panel-side discoveries) + `panel-emitter-mapping-2026-05-09.md`.
**Coverage:** 41 emit sites across `core/`, `run-empire-v2.js`, `ogzprime-ssl-server.js`. Payloads captured where directly read; flagged TBD where extraction not yet done.

---

## Section A — Auth & Handshake Frames

| Type | Direction | Payload | File:Line | Notes |
|---|---|---|---|---|
| `auth` | bot → relay | `{ token: WEBSOCKET_AUTH_TOKEN }` | `WebSocketManager.js:50` | Sent on `open`, before any data |
| `auth_success` | relay → bot | `{ }` | `ogzprime-ssl-server.js:1035` | Triggers `identify` + StateManager wire-up |
| `identify` | bot → relay | `{ source, bot, version, capabilities[] }` | `WebSocketManager.js:94` | Sent after auth_success |
| `identification_confirmed` | relay → bot | `{ }` | `ogzprime-ssl-server.js:1071` | Handshake complete |
| `ping` | bot → relay | `{ timestamp }` | `WebSocketManager.js:295` | Every 15s heartbeat |
| `pong` | relay → bot | `{ }` | `ogzprime-ssl-server.js:1053` | Pong reply |
| `error` | relay → bot | `{ message }` | `ogzprime-ssl-server.js:1004,1019,1042` | Auth/parse failures |

---

## Section B — Live Market Data

| Type | Payload | File:Line | Frequency | Asset-scoped? |
|---|---|---|---|---|
| `price` | `{ price, symbol? }` (Wolf flagged: emitted without `.symbol` filter on dashboard side) | `ogzprime-ssl-server.js:1300` | Every tick | NO at dispatch (type-only handler routing) |
| `delta` | `{ tick: { price, volume, timestamp } }` | `DashboardBroadcaster.js:55` | Every tick (zero-lag chart) | NO |
| `historical_candles` | `{ timeframe, candles: [{t,o,h,l,c,v}], symbol? }` | `run-empire-v2.js:1490,1502,1515`; `ogzprime-ssl-server.js:1119` | On-demand (request_historical) | YES (asset param) |
| `data_feed_status` | TBD | `ogzprime-ssl-server.js:1356` | TBD | TBD |

---

## Section C — Trading Decisions & Strategy State

| Type | Payload (verified) | File:Line |
|---|---|---|
| `signal_analysis` | `{ timestamp, signal: { direction, confidence, reasons[], meta: { signalsFired, bullishCount, bearishCount }, signals[] }, modules: { orchestrator: { winner, direction, confidence, confluence, sizingMultiplier }, regime: { regime, confidence } } }` | `TradingLoop.js:626` |
| `bot_thinking` | `{ timestamp, message, confidence, data: { reasoning, price, regime, module }, strategy_stack: [{ id, realName, name, confidence, direction }], winner_id }` | `TradingLoop.js:650` |
| `golden_setup_state` | `{ proximity (0-1), is_golden (bool), conditions: [{ label, status: 'MET'\|'WAITING', weight }], timestamp }` | `TradingLoop.js:697` |

**Note:** `bot_thinking.strategy_stack` already labels strategies via TradeNarrator (`Strategy-A/B/C` anonymized public names + `realName` for internal use). All configured strategies appear (zero-confidence placeholders for non-firing) — directly satisfies Wolf's G4 "Strategy Battleground all-9" gap on the data side.

---

## Section D — Edge Analytics (DashboardBroadcaster)

All emitted from `core/DashboardBroadcaster.js` `broadcastEdgeAnalytics()`. Single function dispatches multiple frame types based on time intervals.

| Type | Payload | Line | Cadence |
|---|---|---|---|
| `cvd_update` | `{ cvd, buyVolume, sellVolume, timestamp }` | 68 | Every tick |
| `liquidation_data` | `{ levels: { long: { price, volume }, short: { price, volume } }, currentPrice, timestamp }` | 110 | Every 10s |
| `whale_trade` | `{ size (USD), price, side: 'BUY'\|'SELL', timestamp }` | 133 | When volume > 5× avg |
| `market_internals` | `{ buySellRatio, aggressor: 'BUYERS'\|'SELLERS'\|'NEUTRAL', bookImbalance, spread, timestamp }` | 157 | Every 5s |
| `funding_rate` | `{ current, predicted, timestamp }` | 175 | Every 60s |
| `fear_greed` | `{ value (0-100), timestamp }` | 202 | Every 30s |
| `divergence` | `{ divergences: [...], timestamp }` | 216 | Every 15s when found |
| `smart_money` | `{ flow: 'NEUTRAL'\|'ACCUMULATING'\|'DISTRIBUTING', activity: 'HIGH'\|'MEDIUM'\|'LOW', dormancy, timestamp }` | 240 | Every 20s |

**Bug to flag:** Edge Analytics is NOT asset-scoped (Wolf's G13). Emits for whatever asset the bot is currently processing.

---

## Section E — State & Position

| Type | Payload | File:Line |
|---|---|---|
| `state_update` | `{ ...stateUpdates, _context }` (full state delta from StateManager) | `StateManager.js:1308` |

Triggered:
- On every state mutation via `broadcastToDashboard(updates, context)`
- On dashboard WS connect (hydrate, shipped at commit `5dc2ed4`): `setDashboardWs()` calls `broadcastToDashboard({}, { reason: 'dashboard_connect' })`

State fields hydrated (per E2E doc §2):
- `balance`, `activeTrades` (Map), `realizedPnL`, `unrealizedPnL`, `position`, plus more

---

## Section F — Trade Lifecycle (OrderExecutor — payloads TBD)

| File:Line | Status |
|---|---|
| `OrderExecutor.js:429` | TBD — likely entry/order placed |
| `OrderExecutor.js:596` | TBD — likely fill confirmation |
| `OrderExecutor.js:824` | TBD — likely position update / exit |
| `OrderExecutor.js:1230` | TBD — likely close / journal |

**Next step on wiring trade-log + open-positions panels:** read these 4 sites, capture exact frame types + payloads, add to this inventory.

---

## Section G — Asset / Multi-Asset

| Type | Payload | File:Line |
|---|---|---|
| (TBD) | TBD | `MultiAssetManager.js:310` — likely asset_switched / asset_state |

---

## Section H — Trade Journal Bridge

| Type | Payload | File:Line |
|---|---|---|
| (multiple, TBD) | TBD — likely `journal_breakdown`, `journal_calendar`, `journal_equity`, `journal_export_complete`, `journal_snapshot` (seen in earlier grep) | `TradeJournalBridge.js:277` |

---

## Section I — Candle Pipeline

| Type | Payload | File:Line |
|---|---|---|
| (TBD) | TBD | `CandleProcessor.js:559` — likely candle bar event |

---

## Section J — Event Loop / Health Monitoring

| Type | Payload | File:Line |
|---|---|---|
| `event_loop_monitor` | TBD | `EventLoopMonitor.js:265` |
| `event_loop_warning` | TBD | (seen in grep) |
| `event_loop_critical` | TBD | (seen in grep) |

---

## Section K — Dashboard Commands (Inbound bot ← dashboard)

Handled in `WebSocketManager.js` `dashboardWs.on('message')`:

| Type | Payload | Handler |
|---|---|---|
| `timeframe_change` | `{ timeframe }` | `WebSocketManager.js:142` → `fetchAndSendHistoricalCandles()` |
| `request_historical` | `{ timeframe, limit }` | `WebSocketManager.js:153` |
| `asset_change` | `{ asset }` | `WebSocketManager.js:163` → `assetManager.switchAsset()` |
| `command` | `{ command, ... }` various subcommands: | `WebSocketManager.js:171` |
| ↳ `command:switch_profile` | `{ profile }` | Returns `profile_switched` |
| ↳ `command:get_profiles` | `{ }` | Returns `profiles_list` |
| ↳ `command:set_confidence` | `{ confidence }` | (no response) |
| ↳ `command:pause_trading` | `{ reason }` | Returns `pause_confirmed` |
| ↳ `command:resume_trading` | `{ }` | Returns `resume_confirmed` |
| `trai_query` | `{ query }` | TRAI handler (chain of thought response) |

---

## Section L — Narrator / Pattern / TRAI (NOT YET EXTRACTED)

These types appeared in the v2 panel cleanup commits or in the deepsearch panel-target list, but their emit sites haven't been opened yet:

- `narrator_event` — emitted by TradeNarrator (wired via `getNarrator().setWebSocketClient()` at `WebSocketManager.js:117`); USER_NARRATOR env flag gates whether it broadcasts
- `pattern_analysis` — emitted by EnhancedPatternRecognition (loaded via ModuleAutoLoader)
- `trai_thinking` / TRAI broadcasts — wired via `this.ctx.trai.setWebSocketClient()` at `WebSocketManager.js:111`

**Next step on wiring chain-of-thought + pattern-card panels:** grep for these emitters in `core/TradeNarrator.js`, `core/EnhancedPatternRecognition.js` (or wherever loaded), capture payload shapes, add to inventory.

---

## Summary

- **Verified payload shapes:** 7 auth + 4 market + 3 trading-decision + 8 edge analytics + 1 state + 11 inbound commands = **34 frame schemas locked**
- **TBD payload extraction:** 4 trade lifecycle (OrderExecutor) + 1 multi-asset + 5 journal + 1 candle + 3 event-loop + 3 narrator/pattern/TRAI = **17 emitters still need on-demand extraction**

The TBD inventory items get extracted as we wire each panel that needs them — JIT discovery rather than upfront completion. The 34 locked schemas already cover the majority of v2 mount divs (chart, edge analytics rail, golden proximity, strategy stack, bot thinking, state/balance, historical loading).
