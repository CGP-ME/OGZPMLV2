# V2 Panel → Emitter Mapping — 2026-05-09

**Audit by:** CC-D. For each `unified-dashboard-v2.html` mount div, identifies the bot emitter(s) that should populate it, current wiring status, and the work to bring it online.

**Source:** `public/unified-dashboard-v2.html` (744 lines, 17 mount divs) + `emitter-inventory-2026-05-09.md` + Wolf's panel mappings + the deepsearch panel-target list.

**Status legend:**
- **WIRED** — module subscribes correctly, panel renders real data
- **MOUNTED-BLANK** — div exists, module loads, but no WS subscription wired (Wolf's "code exists dormant" pattern)
- **WRONG-EMITTER** — subscribed but wrong type or wrong fields (renders garbage)
- **NEEDS-NEW-EMISSION** — bot doesn't currently emit the data this panel needs
- **NEEDS-NEW-PANEL** — module file doesn't exist yet (build from scratch)

---

## Right Rail Panels (per deepsearch prompt order)

### 1. Chart (chart-panel)
- **Mount:** `<div id="chartContainer">` (chart-panel module renders into it)
- **Module:** `public/js/panels/chart-panel.js`
- **Emitters:** `historical_candles`, `price`, `delta` (zero-lag tick)
- **Status:** **WIRED** for `historical_candles` + `price`. Two outstanding bugs (per earlier proposed fixes awaiting your go):
  - `chart-panel.js` only registers as `'ChartPanel'`, not `'Chart'` — `OGZ.get('Chart')` returns undefined
  - `websocket.js:49-50` reads legacy `assetSelector` ID, not v2's `cp-assetSelector`
- **Wolf-flagged:** No symbol label visible on chart (BUG #4)
- **Action:** Apply the two pending fixes, verify chart renders with cp-* IDs.

### 2. Pattern Analysis Card (pattern-card)
- **Mount:** `<div id="patternCard">` or similar (verify in shell)
- **Module:** `public/js/panels/pattern-card.js` (refresh in cleanup ledger pending install)
- **Emitter:** `pattern_analysis` (TBD payload extraction)
- **Status:** **MOUNTED-BLANK** — refresh exists, payload extraction needed before wiring
- **Wolf gap:** G7 — needs SVG shape + WHY description + recent W/L list (Phase 2 enhancement, not P0)
- **Wolf bug:** "Learning Pattern" placeholder shown when confidence=0; should read "No pattern detected"
- **Action:** Install cleanup ledger refresh, extract `pattern_analysis` payload, wire to display name+confidence, fix placeholder string.

### 3. Performance Stats (Total P&L / Win Rate / Trades / Confidence)
- **Mount:** TBD (verify)
- **Emitter:** `state_update` fields (`balance`, `realizedPnL`, `activeTrades.size`, win/loss counters from StateManager)
- **Status:** **WIRED via header-strip cleanup** (commit `6a63700`) for some of these; needs verification each metric maps correctly.
- **Action:** Verify rendering by hard-refresh smoke side-by-side with monolith.

### 4. Indicators Bar (RSI / MACD / Pattern / Vol / ATR / Conf)
- **Mount:** TBD
- **Emitter:** `signal_analysis.modules.regime` + indicator fields (regime + confidence verified; RSI/MACD payload TBD — likely in `signal_analysis` or separate)
- **Status:** **MOUNTED-BLANK** likely; needs verification.
- **Action:** Inspect what fields `signal_analysis` actually carries vs. what indicators panel expects.

### 5. Size Preview (size-preview)
- **Mount:** `<div id="sizePreview">` (per earlier audit)
- **Module:** `public/js/panels/size-preview.js`
- **Emitter:** `price` (current) + needs `state_update.balance` + ATR/SL%
- **Status:** **WRONG-EMITTER** — Wolf's CRITICAL bug. Reads `data.price` blindly without `.symbol` filter.
- **Root cause:** `IndicatorEngine` hardcoded `BTC-USD`, doesn't reset on SessionRouter asset swap.
- **Action:** Add `data.symbol === currentAsset` guard at `size-preview.js:274`. Also requires fixing the upstream `IndicatorEngine.reset()` call in SessionRouter (out of scope for CC-D — flagged for CC-C).

### 6. Trade Log (trade-log)
- **Mount:** `<div id="tradeLog">` (verify)
- **Module:** `public/js/panels/trade-log.js` (registers as `TradeLog` per `trade-log.js:133`)
- **Emitter:** OrderExecutor lifecycle frames (TBD payloads at lines 429/596/824/1230)
- **Status:** **MOUNTED-BLANK** — needs OrderExecutor emit-site read to identify trade_closed / position_closed type name
- **Action:** Open `OrderExecutor.js:1230` first (likely the close/journal event), capture payload, wire trade-log to subscribe.

### 7. Strategy Leaderboard / Battleground
- **Mount:** TBD (currently Wolf says heatbar shows top-5 only)
- **Module:** `public/js/panels/strategy-leaderboard.js` (already on disk, status unknown)
- **Emitter:** `bot_thinking.strategy_stack` (already carries ALL configured strategies w/ zero-confidence placeholders for non-firing) — perfect data source
- **Status:** **MOUNTED-BLANK or PARTIAL** — payload already supports all-9 view per `TradingLoop.js:670`
- **Wolf gap:** G4 — needs all-9 grid w/ session stats per strategy
- **Action:** Verify panel subscribes to `bot_thinking.strategy_stack`, render all entries (not slice top-5). Session stats per-strategy (trades/PnL/winrate) need additional emission — flag as NEEDS-NEW-EMISSION.

### 8. Chain of Thought (chain-of-thought)
- **Mount:** `<div id="chainOfThought">` (line 582 per earlier audit)
- **Module:** `public/js/panels/chain-of-thought.js` (refresh in cleanup ledger pending install)
- **Emitter:** `narrator_event` (TBD payload — narrator wired via `WebSocketManager.js:117`)
- **Status:** **MOUNTED-BLANK** — `USER_NARRATOR=true` flag is set per Wolf (good — emission active), panel just needs subscription
- **Wolf gap:** G6 — should be prominent streaming display, not buried
- **Action:** Install cleanup refresh, read `core/TradeNarrator.js` for `narrator_event` payload shape, wire subscription. **First commit pattern-proof candidate.**

---

## Left Rail (Edge Analytics)

### 9. Liquidation Levels
- **Emitter:** `liquidation_data` (verified payload: `{ levels: { long, short }, currentPrice }`, every 10s)
- **Status:** WIRED status TBD; emission is asset-agnostic (Wolf G13)

### 10. CVD (Order Flow)
- **Emitter:** `cvd_update` (verified payload: `{ cvd, buyVolume, sellVolume }`, every tick)
- **Status:** WIRED status TBD

### 11. Funding Rates
- **Emitter:** `funding_rate` (verified payload: `{ current, predicted }`, every 60s)
- **Status:** WIRED status TBD

### 12. Whale Activity
- **Emitter:** `whale_trade` (verified payload: `{ size, price, side, timestamp }`, on >5× volume)
- **Status:** WIRED status TBD

### 13. Market Internals
- **Emitter:** `market_internals` (verified payload: `{ buySellRatio, aggressor, bookImbalance, spread }`, every 5s)
- **Status:** WIRED status TBD

### 14. Smart Money Tracking
- **Emitter:** `smart_money` (verified payload: `{ flow, activity, dormancy }`, every 20s)
- **Status:** WIRED status TBD

### 15. Fear & Greed Gauge
- **Emitter:** `fear_greed` (verified payload: `{ value: 0-100 }`, every 30s)
- **Status:** WIRED status TBD

### 16. Hidden Divergences
- **Emitter:** `divergence` (verified, every 15s when found)
- **Status:** WIRED status TBD

---

## Header / HUD

### 17. Header Strip (price + balance + session)
- **Module:** `public/js/panels/header-strip.js` (cleaned up at commit `6a63700`)
- **Emitters:** `price`, `state_update.balance`, session phase
- **Status:** **WIRED** to real emitters per cleanup commit; verify against monolith
- **Wolf bug to fix:** Top-left ticker shows wrong asset (BTC last digits when chart is TSLA) — same root cause as Size Preview, asset filter needed

### 18. Golden Proximity Bar
- **Emitter:** `golden_setup_state` (verified payload: `{ proximity, is_golden, conditions[] }`)
- **Status:** Module status TBD; emitter is live and ready
- **Action:** Verify mount + subscription

---

## NEEDS-NEW-PANEL (per Wolf gaps + deepsearch list)

### W1. Watchlist Panel (Wolf G2 — CRITICAL for multi-ticker vision)
- 9-ticker scanner: symbol + broker badge + price + %move + state pill + sparkline
- **Emitter needed:** Per-symbol price + state — currently bot emits `price` for active asset only
- **NEEDS-NEW-EMISSION** to broadcast all 9 ticker prices in parallel
- Out of CC-D's autonomous scope (touches bot emit surface) — flag for joint CC-C/CC-D session

### W2. TRAI Brain Persistent Panel (Wolf G8)
- Module: `public/js/panels/trai-brain.js` (cleaned up at commit `b6d1fac`)
- Status: **WIRED** but needs UX promotion from popup chat to right-rail
- Action: Verify trai-brain panel renders into a dedicated mount div, not floating popup

### W3. Equity Curve (Wolf G10)
- Module: `equity-curve.js` (refresh in cleanup ledger pending install)
- **Emitter:** `state_update.equityHistory` or `journal_equity` (TBD)
- Action: Install cleanup refresh, identify equity time-series source

### W4. System Health Strip (Wolf G11 — minimal version exists)
- Module: `system-health.js` (cleaned up at commit `3838aae`)
- Status: **WIRED** to bot/data emitters
- Wolf wants more: distinguish current-session uptime vs. last unplanned crash + cumulative ops hours + per-broker WS status
- Action: Verify current state, propose enhancements as separate commit

### W5. Trade Replay
- Module: `trade-replay.js` (NEW in cleanup ledger, pending install)
- Action: Install fresh, wire to `state_update.activeTrades` + journal events

---

## Action Sequence (proposed, await go)

**P0 — Pattern proof first commit** (smallest, highest signal):
1. Wire **chain-of-thought** to `narrator_event` — verify side-by-side with monolith. Single commit, single push.

**P0 — High-impact bug fixes** (already proposed, awaiting go):
2. `chart-panel.js` dual-register fix (Wolf bug fix, restores `OGZ.get('Chart')`)
3. `websocket.js` cp-* ID fallback (restores v2 chart asset/timeframe selection)

**P1 — Cleanup ledger refresh installs** (one panel = one commit):
4. `celebration.js` refresh
5. `chain-of-thought.js` refresh (combined with #1 if same commit makes sense)
6. `edge-analytics-panel.js` refresh
7. `equity-curve.js` refresh
8. `news-ticker.js` refresh
9. `pattern-card.js` refresh
10. NEW `trade-replay.js` + `.css` + 8-line shell wiring

**P1 — Verification + payload extraction** (per panel as we wire):
- Verify each Edge Analytics rail panel against verified emitter payloads (Section D)
- Open OrderExecutor emit sites (lines 429/596/824/1230), capture payloads, wire trade-log
- Open MultiAssetManager + TradeJournalBridge + CandleProcessor + EventLoopMonitor + TradeNarrator + EnhancedPatternRecognition emit sites JIT

**P2 — Asset-isolation fix** (joint CC-D/CC-C):
- Frontend: add `data.symbol === currentAsset` guards at all `price`-subscribing panels (size-preview, header-strip ticker, OHLC readout)
- Backend (CC-C lane): ensure `IndicatorEngine.reset()` fires on SessionRouter asset swap
- Verify: chart=TSLA, bot trades BTC → all panels show TSLA, no BTC math leakage

**P2 — New panels** (Wolf gaps W1-W5):
- Sequence after pattern-proof works and you're back from Terminus

---

## Key Cross-Reference: Architecture Constraints

From E2E doc (`ogz-meta/UPDATED-E2E-OGZPRIME-AND-MUTATIONS-DEADCODE.md`):

- **DashboardBroadcaster is module #17 in boot order** — skipped if `pipeline.enableDashboard=false`. Verify this flag is `true` before declaring panels broken.
- **StateManager is singleton via `getInstance()`** — module #23. Mutations go through `updateState()` for atomicity. Frontend hydrates on `setDashboardWs()` connect (commit `5dc2ed4`).
- **IndicatorEngine** (module #27) has hardcoded `symbol: 'BTC-USD'` and **does not reset on SessionRouter asset swap** until `reset()` is called. This is the root of Wolf's chart=TSLA/bot=BTC bug.
- **TradeIntelligenceEngine** is in shadow mode — never affects decisions. Don't wire dashboard to its output expecting trading state.
- **PnLCalculator, PositionSizer, PositionTracker** (Phase 13A) are instantiated but **not called in TradingLoop or OrderExecutor** — unused in hot path. Don't subscribe to their outputs.
- **Multiple strategy modules** are dual-instantiated (bot constructor + StrategyOrchestrator). Wire strategy state from Orchestrator's instances (canonical), not bot's. `bot_thinking.strategy_stack` already does this correctly via `this.ctx.strategyOrchestrator.strategies`.
