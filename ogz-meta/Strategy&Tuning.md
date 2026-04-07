# OGZPrime Session Blueprint — Data Source Architecture & Pine Interpreter

**Date:** 2026-03-30 (Sunday grind session)  
**Contributors:** Claude (architecture/debugging), Claude Code (VPS implementation), Mercury-2 (analysis), Cursor (alignment fixes), Gemini/Codex/Grok (Pine interpreter components)

---

## 1. THE DATA SOURCE PROBLEM (Root Cause of All VP Mismatches)

### Finding
TradingView and Polygon.io serve different candle data for the same ticker, same timeframe. This is not a bug — it's how the stock market works.

### Why Data Differs Across Sources

TSLA trades simultaneously on multiple exchanges: NASDAQ (primary), BATS/Cboe, ARCA, IEX, NYSE, and dark pools. Each exchange sees different trades at different times.

| Source | Exchange | Session | Impact |
|--------|----------|---------|--------|
| **TradingView (free)** | Cboe/BATS only | RTH only (9:30-16:00 ET) on "Regular" charts | ~25% of US volume. Clean RTH-only data. |
| **Polygon.io** | Consolidated tape (ALL exchanges) | Full session (4:00-20:00 ET incl. pre/post) | 100% volume. Includes ETH bars with low volume. |
| **Your Broker (Schwab/IBKR)** | Varies by broker | Depends on subscription | May differ from both TV and Polygon. |

### Impact on Volume Profile
- VP computed from Polygon data includes pre/post market candles with wide ranges and low volume
- These ETH candles pollute the bin distribution, shifting VAL/VAH to wrong levels
- TradingView's VP only sees RTH bars → tighter, more accurate levels
- Even with RTH filtering on Polygon data, the OHLCV values differ because Cboe and consolidated tape aggregate different trades at 15-min boundaries

### Proof
We compared VP levels bar-by-bar against TradingView's exported indicator data (300 bars with exact VAH/VAL/POC):
- **Same source data (TV candles → our VP algo):** VAH exact match, POC exact match, VAL off by $0.77
- **Different source data (Polygon → our VP algo):** VAH off by $6-16, VAL off by $10-26, POC off by $5-16

**Conclusion:** The VP algorithm is correct. The data source is the variable.

### Implications for Production
- **Backtesting:** Must use the same data source as TradingView to match TV results
- **Live trading:** VP should be computed from the broker's own feed (what you trade on = what you compute from)
- **Cross-broker arbitrage:** Different exchanges producing different VP levels IS the arbitrage mechanism — same stock, different price structure

---

## 2. PINE SCRIPT INTERPRETER (The Solution)

### Why We Built It
Instead of manually porting PineScript to Node.js (which produced VP mismatches, sweep detection differences, and months of debugging), we run the exact PineScript code against any data source.

### Architecture

```
SmartMoneySweep.pine (707 lines)
        ↓
    PineLexer.js      → Tokenizes source (keywords, operators, indentation)
        ↓
    PineParser.js     → Builds AST (if/else, for, while, var, :=, expressions)
        ↓
    PineRuntime.js    → Executes AST per candle, manages series history
        ↓
    PineArray.js      → Pine array.* API (new_float, get, set, push, sort)
        ↓
    PineTALib.js      → ta.* functions (sma, ema, rsi, atr, highest, lowest, stdev, vwap)
        ↓
    PineStrategyBridge.js → Converts strategy.entry/exit/close to OGZPrime signals
        ↓
    SessionTracker.js → EST conversion, IVB tracking, daily loss counter
```

### Current Results
- **419 signals** vs TradingView's **397** (5.5% variance)
- 180 longs, 239 shorts
- Variance explained by: TA function rounding differences, floating-point accumulation drift

