# OGZPrime Backtest Operations Manual
## Operational Command Reference for Running Backtests

**Date:** 2026-03-30  
**Commit to:** `ogz-meta/BACKTEST-OPS.md`

---

## CURRENT STATUS NOTE — 2026-05-23

This file is an operational command reference, not the canonical Phase 0
regression anchor.

Canonical P0 is enforced by `ogz-meta/anchor-runner.js` and its current full
anchor is `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`.

Manual commands in this file are for targeted backtests, exploratory runs, and
tuning. A command that omits `SOLO_STRATEGY` is a no-SOLO, winner-takes-all
orchestrator run. It enables multiple strategies to compete, but it does not
blend strategies into one combined signal and it is not the P0 anchor.

For strategy tuning, prefer the sweep tools. `tools/matrix-sweep.js` and the
SOLO modes in `tools/parallel-backtest.js` run strategy-isolated configs by
setting `SOLO_STRATEGY` per worker.

---

## HOW BACKTESTING WORKS

One codebase, one pipeline. Backtests run through the SAME code path as live trading:

```
BacktestRunner.loadHistoricalDataAndBacktest()
  → for each candle:
      → handleMarketData()        (CandleProcessor)
      → analyzeAndTrade()         (TradingLoop)
        → StrategyOrchestrator.evaluate()  (all strategies scored)
        → OrderExecutor.executeTrade()      (position sizing, entry)
        → StopLossChecker / TrailingStop    (exit management)
      → BacktestRecorder.recordTrade()     (trade logging)
  → exportCSV('./backtest-trades.csv')
```

There is NO separate backtest engine. `EXECUTION_MODE=backtest` disables broker connections and reads from file instead of live feed. Everything else is identical.

---

## STRATEGY REGISTRY

### Active Strategies (SOLO_STRATEGY names)

| SOLO_STRATEGY | ENABLE_* flag | Config section | Status | Notes |
|---|---|---|---|---|
| `RSI` | `ENABLE_RSI=true` | strategies.RSI | ✅ LOCKED | Walk-forward validated 2026-03-20. SL -0.8%, TP 1.0%, min conf 60% |
| `MADynamicSR` | `ENABLE_MASR=true` | strategies.MADynamicSR | ✅ LOCKED | Walk-forward validated 2026-03-20. SL -0.8%, TP 1.0% |
| `EMASMACrossover` | `ENABLE_EMA=true` | strategies.EMACrossover | ✅ LOCKED | Walk-forward validated 2026-03-20. SL -0.5%, TP 1.0% (per TradingConfig.exitContracts.EMASMACrossover). Decay 10 bars, snapback 2.5%. |
| `LiquiditySweep` | `ENABLE_LIQSWEEP=true` | strategies.LiquiditySweep | ✅ Active | 50-bar lookback, disableSessionCheck=true |
| `SmartMoneySweep` | `ENABLE_SMS=true` | strategies.SmartMoneySweep | ⚠️ Validating | VP-based sweeps, 5-day lookback, RTH-only VP |
| `OpeningRangeBreakout` | `ENABLE_ORB=true` | strategies.OpeningRangeBreakout | ⚠️ Disabled | ICT-style, needs tuning |
| `MarketRegime` | `ENABLE_REGIME=true` | - | ⚠️ Deprecated | Now a confidence multiplier, not a strategy |
| `MultiTimeframe` | `ENABLE_MTF=true` | - | ✅ Active | Multi-TF confluence |
| `OGZTPO` | `ENABLE_TPO=true` | - | ✅ Active | Time-price opportunity |

### SOLO_STRATEGY Mode

Isolates a single strategy for clean testing. The orchestrator only evaluates the named strategy.

```bash
SOLO_STRATEGY=RSI                    # Single strategy
SOLO_STRATEGY=RSI,EMASMACrossover    # Comma-separated for combos
```

Without `SOLO_STRATEGY`, all enabled strategies are evaluated, then
`StrategyOrchestrator` selects a single winning strategy per candle. This is a
winner-takes-all competition, not a blended combined signal.

