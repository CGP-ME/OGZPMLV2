# Session Handoff: Dashboard Punch List + Asset-Isolation Auto-Flip

**Date:** 2026-04-27 → 2026-04-28
**Branch:** `alpaca/stocks-paper-flip`
**Last Commit (this workstream):** `58f7e3a` — fix(chart): force price-axis rescale on symbol swap
**Phase 0 Baseline:** `$17,551.91169513058 / 1265 trades / 778W / 487L / 61.5% WR / 2.66% MaxDD / 2.67 PF` (unchanged — no core-trade-logic changes in this workstream)
**Companion Doc:** `session-2026-04-27-mercury-audit-cycle-no-deferred.md` covers the parallel resilience-stack audit work; this doc covers the dashboard + asset-isolation workstream.

---

## What Was Done This Session

Three intertwined arcs: (1) ship the 9-item DeepSearch punch list against the dashboard, (2) chase down asset-isolation bugs that surfaced once SessionRouter went live (multi-symbol bleed → phantom math → state poisoning), (3) dial in the post-swap UX so the dashboard auto-flips brokers without user intervention. The work spans the morning's stale-state debacle (bot was running pre-reset code at 9:30 ET → BTC indicator state contaminated TSLA processing) through the afternoon's clean transition + into the evening of dashboard polish.

### 1. DeepSearch Punch List — Round 1 (IP cleanup + visible-text wins)

**Round 1 commits:** `8ba9c17`, `36cb748`, `8390a03`, `06ec17c`

- `#confidence` label disambiguation across 3 panels: "Confidence" → "Pattern Conf" (Performance Stats), "Conf:" → "Live:" (Indicators bar), Chain of Thought stays as full sentence. Plus the unit-mismatch bug at `core/TradingLoop.js:524` — `minConfidence` is 0-1, was being rendered as `0.5%` instead of `50%`. Now multiplies by 100.
- IP exposure stripped: `size-preview.js:232` lost the "Live bot uses its own DynamicPositionSizer" disclaimer. `strategy-leaderboard.js:244` lost "Backend fix queued (OrderExecutor strategy/exitStrategy fields)" — replaced with neutral "Awaiting strategy attribution…".
- Plain-English labels on the size preview: Notional → Position $, 1R loss → Max Loss, SL dist → Stop Distance.
- Trade Log rebuilt as 4-column grid (side / price / P&L / time) with green/red coloring + faint row tint. Was 3-column with no P&L visible at all.
- `totalPnL` rendering fix at `core.js:144-152` — bright `#22c55e` / `#ef4444`, weight 900, so `+$0.00` doesn't read as `-$0.00`.
- Risk Gauge + Size Preview equity field — backend renamed `balance → equity` on price events (CandleProcessor:430), dashboard consumers were still reading `data.balance` and getting `undefined`. Fixed at `risk-gauge.js:461` + `size-preview.js:242` to prefer `data.equity` with `data.balance` fallback.
- Indicators bar uncramped — was 7 inline `<span><b>label:</b> value</span>` in flex-wrap with gap:8px. Now 2-column grid with vertical label/value stack, label in 9px caps, value in 13px JetBrains Mono.

### 2. Asset-Isolation: Multi-Symbol Bleed → Phantom Math

The morning's BUY trades logged as "TSLA @ $663.97" where $663.97 was actually QQQ's price — bot was contaminated by bars from all 7 stockSymbols (TSLA/SPY/QQQ/NVDA/COIN/MARA/RIOT). 1486 shares × $664 = $987K phantom notional on a $10K account; closing those phantoms credited absurd PnL.

**Multi-symbol bleed kill at `a2fc66c`:**
- `SessionRouter._activateStocks` and `_transitionToStocks` used to loop ALL stockSymbols calling `subscribeToCandles` per-symbol — but CandleProcessor processes ONE candle stream at a time. Bars from MARA ($11) and QQQ ($664) contaminated TSLA's history.
- Mirror the crypto pattern (already correct at L313 — subscribes to `cryptoSymbols[0]` only). Subscribe to `stockSymbols[0]` = TSLA only.

**State.json poison (still open):**
- `realizedPnL: 8281552.298619513`, `totalPnL: 8341318.503339388` — phantom-math residue from morning bleed period now persisted on disk.
- `closedTrades` array fix at `5eceea6` — was being READ for win-rate math at CandleProcessor:409, **never WRITTEN** anywhere in the codebase. closePosition() now records every full-close with `tradeId / pnl / pnlPercent / direction / entry+exit / strategy / holdMs`. Win rate will populate going forward.
- Open: state.json needs zeroing of `realizedPnL`, `totalPnL`, `tradeCount`, `dailyTradeCount` to clear the $8M phantom number (paper account, balance: 10000 stays). Awaiting Trey's green-light.

