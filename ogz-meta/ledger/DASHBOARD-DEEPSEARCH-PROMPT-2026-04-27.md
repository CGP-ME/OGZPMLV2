# Dashboard DeepSearch Prompt — One-Pass Cleanup

**Use this prompt with:** DeepSeek, Claude Opus, ChatGPT-o1, or any high-context reasoning agent.
**Goal:** receive a single coherent fix plan that addresses every visible dashboard regression in 1-2 passes, not piecemeal triage.

---

## PROMPT BEGINS

You are auditing the OGZPrime live trading dashboard at `https://ogzprime.com/unified-dashboard.html`. The dashboard recently regressed across multiple panels — what was a working operator view is now broken, inconsistent, and leaking implementation details. I need a single comprehensive fix plan, not band-aids.

### Context — what this dashboard is supposed to do

OGZPrime is a real-time trading bot (Node.js + PM2) that trades crypto on Kraken (24/7) and stocks on Alpaca (RTH only). The dashboard is the operator's live view — it shows the bot's current state, signals, trades, and pattern detections in real time via a WebSocket relay.

**Architecture:**
- Bot process: `run-empire-v2.js` (PM2: `ogz-prime-v2`)
- WebSocket relay + SSL server: `ogzprime-ssl-server.js` (PM2: `ogz-websocket`)
- Browser dashboard: `public/unified-dashboard.html` + `public/js/**`
- Frontend talks to backend over `wss://${host}/ws`

**Right rail panels (in order):**
1. Pattern Analysis — pattern engine detection + sparkline + confidence
2. Performance Stats — Total P&L / Win Rate / Trades Executed / Confidence
3. Indicators bar — RSI / MACD / Pattern / Pattern(ML) / Vol / ATR / Conf
4. Size Preview — shares / notional / projected SL loss
5. Trade Log — closed trades
6. Strategy Leaderboard — per-strategy session stats
7. Chain of Thought — orchestrator narration

**Left rail (Edge Analytics):**
- TSLA/asset card with timeframe pills
- Liquidation levels
- CVD (Order Flow)
- Funding rates
- Whale activity
- Market internals
- Smart money tracking
- Fear & Greed gauge
- Hidden divergences
- Golden Proximity gauge

**Header:**
- OGZPRIME logo (top-left)
- Hero price (centered, big)
- Status lights (DATA / BOT / TRAI) + Risk Budget Gauge + Session Phase indicator (top-right)

### Observable regressions to fix

**Panel 1 — confused confidence values across 3 panels:**
- Performance Stats "Confidence" shows `10%`
- Indicators bar "Conf" shows `---` or `8.0%` depending on the moment
- Chain of Thought orchestrator narrates `"Confidence 8.0% < 0.5% minimum"`
- Three different DOM elements (`#confidence`, `#confidenceML`, plus orchestrator string), three different event sources (`pattern_analysis` event, `price` event, narrator events). All labeled "Confidence" with no disambiguation. The "0.5% minimum" comparison in Chain of Thought looks like a unit-mismatch bug (50% threshold mis-labeled as 0.5%).

**Panel 2 — indicator panel showing wrong content:**
- The indicators bar is supposed to display RSI / MACD / Pattern / Vol / ATR / Conf as a one-line indicator strip. Per Trey's report it currently displays text like "bot uses its own DynamicPositionSizer" — a code-comment string rather than indicator values. Find where this bleed is happening (probably wrong DOM target for some innerHTML write) and fix it.

**Panel 3 — Performance Stats showing `--` for Trades Executed instead of `0`:**
- Markup default is `<div id="tradesExecuted">0</div>`. Something writes `--` to it. Find the writer.

**Panel 4 — Chain of Thought just not working:**
- Per Trey: "Chain of Thought just not working." Either no events are being routed to it, OR the narrator event path is dropping frames. The DOM target is `#chainOfThought` / `#thoughtDisplay`. Backend writes `narrator_event` WebSocket frames — verify the frontend handler in `core.js:262` is firing and rendering them correctly. If `USE_NARRATOR=true` env isn't set on the bot, narrator frames don't fire — surface that.

**Panel 5 — Pattern Analysis sparkline not drawing:**
- Recent commit `2ef94ca` added a sparkline (SVG path that fills with confidence-history). Pattern panel currently shows the confidence chip ("10%") but no visible sparkline curve. Either the sparkline DOM is mounted but the path isn't rendering (CSS or empty data buffer), OR the panel isn't receiving updates. Check `public/js/panels/pattern-sparkline.js`.

**Panel 6 — Risk Gauge overlapping the OGZPRIME logo on the LEFT:**
- The Risk Gauge (`#riskGauge`, mounted by `public/js/panels/risk-gauge.js` into `#botStatusRow`) should sit in the top-RIGHT of the header, next to the status lights. Per Trey's screenshot, it's rendering on the LEFT, overlapping the OGZPRIME wordmark. The mount target is inside `.header-status-cluster` which has `display:flex; justify-content:space-between` parent. Despite a defensive `margin-left: auto` added to the cluster (commit `af807a4`), the gauge still appears on the left. Identify the cascade collision — likely a `transform`, `position: absolute`, `isolation`, or other CSS context that breaks the auto-margin. Fix the gauge position properly.