---

## DATA FILES

### Available (in `tuning/`)

| File | Ticker | Timeframe | Period | Candles |
|---|---|---|---|---|
| `tsla-15m-18mo.json` | TSLA | 15m | Sep 2024 - Mar 2026 | ~25,037 |
| `full-45k.json` | BTC | 15m | Jan 2024 - Apr 2025 | ~45,812 |
| `spy-15m-2y.json` | SPY | 15m | 2 years | ~25K |
| `qqq-15m-2y.json` | QQQ | 15m | 2 years | ~25K |
| `nvda-15m-2y.json` | NVDA | 15m | 2 years | ~25K |
| `amd-15m-2y.json` | AMD | 15m | 2 years | ~25K |
| `pltr-15m-2y.json` | PLTR | 15m | 2 years | ~25K |
| `riot-15m-2y.json` | RIOT | 15m | 2 years | ~25K |
| `mara-15m-2y.json` | MARA | 15m | 2 years | ~25K |
| `coin-15m-2y.json` | COIN | 15m | 2 years | ~25K |

### Data file config

```bash
CANDLE_SOURCE=file
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json   # Override per-run
# Default in TradingConfig: tuning/full-45k.json
```

**CRITICAL:** `full-45k.json` is BTC data. Stock strategies tested against BTC data will produce garbage. Always specify the correct data file.

---

## ENV VAR REFERENCE

### Execution Control

| Variable | Default | Values | What it does |
|---|---|---|---|
| `EXECUTION_MODE` | `paper` | `live`, `paper`, `backtest` | Trading mode |
| `CANDLE_SOURCE` | `live` | `live`, `file` | Data source |
| `CANDLE_DATA_FILE` | `tuning/full-45k.json` | path | Candle data for backtest |
| `BACKTEST_MODE` | `false` | bool | Enable backtest mode |
| `BACKTEST_FAST` | `false` | bool | Skip delays |
| `BACKTEST_NO_PATTERN_SAVE` | `false` | bool | Don't save patterns (faster) |
| `DIRECTION_FILTER` | `both` | `long_only`, `short_only`, `both` | Trade direction |
| `SOLO_STRATEGY` | none | strategy name(s) | Isolate strategies |
| `ACCOUNT_DRAWDOWN_BYPASS` | `false` | bool | Skip drawdown check |

### Fee Configuration

| Variable | Default | What it does |
|---|---|---|
| `FEE_MAKER` | varies | Maker fee as decimal (0.001 = 0.1%) |
| `FEE_TAKER` | varies | Taker fee as decimal |

Set both to 0 for gross P&L comparison. Set to realistic values for net P&L.

### Strategy Toggles

| Variable | Default | Strategy |
|---|---|---|
| `ENABLE_RSI` | `true` | RSI mean reversion |
| `ENABLE_MASR` | `true` | MA Dynamic S/R |
| `ENABLE_EMA` | `true` | EMA/SMA Crossover |
| `ENABLE_LIQSWEEP` | `true` | Liquidity Sweep |
| `ENABLE_SMS` | `false` | Smart Money Sweep |
| `ENABLE_ORB` | `false` | Opening Range Breakout |
| `ENABLE_REGIME` | `false` | Market Regime (deprecated as strategy) |
| `ENABLE_MTF` | `true` | Multi-Timeframe |
| `ENABLE_TPO` | `true` | OGZ TPO |

### SMS-Specific

| Variable | Default | What it does |
|---|---|---|
| `SMS_VP_RTH_ONLY` | `true` | VP computed from RTH bars only |
| `SMS_VP_DAYS` | `5` | Days of data for VP calculation |
| `SMS_VP_LOOKBACK_BARS` | `0` | Override VP lookback (0 = use vpDays) |
| `SMS_SWEEP_MAX_OFFSET` | `3` | Max bars after sweep for entry |
| `SMS_MAX_LOSS` | `0.3` | Max loss % per trade |
| `SMS_MAX_DAILY_LOSSES` | `3` | Max losing trades per day |
| `SMS_MAX_HOLD` | `60` | Max bars to hold |