### 3. Asset-Isolation: Post-Swap Auto-Flip Chain

After SessionRouter swaps brokers, three independent symbol-aware paths must keep the dashboard honest. Each was missing or broken:

**`historical_candles` carries `symbol`** (`e6526c0`):
- `fetchAndSendHistoricalCandles` previously read `assetManager.activeAsset` (env-driven, often "TSLA"), but dispatched via `this.kraken` (SessionRouter active broker). Symbol and broker desynced after-hours: TSLA dispatched via KrakenIBroker → "Unknown asset pair" → no candles broadcast → dashboard kept whatever it had cached.
- New resolution priority: caller override → SessionRouter active session primary symbol → assetManager → tradingPair fallback.
- Broadcast now includes `symbol` field. Dashboard's `historical_candles` handler at `core.js:256` updates `.asset-tf-card__symbol` + `#symbolSelector` + `#assetSelector` (added at `970501c`) when the symbol changes.

**`price` event carries `symbol`** (`04129a1`):
- Asset-tf-card subscribes to `price` events for live symbol updates (`syncSymbolFromPriceEvent` at `asset-tf-card.js:55`), but CandleProcessor's price broadcast didn't include a `symbol` field — wire was a no-op. Card only updated when user manually changed the dropdown.
- Now every tick carries `data.symbol` resolved via the same SessionRouter→assetManager→tradingPair chain. Card auto-flips ~1-3s after a swap, no dashboard interaction needed.

**Top-right `#assetSelector` flip on price tick** (`970501c`):
- The chart's main asset dropdown (`#assetSelector` — different from `#symbolSelector`) drives the chart context. Stayed locked to TSLA after swap. Now flips on every price tick when `data.symbol` changes, tolerating BTC/USD ↔ BTC-USD format differences.

**Price-axis rescale defense** (`58f7e3a`):
- After symbol swap (TSLA $366 → BTC $76K), `setData` correctly replaces candles, but if the user previously dragged the price axis it enters "free scale" mode and stays locked at the old range. Chart shows BTC bars but y-axis label still reads $300-380.
- Defense: after `setData`, re-assert `priceScale.autoScale=true` and call `timeScale.fitContent()` so the visible window snaps to the new data's range.

**SessionRouter cold-boot pickup** (`6dea109`, follow-up to `2c1b694` and `1ff4023`):
- Third manifestation of the broker-abstraction-leak class (after watchdog backfill + cold-boot candle-history). The 'transition' listener at `run-empire-v2.js:643` only fires on broker SWAPS, not initial activation. Stocks-active boot left `this.kraken` pointing at krakenAdapter; CandleProcessor.attemptBackfill (L146) tried to fetch TSLA from Kraken → "Unknown asset pair" → halted trading on every gap.
- After `sessionRouter.start()` returns, immediately sync `this.kraken = sessionRouter.activeBroker`.

### 4. Pattern Confidence Honesty (two floors removed)

Trey: "pattern confidence is still 10% — never seen it change."

- `EnhancedPatternRecognition.js:371` had `confidence: result?.confidence || 0.1` — defensive 10% floor that leaked through to the dashboard. Fixed at `797331a` (`?? 0` instead).
- Surfaced a SECOND floor at `UnifiedPatternMemory.js:783` — returned `confidence: 0.1` for unknown patterns. The first fix's `?? 0` was correct but received a real 0.10 from upstream. Fixed at `970501c` — unknown patterns now return `confidence: 0`.
- Pattern entry still pushed (learning engine still gets the record). Just confidence value is now honest.

### 5. Strategy Battleground / Heatbar — Show ALL Strategies + IP Shield

Trey: "I think I've only ever seen it say EMA crossover."

- `TradingLoop.js` was sending `strategy_stack` derived from `orchResult.allResults` — and StrategyOrchestrator only pushes strategies to results[] when they return `direction + confidence > 0` (StrategyOrchestrator.js:719). Strategies that returned null/0 silently disappeared.
- `53c7a82` enriches the broadcast with the FULL configured-strategy list (zero-confidence placeholders for non-firing strategies). Sorted by confidence descending so winner stays at top.
- `19f8809` adds IP shield: real strategy names go through `TradeNarrator.labelFor()` (deterministic seed-pinned `EMASMACrossover → Strategy-A` mapping). Heatbar + battleground + leaderboard now consistent. Real name kept on the wire as `realName` for internal tooling.

### 6. Chain of Thought Live + Narrator Stack

`19f8809` enabled USER_NARRATOR=true in .env + pinned NARRATOR_LABEL_SEED=ogzprime-prod-2026 so Strategy-A/B/C labels are stable across restarts. Narrator was constructed (singleton created on first getNarrator() call) but every emit path checked `if (narrator.enabled)` and silently no-op'd without the env flag. Chain of Thought now populates with sanitized customer-facing narration.

