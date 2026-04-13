# CLAUDE DESKTOP HANDOFF — 2026-04-07

**For:** Next Claude Desktop session  
**From:** Trey Buhidar (The Architect, OGZPrime)  
**Project:** OGZPMLV2 — algorithmic trading platform  
**Branch:** `tradingloop-clean-rewrite`  
**Last commit visible:** `c10d512 feat: Add Volume Profile confidence boosts (Auction Market Theory)`

---

## WHO YOU'RE WORKING WITH

Trey is building OGZPrime to pass Apex prop firm evaluations and clone the bot across 20 accounts ($25K each = $500K). His daughter is in Houston, he's in Corpus Christi, this bot is the path to moving to be with her after 6 years apart. He's been grinding since April 2025. He has 20 years of B2B sales background, drives architecture himself, uses Claude to execute and validate.

He prefers fast, abbreviated, direct responses. No sugar-coating. He pushes back on verbose answers. Wants code written and committed, not explained at length. Moves immediately to the next thing when something works.

---

## WHERE WE LEFT OFF (THE LIVE PROBLEM)

**Trey is hunting a regression in RSI strategy P&L on TSLA 18mo data.**

### The bug
- Backtest output shows TWO different "Final Balance" values in the same run
  - One says `$9706.05` (loss of -$293.95)
  - Other says `$10,148.163` (slight profit)
- Trey says "RSI has always been profitable since day one — never been a losing strategy" — RSI is the regression anchor and should be ~$970 profit on tsla-15m-2y baseline
- The CSV from a 2y test showed RSI working correctly: **$10,234.40 (+$234.37 profit)** with 360 trades
- The CSV is the truth — `awk -F',' 'NR>1 {sum+=$11} END {print sum}' backtest-trades.csv` confirms it

### Root cause identified (DON'T LET CLAUDE CODE REFACTOR ANYTHING)
There are FOUR places printing "Final Balance" in the codebase:
1. `core/BacktestRunner.js:152` — `finalBalance.toFixed(2)` (with 💰 emoji)
2. `core/BacktestRunner.js:209` — `report.summary.finalBalance`
3. `core/BacktestRecorder.js:310` — `s.finalBalance.toLocaleString()`
4. `run-empire-v2.js:1658` — `stateManager.get('balance').toFixed(2)`

The `run-empire-v2.js:1658` print uses `stateManager.get('balance')` which **never moves since the 2026-03-28 per-trade equity refactor**. It's reading a stale value. The comment in BacktestRunner.js confirms: "StateManager.balance never moves since 2026-03-28 per-trade equity refactor — only realizedPnL changes."

The BacktestRunner correctly reads from `backtestRecorder.trades` array. So does BacktestRecorder. They should agree.