### Component Toggles

| Variable | Default | What it does |
|---|---|---|
| `ENABLE_TRAI` | `false` | TRAI AI advisor |
| `ENABLE_RISK` | `true` | Risk manager |
| `ENABLE_DASHBOARD` | `true` | Web dashboard |
| `ENABLE_NOTIFICATIONS` | `true` | Notifications |
| `LLM_PROVIDER` | `mercury` | TRAI LLM backend |
| `LLM_API_KEY` | none | API key for LLM |

### Confidence & Sizing

| Variable | Default | What it does |
|---|---|---|
| `MIN_TRADE_CONFIDENCE` | `0.35` | Global minimum confidence to enter |
| `MAX_POSITION_SIZE_PCT` | `0.04` | Max position as % of balance |
| `STOP_LOSS_PERCENT` | `2.0` | Default stop loss % |
| `TAKE_PROFIT_PERCENT` | `2.5` | Default take profit % |

**NOTE:** Per-strategy configs in TradingConfig override these globals. RSI has minConfidence=0.60, for example.

### Trade Narrator (Phase C — `core/TradeNarrator.js`)

The narrator walks the operator / customer through every phase of a trade
(pattern spotted → strategies evaluated → sized → entered → tiered exits →
closed). **OFF BY DEFAULT.** When both env flags are unset every hook is a
cheap branch (`if (!narrator.enabled) return`) with zero allocation and
zero stdout / WebSocket traffic. Phase 0 regression runs must produce
byte-identical trade output vs. pre-narrator code.

| Variable | Default | Values | What it does |
|---|---|---|---|
| `ARCHITECT_NARRATOR` | unset (off) | `1`, `true`, `on`, `yes` | Detailed operator-facing stdout: exact strategy names, exact confidence, exact sizing math, full SL/TP percents. **Never** broadcast to the dashboard — stdout only. Use for your own console while paper / live trading. |
| `USER_NARRATOR` | unset (off) | `1`, `true`, `on`, `yes` | Sanitized customer-facing narration. Strategy names replaced with session-seeded anonymous labels (`Strategy-A`, `Strategy-B`…), confidence bucketed (Low/Medium/High/Peak), win rate bucketed (Learning/Emerging/Validated/Proven), sample counts bucketed (New/Emerging/Established/Mature). Emitted to stdout AND broadcast to the dashboard as `narrator_event` messages (scope: `USER`) for the Chain-of-Thought panel. Safe to run with customers watching. |
| `NARRATOR_LABEL_SEED` | random per process | any string | Optional pin for USER-mode strategy anonymization. Leave unset and labels reshuffle on every restart (maximizes opacity to outside observers). Set a stable value if you want reproducible USER transcripts across runs. |

Both flags are independent — run either, both, or neither:

```bash
# Operator console only (no customer visibility)
ARCHITECT_NARRATOR=true node run-empire-v2.js

# Customer-facing dashboard narration only (sanitized)
USER_NARRATOR=true node run-empire-v2.js

# Both modes simultaneously (your console + customer dashboard)
ARCHITECT_NARRATOR=true USER_NARRATOR=true node run-empire-v2.js

# Pin anonymization labels across runs (reproducible transcripts)
USER_NARRATOR=true NARRATOR_LABEL_SEED=ogz-2026-q2 node run-empire-v2.js
```

**Safety guarantees:**
- Narrator code is wrapped in try/catch at every hook site — a narrator
  bug cannot take down the trading pipeline.
- Narrator is a pure sink: it formats events callers push in. It never
  reaches back into `StateManager` / `TradingConfig` / live trades.
- USER-mode WebSocket broadcast uses the dashboard's existing auth'd
  connection; never opens a new socket.
- USER-mode output never contains raw strategy names, raw multipliers,
  raw win rates, or config values — only qualitative buckets.
- Scope recommendation: `paper` and `live` modes. Backtest is supported
  but will flood stdout at ~45k candle runs; prefer narrator OFF for
  matrix sweeps / Phase 0 regressions.

