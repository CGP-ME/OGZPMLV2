# Wolf Cotwerk Distilled Extract — 2026-05-09

**Source:** `ogz-meta/ledger/claudecotwerk.md` (2,967 lines, 155KB) — Wolf/Cowork's full working session log on the OGZPrime dashboard frontend rebuild.
**Extracted by:** CC-D, focused on emitter discoveries + panel mappings + bugs + gaps.
**Use:** Cross-reference against `emitter-inventory-2026-05-09.md` and `panel-emitter-mapping-2026-05-09.md` when wiring panels.

---

## 1. Emitters Wolf Identified

| Type | Payload fields Wolf documented | Asset-scoped? | Notes |
|---|---|---|---|
| `historical_candles` | `.symbol`, OHLCV array | YES (per SessionRouter) | Requested via `request_historical` with asset param |
| `price` | `.price`, `.symbol` | NO (handler dispatch is type-only) | Continuously emitted for actively-traded asset |

**Critical architectural finding:** The dashboard websocket dispatcher at `public/js/websocket.js:55` is **type-only**, not asset-filtered:
```js
const handlerList = handlers.get(data.type);
if (handlerList) handlerList.forEach(cb => cb(data));
```
Every subscriber to `price` receives every price event regardless of which asset emitted it.

---

## 2. Panel ↔ Emitter Mappings Wolf Made

### Chart Panel
- **Emitter:** `historical_candles` (✓ correctly TSLA-scoped)
- **Trigger:** assetSelector dropdown → `request_historical` with `asset=TSLA`
- **Status:** Working (loads 500 TSLA candles on WS auth)

### Size Preview Panel — **BROKEN**
- **Emitter:** `price`
- **File:** `public/js/panels/size-preview.js:274`
- **Bug:** Reads `data.price` blindly without checking `data.symbol === currentAsset`
- **Effect:** If chart shows TSLA but bot trades BTC, sizer renders BTC math while TSLA is on screen.

### OHLC Readout
- **Emitter:** `price` (and/or chart crosshair)
- **Bug:** Duplicated 3+ places (edge analytics, below edge analytics, top-right of chart). No single source of truth.

---

## 3. Bugs Wolf Found (severity ordered)

### CRITICAL — Two Independent Active-Asset Concepts
**Real-money impact.** Dashboard has two never-reconciled "active asset" states:
- **Chart asset:** `assetSelector` dropdown → correctly displays TSLA
- **Bot asset:** Whatever backend is trading right now → BTC

Live observation Wolf documented:
- Chart: TSLA ~$393 ✓
- Top-left ticker: 663.00 (= last 3 digits of BTC $81,663)
- OHLC readout: O 81664.70 H 81689.90 L 81662.90 C 81663.00 (pure BTC)
- Size Preview: POSITION $5000 / 0.06 shares = $83,333/share ← BTC math
- Math proof: 0.30% × $81,663 = $244.99 stop distance ← matches BTC, not TSLA

**Wolf's framing:** *"if you hit buy right now while looking at this dashboard, the sizer thinks you're trading BTC."*