### 7. Chart Wheel + Adaptive Container

- `63179a0` — chart no longer hijacks page scroll. LightweightCharts defaults `handleScroll.mouseWheel + handleScale.mouseWheel = true`. Disabled both. Chart still pans by drag, zooms by trackpad pinch, axis drag for vertical zoom.
- `23d6e05` — `togglePanel` only flipped `.edge-panel.collapsed`, never added `.left-collapsed` to `.main-container`. The adaptive padding CSS (340px → 60px) existed but the trigger and target were never connected. Now toggles in lockstep + dispatches chart resize after the 300ms transition.

### 8. TRAI Symbol Extraction Fix

Trey said "what good my son" to TRAI and got back a confident technical analysis of a stock at $50.25. Caused by `extractSymbol()` matching "SON" (Sonoco Products Co, real $50 stock) → bot fetched real Sonoco data → prompt template forced model to use it.

`4d393ea` — two-part fix:
- Stopwords expanded with casual/slang/family words that happen to be tickers: SON, BRO, DAD, MOM, KID, GUY, PAL, BUD, DUDE, HEY, YEP, NAH, FAM, LOL, etc.
- Intent gate before extraction: skip unless prompt shows `$TICKER` pattern, trading keyword, or length ≥ 20 chars. Casual greetings now fall through to no-data branch.

### 9. Watchdog Backfill Canonical Interface (`2c1b694`)

After SessionRouter swaps `this.kraken` to AlpacaAdapter at 9:30 ET, the watchdog backfill called `getHistoricalOHLC('XBTUSD',...)` — Kraken-specific method. AlpacaAdapter doesn't have it. Backfill threw silently, watchdog halted bot.

Now uses canonical `IBroker.getCandles(symbol, '15m', 10)`. Symbol pulled from `sessionRouter.activeSession`. Shape-normalized: `etime` falls back to `t` when adapter doesn't provide it (Alpaca case).

### 10. Cold-Boot Stale-State Clear (`1ff4023`)

Follow-up to `4433126`. Original cleared `data/candle-history.json` on broker TRANSITIONS but cold boots — where SessionRouter calls `_activateStocks/_activateCrypto` without going through a transition — were not covered. Same six lines inlined into both initial activation paths.

### 11. Alpaca Data Stream Unblock (`28c070b`, parallel-CC catch)

Two bugs hiding each other:
1. `authSuccessPredicate` checked `msg.T === 'success'` against the parsed message, but Alpaca wraps auth-success in a 1-element array `[{T:"success",msg:"authenticated"}]`. Predicate failed on arrays → `_fireAuthenticated` never fired.
2. `_ensureDataStream` stored ONE `_initialSubscribeCallback`, overwritten on each call. SessionRouter loops 7 stockSymbols → only RIOT (last) ever subscribed.

Predicate now unwraps arrays via `Array.some`. Callbacks accumulate in `_pendingSubscribeCallbacks[]`, drained in onAuthenticated.

### 12. Historical Backfill Auto-Kick (`25b4591`)

Live/paper mode never auto-fetched historical bars on boot — only fired on dashboard `request_historical` messages. Cold-boot stocks-active sat with empty charts and 0.00 HUD until user happened to switch timeframes.

SessionRouter now kicks `fetchAndSendHistoricalCandles('1m', 500)` at +4s and `('15m', 500)` at +5s after activation. Both initial activation and transition paths.

---

## Smoke Tests

| Test | Result | Notes |
|------|--------|-------|
| Phase 0 baseline (BTC 15m, ENABLE_TRAI=false) | PASS (unchanged) | $17,551.91169513058 — no core-trade-logic changed |
| SessionRouter morning transition (9:30 ET) | PARTIAL | Pause/resume cleanly logged, but `[IndicatorEngine] State reset` line missing — bot was running pre-reset code at swap time |
| SessionRouter afternoon transition (16:00 ET) | PASS | Full sequence logged: pause → save → reset indicators → swap broker → re-subscribe → resume |
| Single-symbol subscribe (post-`a2fc66c`) | PASS | `[Alpaca] TX subscribe(bars):["TSLA"]` only. Snapshot reads $379.38 (real TSLA), no contamination |
| Live Alpaca trade execution | PASS | First-ever live BUY on Alpaca via paper account; bot operated through full RTH session autonomously |
| Dashboard hard-refresh post-swap (after `e6526c0`) | PARTIAL | Hero price + asset-card flip to BTC; chart y-axis took the `58f7e3a` rescale fix to flip cleanly |
| Pattern confidence dynamics | PASS post-`970501c` | Was pinned at 10%, now varies 0–N% based on actual match quality |
| TRAI casual greeting handling | PASS post-`4d393ea` | "what good my son" no longer fetches Sonoco data |
| Mercury reindex (854 files / 9.3K chunks) | PASS | 179.7s. RAG caught up after the day's churn |