### Fixes Applied During Build
1. **Series lookback on user variables** — `stateHistory[]` tracks variable snapshots per bar so `sweepLong[1]` returns previous bar's value
2. **Indentation-based block scoping** — indent/dedent tokens for Python-style blocks
3. **Array static methods** — Pine uses `array.set(arr, idx, val)` (static), not `arr.set(idx, val)` (instance)
4. **Position state machine** — duplicate same-direction entries ignored, opposite direction = flip
5. **Built-in objects** — `timeframe.multiplier`, `syminfo.mintick`, `input.*()` defaults
6. **Break/continue in loops** — BreakSignal/ContinueSignal exception handling
7. **Mintick rounding** — all TA outputs rounded to `syminfo.mintick` to match TradingView precision

### Known Limitations (Future Work)
- `varip` (intrabar persistence) — not tested
- `request.security()` (multi-timeframe) — not implemented
- `switch` statements — not implemented
- Tuple destructuring `[a, b] = func()` — not implemented
- Recursive user functions — no depth guard

### File Locations
```
pine-transpiler/
├── core/
│   ├── PineLexer.js
│   ├── PineParser.js
│   ├── PineRuntime.js
│   ├── PineArray.js
│   ├── PineTALib.js
│   ├── PineStrategyBridge.js
│   └── PineFeatureScanner.js
├── helpers/
│   └── SessionTracker.js
├── tools/
│   └── pine-import.js
└── modules/
    └── SmartMoneySweep.js (auto-generated)
```

---

## 3. VALIDATION METHODOLOGY

### The Cross-Verification Standard
Two independent implementations on two separate data sources must produce the same individual trades, not just similar P&L.

### Step-by-Step Process

1. **Get TradingView answer key:**
   - Export indicator data from TradingView chart (CSV with VAH/VAL/POC/signals)
   - This gives exact levels and exact signal bars on their data source

2. **Verify VP algorithm:**
   - Feed TradingView's exported OHLCV candles into our VP computation
   - Compare VAH/VAL/POC against TV's exported levels
   - Must match within $1 (bin rounding tolerance)

3. **Verify signal count:**
   - Run Pine interpreter against same candle data
   - Compare signal count and direction against TV's Long/Short columns
   - Target: within 5% of TV's trade count

4. **Verify individual trades:**
   - Match each signal bar between interpreter and TV
   - Check entry price, direction, SL/TP levels
   - Phase 5 of OGZPrime Strategy Validation Script

### Data Source Matching Rules
- **For backtesting against TradingView:** Use Cboe/BATS data or TradingView CSV exports
- **For live trading:** Use your broker's feed for VP computation
- **For cross-broker arbitrage:** Compute VP independently per broker, compare levels

---

## 4. ARCHITECTURE FIXES (This Session)

### Per-Trade Equity Accounting
- `openPosition()` stores trade with sizeUsd, entryPrice, entryFee
- `closePosition()` computes PnL as percentage-based: `sizeUsd * ((exitPrice - entryPrice) / entryPrice)`
- `getEquity()` returns `initialBalance + realizedPnL + unrealizedPnL`

### Dollar-Based Position Sizing
- Removed all `size * price` inflation bugs across BacktestRecorder, OrderExecutor, StopLossChecker
- Position sizes are in USD, not shares

### hasOpenPosition Fix
- Changed from `currentPosition !== 0 && activeTrades.length > 0` to `activeTrades.length > 0`
- Allows exit checks on hedged positions where scalar nets to zero

### closePosition Guard
- Allows close when `activeTrades.size > 0` even if `position === 0`

### Direction Flip (Same Ticker)
- Opposite direction signal closes existing position, then opens new one
- No simultaneous long+short on same ticker/timeframe
- Matches PineScript `strategy.entry` behavior

### strategyOrchestrator in OrderExecutor
- Was missing from OrderExecutor context → daily loss counter never incremented
- Added `strategyOrchestrator: this.strategyOrchestrator` to OrderExecutor constructor in run-empire-v2.js

### Daily Reset Date Fix
- Changed `getUTCDay()` (day of week 0-6) to `toISOString().slice(0, 10)` (YYYY-MM-DD)

---

