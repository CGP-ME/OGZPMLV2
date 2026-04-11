# OGZPrime Backtest Operations Manual
## The Single Source of Truth for Running Backtests

**Date:** 2026-03-30  
**Commit to:** `ogz-meta/BACKTEST-OPS.md`

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
| `EMASMACrossover` | `ENABLE_EMA=true` | strategies.EMACrossover | ✅ Active | Decay 10 bars, snapback 2.5% |
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

Without SOLO_STRATEGY, ALL enabled strategies fire simultaneously.

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

### All Strategies Combined

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
| All strategies backtest | `profiles/backtest-all.env` | Tests everything together |
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

### 2. ACCOUNT_DRAWDOWN_BYPASS
Drawdown calculation was fixed on 2026-03-14 (core/StateManager.js:99). Safe to run with `ACCOUNT_DRAWDOWN_BYPASS=false` now. Set to `true` only for isolated strategy testing where you want to skip drawdown checks entirely.

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