### THE FIX (one line, do not refactor)
Find the print at `run-empire-v2.js:1658` that reads `stateManager.get('balance')` and either:
- Delete it (it's the lying number)
- Or change it to read from `this.backtestRecorder.balance` instead

That's the entire fix. The trading pipeline is fine. The trades execute correctly. The CSV is correct. Only the secondary print is lying.

### What NOT to do
- Do NOT refactor TradingLoop.js
- Do NOT touch OrderExecutor.js  
- Do NOT switch branches
- Do NOT pop stashes
- Do NOT chase phantom regressions in shared pipeline files

Claude Code spent hours of session compute ricocheting through git history, switching branches, creating .bak files, and trying to "fix" four files when the actual bug is one stale print statement. Don't repeat that.

---

## WHAT GOT BUILT THIS SESSION (ALL COMMITTED, ALL WORKING)

### Pine Script Interpreter (THE BIG WIN)
Located in `pine-transpiler/`. Built by 4 AIs in parallel (Claude Desktop architecture, Claude Code implementation, Mercury-2 analysis, Cursor/Gemini/Codex contributions). 

**Files (2,507 lines total):**
- `core/PineLexer.js` — tokenizer with indent/dedent
- `core/PineParser.js` — AST builder
- `core/PineRuntime.js` — executes AST per candle, manages series history
- `core/PineArray.js` — Pine array.* API (static + instance methods)
- `core/PineTALib.js` — ta.* functions with mintick rounding
- `core/PineStrategyBridge.js` — strategy.entry/exit/close → OGZ signals
- `core/PineFeatureScanner.js` — compatibility scanner
- `helpers/SessionTracker.js` — EST/IVB/daily loss tracker
- `tools/pine-import.js` — CLI transpiler
- `modules/SmartMoneySweep-v4.js` — auto-generated from .pine

**Status:** Working. Produces **422 signals** vs TradingView target **397** (6.3% variance, explained by float drift and TA rounding).

### TRAI Resurrection
TRAI was completely disabled (`ENABLE_TRAI=false`) and pointed at dead Ollama. This session:
- `core/persistent_llm_client.js` — provider-agnostic (mercury/claude/openai/ollama), 450 lines
- `core/TRAIPatternIntegration.js` — pattern pack evaluator, 243 lines
- Mercury-2 wired to SSL server via `/api/trai/analyze` endpoint
- Tavily web search integration for market context
- Market snapshot page with TradingView chart
- TRAI widget markdown rendering, content filter workarounds, token bumps

**Still TODO:** `ENABLE_TRAI=true` in TradingConfig.js (still set to false default)

### Pattern Harvester
- `tools/harvest-pattern-pack.js` (315 lines) — mines winning patterns from backtest CSV
- `core/TRAIPatternIntegration.js` (243 lines) — applies confidence multipliers
- `tools/strategy-parity.js` (238 lines) — cross-verification

**Top pattern found:** Friday longs held 30min-2hr → 64.1% WR, PF 3.32  
**Top anti-pattern:** Scalp trades under 30min → 32% WR, PF 0.50 (893 trades bleeding the strategy)

### Dashboard
- `public/command-center.html` (515 lines, vanilla JS, no React dependency)
- Black/gold/red OGZ brand theme
- Smart CSV detection (OGZPrime, TradingView, MT4, generic)
- Persistent storage for saved runs

### SMS Module Fixes
- `vpRthOnly` config flag + `_buildVpSlice()` method
- `sweepMaxOffset` and `vpLookbackBars` config
- All in `modules/SmartMoneySweep.js` and `core/TradingConfig.js`

### PID Controller (DESIGN, NOT YET BUILT)
Trey dreamed this up — three control loops:
1. **Position sizing PID** — measures equity slope, P/I/D adjusts size
2. **Regime boost adaptation** — per strategy per regime, self-tuning
3. **Trailing stop adaptation** — targets 60% MFE capture

Full spec in artifact `ogzprime-pid-controller.jsx` (538 lines including working module skeleton).  
**Status:** Designed and committed as concept. Not yet integrated into the trading loop.

### Documentation Created
- `ogz-meta/SESSION-BLUEPRINT-2026-03-30.md` — full session findings
- `ogz-meta/BACKTEST-OPS.md` — definitive backtest operations manual (every strategy, env var, command)
- `pine-transpiler/TRANSPILER-STATUS.md` — current state of Pine interpreter

---

## THE REGRESSION HUNT — WHERE WE ARE

Trey believes an earlier commit produced **$970 profit on RSI / TSLA 15m / 2-year data**. That's the regression anchor. Walk-forward validation was 2026-03-20.

**The exact baseline command:**
```bash
SOLO_STRATEGY=RSI \
EXECUTION_MODE=backtest \
CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-2y.json \
BACKTEST_MODE=true \
BACKTEST_FAST=true \
BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 \
FEE_TAKER=0 \
DIRECTION_FILTER=both \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js
```

**The locked RSI strategy config (from TradingConfig.js):**
```js
RSI: {
  stopLossPercent: -0.8,
  takeProfitPercent: 1.0,
  trailingStopPercent: 0.6,
  trailingActivation: 0.8,
  maxHoldTimeMinutes: 240,
  minConfidence: 0.60,
  invalidationConditions: [],
  _validated: '2026-03-20',
}
```

**Current results show RSI at +$234 on 2y data** (from CSV). That's profit, but well below $970.

### Trey's plan
Trey has **62 versions of main and 34 versions of tradingloop-clean-rewrite in his Downloads folder**. He's going to send earlier zips to find the one that produces $970. The plan:

1. Each zip you receive, run the exact RSI command above on `tsla-15m-2y.json`
2. Look for the one that produces ~$970 profit
3. When found, diff it against current HEAD to identify what changed
4. Apply the fix surgically (not by reverting wholesale)

**Earliest tradingloop-clean-rewrite is March 26.** He confirmed that one is already broken. So look further back — main branch zips from March 18-22 (around the walk-forward validation date 2026-03-20).

---

## CRITICAL CONTEXT — DATA SOURCE DISCOVERY

This was the biggest finding of the previous session. **TradingView and Polygon.io serve different candle data for the same ticker.** TradingView uses Cboe/BATS RTH-only data. Polygon uses consolidated tape with pre/post-market.

This means:
- Same ticker, same timeframe, different OHLCV
- VP levels computed from each source differ by $6-26
- Our manual SMS port produces 1,301 trades vs TradingView's 397 because of data source mismatch
- The Pine interpreter bypasses this by running PineScript directly on whatever data source you give it

**Conclusion:** The VP algorithm is correct. The data source is the variable. For backtesting, use the same data source as the validation reference. For live trading, use the broker's own feed.

---

## STRATEGY REGISTRY (memorize this)

| SOLO_STRATEGY | ENABLE flag | Status |
|---|---|---|
| `RSI` | `ENABLE_RSI=true` | LOCKED, validated 2026-03-20 |
| `MADynamicSR` | `ENABLE_MASR=true` | LOCKED, validated 2026-03-20 |
| `EMASMACrossover` | `ENABLE_EMA=true` | Active |
| `LiquiditySweep` | `ENABLE_LIQSWEEP=true` | Active |
| `SmartMoneySweep` | `ENABLE_SMS=true` | Validating, default OFF |
| `OpeningRangeBreakout` | `ENABLE_ORB=true` | Disabled, needs tuning |
| `MarketRegime` | (deprecated as strategy, now confidence multiplier) | - |
| `MultiTimeframe` | `ENABLE_MTF=true` | Active |
| `OGZTPO` | `ENABLE_TPO=true` | Active |

`SOLO_STRATEGY=RSI` isolates a single strategy. Comma-separated for combos.

---

## THE 5/5 GREEN FINDING (THE OTHER REASON THIS MATTERS)

Trey told me last night that he's seeing **8% profit across 5 different historical periods on TSLA 15m**, all green, no curve fitting (same parameters across all periods). That's the validated edge — cross-period consistency without re-optimization.

He's also moved to:
- Fabio Valentino's volume profile as confluence (not a gate)
- Regime as a confidence multiplier (not a strategy)
- Conditions moving toward = confidence, conditions already fulfilled = confluence
- Killing losers faster, letting winners run
- All hardcoded regime logic moved to config

**This is the architecture that's finally producing the green results.** Don't break it chasing the RSI regression. The two are separate.

---

## AI TEAM COMPOSITION

Trey runs a distributed AI dev team:
- **Claude Desktop (you)** — architecture, debugging, specs, documentation
- **Claude Code (on VPS)** — implementation, commits, testing
- **Mercury-2 (Inception Labs DLLM via API)** — rapid analysis, code review, fast inference (diffusion architecture)
- **Cursor** — file-specific edits, alignment fixes
- **Gemini/Codex** — helper modules, feature scanning

**Mercury runs via API (no GPU needed).** Trey's VPS is currently A100 GPU which is wasted money — pending swap to CPU instance tomorrow.

---

## PRACTICAL THINGS

### Tomorrow's real-world tasks
- Drive friend to get his ID (he just got his birth certificate after 6 years homeless — first step to a job)
- Swap VPS from A100 GPU to CPU (saves significant monthly cost since Mercury is API)

### ExxonMobil application
Trey applied for a Fullstack Developer position in Houston at ExxonMobil. The hiring contact is **AJ Padilla** (`aj.padilla@exxonmobil.com`). I helped him draft a follow-up email. The OGZPrime React/JS work is the portfolio piece.

### Repo
GitHub: `https://github.com/CGP-ME/OGZPMLV2`  
Branch: `tradingloop-clean-rewrite`  
600 commits on the branch as of last check. 538 on main.

---

## WHAT THE NEXT SESSION SHOULD DO

1. **First thing:** ask Trey to send a tradingloop-clean-rewrite or main zip from his Downloads — preferably from March 18-22 (around the walk-forward validation date). Run RSI on tsla-15m-2y. Find the $970.

2. **If $970 is found:** diff that zip against current HEAD on the rewrite branch. Identify the specific changes that broke it. Apply the FIX surgically — not a full revert.

3. **If $970 is not found in the early zips:** the baseline number may have come from a slightly different config (different SL/TP, different confidence threshold). Have Trey run the baseline command above on a known-good zip and tell you what number IT produces. That's the new anchor.

4. **The dual Final Balance bug:** one-line fix. Delete or fix the `stateManager.get('balance')` print in `run-empire-v2.js:1658`. That's it. Don't touch anything else.

5. **Don't let Claude Code refactor things** to chase phantom regressions. He has a tendency to switch branches, pop stashes, create .bak files, and modify shared pipeline files. Tell him explicitly: read only, no edits, paste output, no analysis.

---

## TONE NOTES

- Trey curses, you can match his energy when appropriate
- He hates sugar-coating ("if I wanted to get lied to and my feelings cared about I would go see a counselor")
- He's running on minimal sleep right now (was on the road from Houston, took a couple-hour nap, still grinding)
- He's the closest he's ever been to making OGZPrime work — 5/5 green periods is a massive milestone
- His daughter is the real motivation. Houston is the goal. This bot is the path.
- Don't lecture. Don't repeat. Move.

---

## ONE LAST THING

Trey kept saying "context is biting me in the ass" — every session loses the threads we built. The blueprint docs and this handoff exist specifically to combat that. **Read them first. Don't ask Trey to re-explain things that are documented.** When he says "you know how we…" — go check the docs before asking him to recap.

He's not a developer who learned how to learn. He's someone with strong systems instincts who taught himself enough to drive architecture across multiple AI tools simultaneously. Respect that. Execute on his vision. Push back when he's wrong, but don't make him repeat himself.

You got this. Get him to Houston.

— Claude Desktop, 2026-04-07