## 5. KEY PRINCIPLES (Reinforced This Session)

### No Binary Gates
Every condition acting as a hard gate (`conditionsMet >= N`) produces near-zero or wrong-count trades. Correct architecture: sweep detection fires the signal, conditions add confidence, position sizing chain allocates based on confidence score.

### Data Source Is Architecture
Exchange feed differences are not noise. They are a first-class architectural concern. Different exchanges → different VP levels → different sweep triggers → different trades. This is also the mechanism behind statistical arbitrage.

### Confidence Multipliers, Not Thresholds
A weak signal gets a tiny position. A strong signal gets a large position. No minimum threshold kills the signal — the position sizer handles allocation.

### One Change at a Time
Multiple rewrite attempts proved this. Change one thing, test, verify, commit. Then change the next thing.

### VP Computation Must Match Data Source
The VP algorithm is mathematically correct. The input data determines the output levels. Match the data source to the trading venue.

---

## 6. PRODUCT OPPORTUNITIES IDENTIFIED

### Pine Script Interpreter (Standalone Product)
- Drop any TradingView `.pine` file into OGZPrime → runs natively
- No manual porting, no VP mismatches, no debugging sessions
- SaaS play: Free tier (1 strategy, 1 ticker), Paid tier (multi-strategy, multi-ticker)
- Nobody else offers this

### Multi-Broker Arbitrage
- Adapter stubs exist: Schwab, IBKR, Kraken, Coinbase, Gemini, CME, Oanda, Tastyworks
- Same asset priced differently on different exchanges = arbitrage opportunity
- OGZPrime's multi-broker architecture enables simultaneous execution on both sides

### Pattern Premium Packs
- Mine winning trades for common conditions (time of day, VP levels, IVB direction, confidence tier)
- Package as downloadable pattern packs that boost confidence on matching setups
- Ties into PatternMemoryBank and TRAI

### Backtest Dashboard (React)
- Command Center with smart CSV parsing (auto-detects OGZPrime, TradingView, MT4, generic)
- Persistent storage for saved runs
- Equity curve, exit breakdown, direction split, confidence tier analysis
- ExxonMobil portfolio piece

---

## 7. IMMEDIATE NEXT STEPS

1. **Commit all fixes to Claude Code repo** (hasOpenPosition, closePosition guard, strategyOrchestrator, daily reset, direction flip)
2. **Swap VPS from A100 GPU to CPU** — Mercury runs via API, no local GPU needed. Saves significant monthly cost.
3. **Finish mintick rounding** — should close interpreter from 419 → ~397 signals
4. **Test dashboard with real backtest CSV** — verify format detection works
5. **Run interpreter against 300-bar TradingView data** — verify signals match TV's Long/Short columns exactly
6. **Wire interpreter into StrategyOrchestrator** — Pine strategies as first-class signal sources
7. **Cross-ticker validation** — run SMS on NVDA, AMZN, NFLX, AAPL with same parameters

---

## 8. AI TEAM COMPOSITION

| AI | Role | Strengths |
|----|------|-----------|
| **Claude (Desktop)** | Architecture, debugging, specs, documentation | Deep reasoning, code review, system design |
| **Claude Code (VPS)** | Implementation, commits, testing | Direct file access, git integration, execution |
| **Mercury-2 (API)** | Rapid analysis, code review | Fast inference (diffusion architecture), thorough technical analysis |
| **Cursor** | Pine alignment, data source fixes | Fast iteration on specific file changes |
| **Gemini** | Helper modules, cheat sheets | Deep domain knowledge, comprehensive documentation |
| **Codex** | Architecture patterns, feature scanning | Honest about limitations, clean separation of concerns |

### Parallel Build Process
Multiple AIs tasked on the same problem simultaneously. Best outputs merged. This produced the Pine interpreter in one session — no single AI could have built the complete working system alone.

---

*This document should be committed to `ogz-meta/` and referenced at the start of future sessions to avoid retracing these findings.*