---

## BACKTEST COMMANDS

### Individual Strategy Testing

```bash
# RSI only — regression anchor (~$970 on TSLA 18mo)
SOLO_STRATEGY=RSI \
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js

# SMS only
SOLO_STRATEGY=SmartMoneySweep \
SMS_VP_RTH_ONLY=true \
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 FEE_TAKER=0 ENABLE_SMS=true DIRECTION_FILTER=both \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js

# MADynamicSR only
SOLO_STRATEGY=MADynamicSR \
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js

# EMA Crossover only
SOLO_STRATEGY=EMASMACrossover \
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js
```

### Exploratory No-SOLO Winner-Takes-All Run (Not P0)

This command evaluates all enabled strategies through the orchestrator and lets
the highest-confidence qualified strategy own each trade. Use it only as an
exploratory multi-strategy competition run. Do not treat this as strategy
blending, a per-strategy tuning result, or the canonical P0 anchor.

```bash
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both \
ENABLE_SMS=true \
ACCOUNT_DRAWDOWN_BYPASS=true \
node run-empire-v2.js
```

### Cross-Ticker Validation (Same Params, Different Data)

```bash
for DATA in tsla-15m-18mo.json spy-15m-2y.json qqq-15m-2y.json nvda-15m-2y.json; do
  echo "=== $DATA ==="
  SOLO_STRATEGY=RSI \
  EXECUTION_MODE=backtest CANDLE_SOURCE=file \
  CANDLE_DATA_FILE=tuning/$DATA \
  BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true \
  FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both \
  ACCOUNT_DRAWDOWN_BYPASS=true \
  node run-empire-v2.js 2>&1 | grep -E "Net P|Win Rate|Profit Factor|Drawdown"
done
```

### Matrix Sweep (Full Parameter Optimization)

```bash
# Quick sanity check
node tools/matrix-sweep.js --data tsla --quick

# Single strategy full sweep
node tools/matrix-sweep.js --data tsla --solo=RSI

# Exit parameter sweep only
node tools/matrix-sweep.js --data tsla --phase exits

# Confidence sweep only
node tools/matrix-sweep.js --data tsla --phase conf

# Full grid (800+ configs, ~30min on 7800X3D)
node tools/matrix-sweep.js --data tsla
```

### Parallel Backtester

```bash
node tools/parallel-backtest.js --quick       # 5 configs
node tools/parallel-backtest.js --boosters    # Alpha booster sweep
node tools/parallel-backtest.js --full        # Full 60+ configs
```

---

## PROFILES (Pre-made .env files)

| Profile | File | Usage |
|---|---|---|
| No-SOLO winner-takes-all backtest | `profiles/backtest-all.env` | Exploratory multi-strategy competition run, not P0 |
| RSI only | `profiles/backtest-rsi.env` | RSI isolation |
| MASR only | `profiles/backtest-masr.env` | MADynamicSR isolation |
| Paper trading | `profiles/paper.env` | Live feed, simulated execution |
| Production | `profiles/production.env` | REAL MONEY — live trading |

**Usage:**
```bash
# Load profile (if using dotenv)
DOTENV_CONFIG_PATH=profiles/backtest-rsi.env node run-empire-v2.js

# Or inline env vars override profile:
DOTENV_CONFIG_PATH=profiles/backtest-rsi.env \
CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json \
node run-empire-v2.js
```

**IMPORTANT:** Profiles use `CANDLE_FILE=tuning/full-45k.json` (BTC data) by default. Override with `CANDLE_DATA_FILE` for stock data.

---

## POST-BACKTEST ANALYSIS

### Pattern Harvester
```bash
node pattern-harvester.js backtest-trades.csv --export=pattern-pack.json
node tools/harvest-pattern-pack.js  # Alternative location
```

### Pine Interpreter Signal Count
```bash
node pine-transpiler/signal-count-test.js
# Target: ~397 signals on TSLA 18mo
```

### Dashboard (drag CSV)
Open `public/command-center.html` in browser, drag `backtest-trades.csv` onto it.