---

## Files Touched

| Layer | File | What Changed |
|-------|------|--------------|
| Bot | `run-empire-v2.js` | Watchdog backfill canonical, cold-boot active-broker pickup, fetchAndSendHistoricalCandles symbol resolution, broadcast carries symbol |
| Bot | `core/SessionRouter.js` | Cold-boot candle-history clear, single-symbol subscribe, historical kick, session-aware kick |
| Bot | `core/CandleProcessor.js` | Price broadcast carries symbol |
| Bot | `core/TradingLoop.js` | minConfidence unit fix, strategy_stack full list + IP-shielded labels |
| Bot | `core/StateManager.js` | Persist closedTrades on close |
| Bot | `core/EnhancedPatternRecognition.js` | Removed `\|\| 0.1` confidence floor |
| Bot | `core/UnifiedPatternMemory.js` | Removed `confidence: 0.1` for unknown patterns |
| Bot | `core/TradeNarrator.js` | Public `labelFor()` exposed |
| Bot | `brokers/AlpacaAdapter.js` | Auth predicate handles arrays + callback accumulator (parallel-CC) |
| Server | `ogzprime-ssl-server.js` | TRAI symbol extraction stopwords + intent gate |
| Dashboard | `public/unified-dashboard.html` | Confidence labels, indicators grid, edge-toggle restyle, chartHud reposition, status-light tooltips |
| Dashboard | `public/js/core.js` | Equity field, asset selector flip, historical_candles symbol mirror, narrator confidence wire, totalPnl color |
| Dashboard | `public/js/chart.js` | Wheel-hijack disabled, price-axis rescale defense |
| Dashboard | `public/js/panels/risk-gauge.js` | Equity field |
| Dashboard | `public/js/panels/size-preview.js` | Equity field, plain-English labels, disclaimer strip |
| Dashboard | `public/js/panels/trade-log.js` | 4-column grid + P&L color |
| Dashboard | `public/js/panels/strategy-leaderboard.js` | IP-leak hint replaced |
| Dashboard | `public/js/panels/edge-analytics.js` | togglePanel wires to `.left-collapsed` + chart resize |
| Config | `.env` | USER_NARRATOR=true + NARRATOR_LABEL_SEED |

---

## Open Items for Next Session

1. **state.json zero-out** — paper account still carries `realizedPnL: $8.28M / totalPnL: $8.34M / tradeCount: 44` from morning bleed. Awaiting green-light to wipe.
2. **OHLC display duplication** — Trey caught 3+ places: edge analytics, below edge analytics, top-right of chart, plus duplicated timeframe + ticker. Needs UX pass to consolidate.
3. **Chart adaptive collapse** — wiring is correct on disk (`23d6e05`) but Trey reports it not working in Edge browser. May be stale cache or a CSS specificity issue; need DevTools verification.
4. **Crypto strategy pipeline** — Trey identified the architectural gap: SessionRouter swaps brokers but assumes one strategy stack works for both. TSLA-tuned thresholds don't fire on BTC. Filed for after-Apex.
5. **Animations / "flashing crazy stuff"** — pre-existing demo had visual movement on signals; current dashboard is static between ticks.
6. **DeepSearch full E2E audit** — Trey planning to dispatch one prompt covering mutations, dead code, all calls cited by line — once the dashboard is at a stable visual state.

---

## Context for Next Session

- Tomorrow's 9:30 ET stocks transition will be the first end-to-end test of all three auto-flip paths together (`historical_candles` symbol + `price` symbol + `bot_thinking` IP-shielded labels). Chart should populate cleanly with TSLA bars within ~5s.
- Apex eval starts Monday 9:30 ET — every fix landing this weekend reduces the risk of a visible-during-eval bug.
- Mercury index is current as of `19f8809` neighborhood. Next code-heavy change should re-run `node trai_brain/mercury-bridge/indexer.js` (~3 min, 854 files / 9.3K chunks).
- The companion doc covers the resilience-stack audit + supervisor work in detail.

---

## Recorder Pipeline Disposition

- ✅ CHANGELOG.md — to be updated this commit
- ✅ Session doc — this file
- ✅ RAG reindex — completed at ~13:08 EDT (179.7s)
- ✅ recent-changes.md — composite entry already filed by parallel CC at `981339c`
- N/A fixes.jsonl — bulk session, individual entries would dilute the log; commit messages carry the detail
