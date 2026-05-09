# Dashboard V2 Gap Report — 2026-05-09

**Audit by:** CC-D. Synthesis of bugs, missing wirings, missing emissions, and missing panels — what blocks v2 from reaching parity with monolith functionality (without inheriting the monolith's spaghetti).

---

## Critical (real-money or operator-misleading)

### C1. Asset-Identity Divergence — chart shows TSLA, panels render BTC
- **Source:** Wolf live observation, cross-confirmed by `IndicatorEngine` hardcoded symbol root cause
- **Symptom:** `size-preview.js:274` reads `data.price` without `.symbol` guard; `IndicatorEngine` (`core/indicators/IndicatorEngine.js`) hardcoded `symbol: 'BTC-USD'` doesn't reset on SessionRouter asset swap
- **Impact:** If operator hits BUY while chart shows TSLA, sizer math is BTC. Stop-loss distance, position size, and risk all wrong.
- **Fix needed (frontend, CC-D scope):** Add `data.symbol === currentAsset` guards at every `price`-subscribing panel — `size-preview`, header-strip ticker, OHLC readout, any other `price` consumer.
- **Fix needed (backend, CC-C scope):** Ensure `IndicatorEngine.reset(newSymbol)` fires inside `SessionRouter.switchAsset()` flow. Or refactor IndicatorEngine to take symbol per-call rather than constructor.
- **Status:** Frontend half is in CC-D's autonomous scope; backend half blocked on CC-C.

---

## High (functional but incorrect / regression risk)

### H1. `chart-panel.js` Single-Register Breaks `OGZ.get('Chart')`
- **Symptom:** `chart-panel.js:1397,1402` registers only as `'ChartPanel'`. `core.js` does `OGZ.get('Chart')` at chart-bound consumer sites → returns `undefined` → every `price`/`historical_candles` event short-circuits silently.
- **Fix:** Add `OGZ.register('Chart', ChartPanel);` after line 1397. One-line additive.
- **Status:** Proposed, awaiting go.

### H2. `websocket.js:49-50` Reads Legacy IDs, Misses V2 Selectors
- **Symptom:** Reads `assetSelector` / `timeframeSelector` (legacy IDs from monolith) but v2 chart-panel uses `cp-assetSelector` / `cp-timeframeSelector`. Falls back to TSLA/15m hardcoded.
- **Fix:** Two-line change to read v2 IDs first, fall back to legacy:
  ```js
  const asset = document.getElementById('cp-assetSelector')?.value
             || document.getElementById('assetSelector')?.value
             || 'TSLA';
  const tf    = document.getElementById('cp-timeframeSelector')?.value
             || document.getElementById('timeframeSelector')?.value
             || '15m';
  ```
- **Status:** Proposed, awaiting go.

### H3. StateManager Hydrate-on-Connect Shipped to Disk, Bot Not Restarted
- **Source:** Commit `5dc2ed4` adds `broadcastToDashboard({}, { reason: 'dashboard_connect' })` to `setDashboardWs()` so panels populate on cold WS connect (no more `$--.--`)
- **Status:** **On disk, not active.** Bot restart required, deferred to coordinate with CC-C's uncommitted symbol-context WIP.
- **Action:** When CC-C's Multi-Symbol Commits 5/6 + 6/6 land and they restart `ogz-prime-v2`, this fix activates automatically.

---

## Medium (cosmetic, polish, or clarity)

### M1. "Learning Pattern" Placeholder Shown at Confidence=0
- **Source:** Wolf BUG #5
- **Fix:** When `pattern_analysis.confidence === 0`, render "No pattern detected — scanning..." not the placeholder name.

### M2. No Symbol Label on Chart
- **Source:** Wolf BUG #4
- **Fix:** chart-panel renders the active asset name in chart corner / header.

### M3. OHLC Readout Duplicated 3+ Places
- **Source:** Wolf BUG #1 / G5
- **Fix:** Pick one canonical location, remove the others. Likely the chart-corner OHLC, drop the redundant ones in edge analytics.

### M4. Stray Green/Black Blob Right of LIVE READOUTS
- **Source:** Wolf BUG #6 (z-index bleed from chat widget)
- **Fix:** Inspect z-index stack, identify offender, scope it.

### M5. `npm run dashboard` Script Name Mismatch
- **Source:** Wolf BUG #2
- **Fix:** Either rename file to `ogzprime_ssl_server_advanced.js` OR update `package.json:11` to point at `ogzprime-ssl-server.js`. Latter is cleaner.

### M6. `/api/health` Missing `commit` Field
- **Source:** Wolf BUG #7
- **Fix:** Add `commit: process.env.GIT_COMMIT || require('child_process').execSync('git rev-parse HEAD').toString().trim()` to `ogzprime-ssl-server.js:942-952` health response.

---

## Wiring Gaps (panel exists, no subscription)

| # | Panel | Mount | Missing wiring |
|---|---|---|---|
| W1 | trade-log | `#tradeLog` | OrderExecutor close-event subscription (payload TBD at `OrderExecutor.js:1230`) |
| W2 | strategy-leaderboard | TBD | Should subscribe to `bot_thinking.strategy_stack` and render all entries (not slice top-5) |
| W3 | chain-of-thought | `#chainOfThought` (line 582) | `narrator_event` subscription (payload TBD in `core/TradeNarrator.js`) |
| W4 | pattern-card | TBD | `pattern_analysis` subscription (payload TBD) |
| W5 | indicators-bar | TBD | `signal_analysis.modules` field-level wiring + verify RSI/MACD payload location |
| W6 | size-preview | `#sizePreview` | `state_update.balance` + ATR (currently only `price`, blind to asset) |

---

## Missing Emissions (data needed but bot doesn't publish)

| # | Need | Consumer | Fix scope |
|---|---|---|---|
| E1 | Per-symbol price for all 9 watchlist tickers in parallel | Watchlist panel (Wolf G2) | Bot-side (CC-C lane) — extend MultiAssetManager to broadcast per-symbol price snapshots |
| E2 | Per-strategy session stats (trades / P&L / winrate) | Strategy Battleground all-9 view (Wolf G4) | Bot-side — emit `strategy_session_stats` from PerformanceAnalyzer |
| E3 | Live equity time-series for curve | Equity Curve panel (Wolf G10) | Bot-side — emit `equity_history` snapshots (or extract from `journal_equity` if it carries time-series) |
| E4 | Last unplanned crash timestamp + cumulative ops hours | System Health enhanced (Wolf G11) | Bot-side — Supervisor module surfaces this; needs emit added |
| E5 | Per-asset isolation in Edge Analytics emissions | All edge analytics panels (Wolf G13) | Bot-side — DashboardBroadcaster needs `symbol` field on every emission |

**Key insight:** All of these are bot-side additions = CC-C lane. CC-D can wire panels to consume them once emitted. **Recommend grouping E1-E5 into a single CC-C spec doc** so they're added together rather than piecemeal.

---

## NEEDS-NEW-PANEL (build from scratch)

| # | Panel | Wolf gap | Priority | Notes |
|---|---|---|---|---|
| N1 | Watchlist (9-ticker scanner) | G2 | HIGH | Centerpiece UI for multi-ticker vision; blocks demo of bot's actual capability |
| N2 | Strategy Battleground all-9 grid | G4 | MEDIUM | Data exists in `bot_thinking.strategy_stack`; just needs richer UI than top-5 heatbar |
| N3 | Pattern Card with SVG + WHY + history | G7 | MEDIUM | Phase 2 feature; basic name+confidence works without it |
| N4 | TRAI Brain persistent panel | G8 | MEDIUM | Module exists, just needs UX promotion from popup to rail |
| N5 | Account Selector (multi-Apex toggle) | G9 | LOW | Reserve UI slot; not needed until 20-Apex deploy |
| N6 | Equity Curve live-updating | G10 | MEDIUM | Module exists in cleanup ledger; needs E3 emission |
| N7 | Trade Replay | (Wolf 6-phase plan #4) | LOW | NEW module in cleanup ledger; exists, needs install |

---

## Architectural Concerns from E2E Doc

These are noted-but-not-blocking for dashboard work. They affect what data the bot can reliably emit:

- **`IndicatorEngine` doesn't reset on asset swap** (root cause of C1)
- **`PnLCalculator` / `PositionSizer` / `PositionTracker` instantiated but never called** in TradingLoop or OrderExecutor — don't try to subscribe to their outputs
- **`TradeIntelligenceEngine` in shadow mode** — never affects decisions, don't render its state as authoritative
- **Multiple strategy modules dual-instantiated** (bot ctor + StrategyOrchestrator) — always source strategy state from Orchestrator's instances, not bot's
- **`CandleAggregator` is a dead import** — removing it would clean boot order
- **`BreakAndRetest.evaluate()` always returns null** (disabled at line 330) — strategy-leaderboard should expect this strategy to always show 0% confidence

---

## Audit Output Summary (3 artifacts produced)

1. `ogz-meta/ledger/frontend/wolf-cotwerk-extract-2026-05-09.md` — distilled Wolf findings
2. `ogz-meta/ledger/frontend/emitter-inventory-2026-05-09.md` — bot emit-site catalog (34 schemas verified, 17 TBD)
3. `ogz-meta/ledger/frontend/panel-emitter-mapping-2026-05-09.md` — v2 panel → emitter target table
4. `ogz-meta/ledger/frontend/gap-report-2026-05-09.md` — this doc

All in `ledger/`, Mercury-excluded per the canonical-truth rule. Read-only; no source code touched.

---

## Recommended Pattern-Proof First Commit

To validate the methodology before driving the rest panel-by-panel:

**Wire `chain-of-thought` panel to `narrator_event` emitter.**

Why this one first:
- Smallest scope (single emitter, single panel, single mount div)
- `USER_NARRATOR=true` flag is already set per Wolf — emission active, no bot-side work
- Mount div confirmed at `unified-dashboard-v2.html` line 582
- Module file exists in cleanup ledger pending install
- Visual verification trivial: trigger any narrator event, watch v2 panel populate

If the chain-of-thought commit lands clean and renders correctly, the same panel-by-panel discipline scales to the rest of the queue.

**Standing law:** No code shipped without your explicit go on this audit's findings.