---

## KNOWN PITFALLS

### 1. Wrong Data File
`full-45k.json` is BTC. Stock strategies on BTC = meaningless results. Always specify `CANDLE_DATA_FILE`.

### 1a. P0 Anchor vs Manual Exploratory Runs
Use `ogz-meta/anchor-runner.js` for canonical P0 verification. Manual commands
in this file can intentionally exercise different strategy sets, data files,
direction filters, and toggles such as `ENABLE_SMS=true`; those runs are not
P0 unless they are launched through the anchor runner or exactly match its
documented env.

### 2. ACCOUNT_DRAWDOWN_BYPASS
Drawdown calculation was fixed at core/StateManager.js:99 on 2026-03-14. Setting `ACCOUNT_DRAWDOWN_BYPASS=false` enables the halt — bot force-closes at `accountDrawdownPercent` threshold (default -10%, StopLossChecker.js:48-62).

STATUS 2026-04-20: operator's `.env` currently has `ACCOUNT_DRAWDOWN_BYPASS=true`, and Phase 0 baseline (ogz-meta/specs/baseline-phase0-2026-04-20.md) runs with bypass=true. Prior walkback runs exceeded -10% account drawdown but did not halt because bypass was true. Exact halt-point verification is deferred to a post-fix baseline re-run with bypass=false.

NOTE: This item CONTRADICTS `ogz-meta/BACKTESTING_GUIDE.md:48` which claims the bypass is "Currently REQUIRED in backtests because the drawdown calculation is broken" — that claim is stale (pre-2026-03-14 fix) and is corrected in the 2026-04-20 alignment sweep.

### 3. ENABLE_SMS Default
SMS is `false` by default. If testing SMS, you MUST set `ENABLE_SMS=true` explicitly.

### 4. ENABLE_REGIME
Was a strategy, now deprecated. It's a confidence multiplier in the orchestrator. Setting `ENABLE_REGIME=true` has no effect on strategy evaluation.

### 5. Env Var Leaks in Parallel
Each parallel-backtest worker gets its own env. But if you have a `.env` file in the project root, it may override worker env vars. Check for stale `.env` files.

### 6. Pattern State Persistence
Without `BACKTEST_NO_PATTERN_SAVE=true`, pattern memory accumulates across backtests and contaminates future runs. Always set it for clean backtests.

### 7. State Files
`data/state-*.json` files persist between runs. The parallel backtester cleans these up, but manual runs may leave stale state. Delete `data/state-*.json` if results seem off.

### 8. Per-Strategy Config Overrides
`MIN_TRADE_CONFIDENCE=0.35` is the global default, but RSI has `minConfidence: 0.60` in its strategy config. The per-strategy config wins. Changing the global won't affect strategies with their own minConfidence.

### 9. Exit System
`EXIT_SYSTEM=contract` vs `legacy` affects which exit manager runs. The backtest-strategies.js file forces `EXIT_SYSTEM=legacy`. Make sure your env matches what you intend to test.

### 10. Data Source Mismatch
TradingView uses Cboe/BATS RTH-only data. Polygon.io uses consolidated tape with ETH. VP levels will differ by $6-26 between sources. This is NOT a bug — it's different data. See `ogz-meta/SESSION-BLUEPRINT-2026-03-30.md` for full explanation.

---

## OUTPUT FORMAT

`backtest-trades.csv` columns:
```
trade_number, entry_time, exit_time, direction, entry_price, exit_price,
stop_loss, take_profit, raw_pnl_dollars, fees_dollars, net_pnl_dollars,
net_pnl_percent, strategy_name, confidence, exit_reason, balance_after,
hold_time_minutes
```

---

## APEX EVAL TARGETS

| Parameter | Target |
|---|---|
| Profit | ~15% ($3K-$6K depending on account) |
| Max trailing drawdown | < 5% |
| Daily loss limit | Varies by account |
| Clone target | 20 accounts × $25K each = $500K |

---

*This is the single source of truth for backtesting. If a command isn't here, it doesn't exist.*