**Root cause (per e2e doc cross-ref):** `IndicatorEngine` (`core/indicators/IndicatorEngine.js`, module #27 in boot order) has hardcoded `symbol: 'BTC-USD'` and **does not reset on SessionRouter asset swap until `reset()` is called**. Frontend never updated to honor SessionRouter's asset isolation that shipped April 27-28.

### HIGH — `npm run dashboard` Script Mismatch
- `package.json:11` references `ogzprime_ssl_server_advanced.js` (underscores)
- File on disk is `ogzprime-ssl-server.js` (hyphens)
- Script will fail if run. Doesn't block normal flow (operators use `npm start`).

### MEDIUM — Google Fonts Runtime Import
- `public/unified-dashboard.html:21` (monolith)
- Imports Google Fonts at runtime. TODO already in file to self-host. Network dependency every dashboard load.

### MEDIUM — Missing Symbol Label on Chart
- No ticker label visible anywhere on the chart. Operator can't tell what asset is on screen without checking other panels.

### MEDIUM — Broken Pattern Label
- "Learning Pattern pattern detected with 0.0% confidence" — "Learning Pattern" is a placeholder string treated as a real pattern name. Should read "No pattern detected — scanning..." when confidence = 0.

### LOW — Stray UI Blob
- Small green/black blob to the right of LIVE READOUTS. Z-index bleed from chat widget suspected.

### LOW — `/api/health` Missing `commit` Field
- `ogzprime-ssl-server.js:942-952` returns `{status, uptime, memory, websockets, timestamp}` but NOT `commit`
- `public/proof/index.html:260` renders `${data.commit}` → "undefined" string

---

## 4. Gaps Wolf Called Out

| # | Gap | What's needed |
|---|---|---|
| G1 | SessionRouter not fully broadcasting | websocket.js never updated to honor asset isolation |
| G2 | No Watchlist panel | 9-ticker scanner: symbol + broker badge + price + %move + state pill + sparkline |
| G3 | Single Size Preview can't multi-position | Need stacked table per ticker with aggregate exposure |
| G4 | Strategy heatbar shows only top-5 | Need all-9 "Strategy Battleground" grid w/ per-strategy session stats |
| G5 | OHLC display duplicated 3+ places | Consolidate to single source of truth |
| G6 | No Chain of Thought streaming | First-class streaming narrator output (USER_NARRATOR=true is set, just not displayed prominently) |
| G7 | No Pattern Card | Pattern shape (SVG) + WHY description + recent occurrences W/L list |
| G8 | TRAI as popup, not panel | Make persistent right-rail panel: news + whale alerts + narrator + escalation queue |
| G9 | No account selector | Reserve UI slot for 20-Apex multi-account toggle |
| G10 | Equity curve not live-updated | Live aggregate equity curve w/ trade markers color-coded by ticker |
| G11 | System Health strip too minimal | Distinguish current-session uptime from "last unplanned crash" + cumulative ops hours + per-broker WS status |
| G12 | State.json phantom $8.28M value | Source/reason unclear — punch list item |
| G13 | Edge Analytics not symbol-scoped | All edge panels should filter to currently-selected ticker |

---

## 5. Wolf's Architectural Conclusions

> **Bot architectural maturity:** *"Bot built as risk-management first, then iterated to profitability... that's adversarial-first risk design, not happy-path-with-fallbacks. That's a level of architectural maturity most algo bots never reach."*

> **Real shape of the work:** *"Not a single-asset chart page; it's an operator console for a multi-ticker, multi-position, multi-broker portfolio scanner across 9 pre-validated tickers (crypto + stocks), with arbitrage as endgame."*

> **Differentiator:** *"White-box trading platform — every decision visible + explained + educational. Combined with risk-first architecture + no-expectations-set positioning, this is a defensible moat no competitor has."*

> **Dashboard role:** *"Dashboard IS the entire marketing pitch — proof page + track-record page + white-box dashboard together replace the entire sales funnel of every competitor."*

### Wolf's 6-phase rebuild plan (proposed end-of-session)

1. Design lock on static HTML mockup (he built one, 2,069 lines)
2. Module architecture spec (every panel = one .js file, data contracts specified)
3. Modularization panel-by-panel with visual verification after each extraction
4. New panels (Watchlist, TRAI Brain, Pattern Card, Strategy Battleground all-9, Risk Posture)
5. Hygiene pass (inline styles/scripts moved to separate files, HTML becomes thin shell)
6. White-glove README documenting module pattern for licensees

**Status as of session end:** Wolf completed the static mockup. **No files were edited on the production VPS during his session.** Discovery + framing + architectural guidance only. All wiring work is forward-looking.

---

## 6. Open Questions Wolf Left

- Which branch is production deployed from? (Session doc shows `alpaca/stocks-paper-flip`; commits 04129a1 + 970501c may not be deployed if the divergence is still live)
- Is the workspace folder synced with live VPS?
- How should the 9-ticker watchlist state be persisted? (No design decision documented)
- What profit-share / trial-mode mechanics are final? (Clarified as SaaS subscription, but implementation TBD)