**Panel 7 — Chart visually "all up under the left panel" (per Trey):**
- Chart container takes full viewport width within `.main-container`, which has `padding-left:340px; padding-right:340px` to make room for the fixed-position rails. Trey's complaint: chart appears to extend UNDER the left rail rather than having a "reactive moving frame." Either the chart's internal canvas isn't tracking the container's effective width, OR there's no visible gap/border separating chart from rails. Investigate and fix so the chart visually respects the rails.

**Panel 8 — TRAI not online:**
- Per Trey: "we still need to bring trai online." TRAI is the natural-language widget at the bottom of the dashboard (`public/trai-widget.js`). Backend at `ogzprime-ssl-server.js:/api/trai/*` — verify the endpoints are wired and the widget connects. Existing config uses `TAVILY_API_KEY` for news context (set in env). The widget should authenticate, show ready state, and respond to natural-language questions about the live bot state.

**Panel 9 — IP / source-leak through View Source:**
- All `public/js/**` files are served raw with full JSDoc comments referencing strategy names, sweep results, audit findings, architectural decisions, Phase E/F implementation details. HTML markup uses descriptive class names (`#riskGauge`, `#patternAnalysis`, `.bot-status-row`, etc.) and HTML comments visible in source. The dashboard sits behind a make.com email-capture funnel (some friction) but the JS source is exposed. Consider: comment-stripping build step, generic class names, or move sensitive descriptions to internal-only docs.

### Required output format

Produce a single coherent fix plan with these sections:

**A. Triage table** — for each of the 9 issues above, classify:
- Root cause (1-2 sentence diagnosis with file:line citations)
- Fix complexity (LINE / FUNCTION / FILE / ARCHITECTURE)
- Severity (BLOCKING-LIVE / HIGH / MEDIUM / COSMETIC)

**B. Recommended fix order** — sequence the fixes by:
- Dependencies (some fixes unlock others)
- Risk (low-risk first to validate the diagnosis)
- Visibility (operator-facing wins ship sooner)

**C. Per-fix code snippets** — for each fix, provide:
- Exact file path
- Exact diff (before/after) or new file content
- Verification step (how to confirm it worked)

**D. What NOT to touch** — call out the resilience-and-supervision stack (commits `46efac0..baea97c`), the Mercury bridge (`trai_brain/mercury-bridge/**`), and the SessionRouter (commit `a5b8cd5..deb276e`). These are working — don't modify in this fix plan.

**E. Open questions** — items where you need Trey's input before I can implement.

### Constraints

- Don't break the SessionRouter dual-broker flip (Kraken ↔ Alpaca at NYSE open/close)
- Don't break the AlpacaAdapter ResilientWebSocket migration
- Don't break the Supervisor module (audits B1, B2, B3, C2 fixed; A, C1, D pending re-audit)
- Phase 0 baseline must reproduce byte-exact: `$17,950.589592711076 / 1430 trades / 57.55% WR / 2.63% DD / 2.69 PF`
- All exit-contract SL values land per commit `16c1b1c` (RSI=-2.25, EMA=-2.0, MA=-2.25, SMS=-2.5, LiquiditySweep=-2.0)
- Apex eval starts Monday 9:30 ET — fix plan must be implementable before then

### Recent commits relevant to current state (chronological)

- `07063cb feat(dashboard): glass-morphism boost on right-rail panels`
- `9baaf77 refactor(dashboard): extract .trading-panel CSS into public/css/trading-panel.css`
- `b43d059 feat(dashboard): TSLA card + timeframe pills at top of left rail`
- `fc374ef feat(dashboard): L6 OGZPRIME logo restyle + brace fix`
- `ae33984 feat(dashboard): L7 Golden Proximity — full-width top-of-document gauge`
- `2ef94ca feat(dashboard): L2 Pattern Analysis sparkline + confidence chip`
- `f24b83e feat(dashboard): hero price + status zone restructure + fix Risk Gauge mount`
- `836952b fix(dashboard): asset-tf-card tracks LIVE active symbol, not static dropdown`
- `af807a4 fix(dashboard): lock header status cluster to right edge — defensive Risk Gauge position`

The most likely sources of the regressions are:
- `b43d059` (TSLA card injection)
- `f24b83e` (Risk Gauge mount move)
- `2ef94ca` (sparkline panel injection)
- `af807a4` (defensive margin which didn't work)
- Pre-existing data-plumbing bugs surfacing only now

### What to read

- `public/unified-dashboard.html` — full markup
- `public/js/core.js` — WS event handlers + DOM writes
- `public/js/websocket.js` — WS connection + auth
- `public/js/panels/risk-gauge.js`
- `public/js/panels/pattern-sparkline.js`
- `public/js/panels/asset-tf-card.js`
- `public/js/panels/confidence-heatbar.js`
- `public/css/trading-panel.css`
- `public/css/header-brand.css`
- `public/trai-widget.js` (for the TRAI online issue)
- `ogzprime-ssl-server.js` (for narrator_event + TRAI endpoint context)

Return the fix plan with code-ready diffs. I'll review and have CC apply.

## PROMPT ENDS

---

## How to use this

1. Copy everything between PROMPT BEGINS and PROMPT ENDS
2. Paste into DeepSeek / Claude Opus / ChatGPT-o1 (whatever has the most context budget)
3. Attach or paste the contents of the files listed in "What to read" if the agent doesn't have repo access
4. Receive the comprehensive fix plan
5. Hand fix plan back to CC (this instance) for application
6. CC applies in the recommended order with verification at each step

This is the "one big pass" alternative to me incrementally finding and fixing issues one at a time.
