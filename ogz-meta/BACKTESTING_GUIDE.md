Here's the cold-reader version. Anyone walking into the repo for the first time can read this and know exactly what to do.

OGZPrime Backtesting Guide & Env Var Audit
Last updated: 2026-04-07
Branch: tradingloop-clean-rewrite
Read this first if you've never backtested OGZPrime before.

1. What is OGZPrime?
OGZPrime (OGZPMLV2) is a Node.js algorithmic trading bot for US equities. It runs multiple trading strategies in parallel, picks the highest-confidence signal each candle, and executes via a broker (Alpaca for live, simulated for backtests). The goal is passing Apex prop firm evaluations: roughly 15% profit with under 5% drawdown.
The codebase has three layers that matter for backtesting:
Strategies — independent modules that look at price data and emit buy/sell signals. The current strategies are RSI, EMASMACrossover, MADynamicSR, LiquiditySweep, MarketRegime, MultiTimeframe, OGZTPO, OpeningRangeBreakout, and SmartMoneySweep. Each one is self-contained and decides on its own whether to fire.
Orchestrator (core/StrategyOrchestrator.js) — runs all enabled strategies on each candle, collects their signals, picks the highest-confidence winner, and hands the trade to the executor. If multiple strategies agree on direction, it scales position size up (1x for one signal, 1.5x for two, 2x for three, 2.5x for four+).
Execution + State (core/OrderExecutor.js, core/StateManager.js, core/BacktestRecorder.js) — handles opening/closing positions, tracks balance and P&L, records every trade for the backtest report.

2. Three things that look the same but aren't
This is where most confusion lives. Read carefully.
A strategy is a piece of code in modules/ that generates signals. Example: RSI is a strategy.
A pipeline toggle is an env var that turns a strategy on or off in the orchestrator. Example: ENABLE_RSI=true allows RSI to register. ENABLE_RSI=false removes it from the orchestrator entirely. The pipeline toggle is the master switch.
SOLO_STRATEGY is an env var that filters which registered strategies are allowed to fire on a given run. Example: SOLO_STRATEGY=RSI means "only let RSI fire even if other strategies are enabled."
Both must agree for a strategy to actually run. If ENABLE_RSI=false and SOLO_STRATEGY=RSI, RSI will not fire — the pipeline toggle blocks it before SOLO_STRATEGY ever gets checked. This has bitten people. Always set both.
An exit contract is a per-strategy hardcoded set of stop-loss, take-profit, trailing stop, max-hold, and minimum-confidence values. Each strategy ships with a _validated block that locks these values. Example: RSI's exit contract is SL=-0.8%, TP=1.0%, trailing=0.6%, maxHold=240min, minConfidence=0.60. These locked values override most env vars. This is the single most important thing to understand about backtesting OGZPrime: you cannot tune SL/TP via env var. You have to edit the exit contract directly in core/TradingConfig.js and re-validate.

3. The two ways to run a backtest
Single backtest — runs the bot once with one configuration. Use this for isolating a strategy or validating a single config change.
bashSOLO_STRATEGY=RSI \
ENABLE_RSI=true \
EXECUTION_MODE=backtest \
CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-2y.json \
BACKTEST_MODE=true \
BACKTEST_FAST=true \
BACKTEST_NO_PATTERN_SAVE=true \
ACCOUNT_DRAWDOWN_BYPASS=true \
FEE_MAKER=0 \
FEE_TAKER=0 \
ENABLE_TRAI=false \
DIRECTION_FILTER=both \
ENABLE_SHORTS=true \
node run-empire-v2.js
The convenience wrappers backtest.sh (Linux) and backtest.ps1 (Windows) handle this for you with named presets.
Sweep backtest — runs many configurations in parallel and produces a leaderboard. Use this for finding which environmental settings work best.
bashnode tools/parallel-backtest.js --real --stocks --data tsla
The sweep tool (tools/parallel-backtest.js) spawns child processes, each with a different env var configuration, and collects results into a JSON report and a console leaderboard. It only sweeps env vars that actually do something. The old --quick and --full sweeps included presets that varied env vars the strategies ignore (see Section 5). The --real sweep added 2026-04-07 only varies HONORED env vars.

4. Env Var Reference
Each row tells you whether the env var actually changes trading behavior, where to find it in the code, and what it does.
HONORED — these change behavior
Env VarCode LocationWhat It DoesSOLO_STRATEGYStrategyOrchestrator.jsComma-separated list. Only these strategies are allowed to fire. Example: RSI,EMASMACrossoverENABLE_RSI / ENABLE_EMA / ENABLE_SMS / ENABLE_MASR / ENABLE_LIQSWEEP / ENABLE_MTF / ENABLE_TPO / ENABLE_BREAKRETEST / ENABLE_REGIME / ENABLE_ORBTradingConfig.js pipeline sectionPer-strategy master switch. Must be true for the strategy to register.DIRECTION_FILTERTradingLooplong, short, or both. Filters which trade directions are allowed.ENABLE_SHORTSTradingLooptrue/false. Hard switch for short-side trading. Should match DIRECTION_FILTER.EXECUTION_MODErun-empire-v2.jsbacktest, paper, or live. Picks which execution layer runs.CANDLE_SOURCEBacktestRunnerfile for backtest, live for real data feed.CANDLE_DATA_FILEBacktestRunnerPath to the candle JSON file. Example: tuning/tsla-15m-2y.jsonBACKTEST_MODEMultipletrue activates backtest-specific code paths (skips state persistence, etc.)BACKTEST_FASTMultipletrue skips notifications, dashboard broadcasts, slow logging.BACKTEST_NO_PATTERN_SAVEPattern memory modulestrue prevents backtest from polluting the live pattern memory.INITIAL_BALANCEStateManager.jsStarting USD balance. Default 10000.FEE_MAKER / FEE_TAKEROrderExecutor.jsPer-trade fee percentage. Set to 0 for zero-commission stocks.ATR_FILTER_ENABLEDStrategyOrchestrator.js:725true activates the volatility filter that blocks trades in dead markets.ATR_MIN_PERCENTStrategyOrchestrator.js:727Minimum ATR-as-percent-of-price required to allow entry. Example: 0.15MAX_POSITION_SIZE_PCTOrderExecutor.js:57,71Base position sizing as fraction of balance. Example: 0.05 for 5%. The orchestrator multiplies this by confidence (0.5x–2.5x) and confluence (1x–2.5x).TIER1_TARGET / TIER2_TARGET / TIER3_TARGETMaxProfitManager.js:105-111Profit-taking tier thresholds in percent. Example: 0.5 / 1.0 / 2.0RISK_MANAGER_BYPASSRiskManager.js:88,159true short-circuits all risk checks. Use ONLY for isolated strategy testing.ACCOUNT_DRAWDOWN_BYPASSStopLossChecker.js:48true disables the drawdown circuit breaker. Currently REQUIRED in backtests because the drawdown calculation is broken and fires on every trade when enabled.ENABLE_TRAIMultipletrue activates the LLM-backed pattern modulation layer. Set false for pure strategy backtests.SMS_VP_RTH_ONLYSmartMoneySweeptrue makes SMS use only regular trading hours candles for volume profile.STRATEGY_DIAGStrategyOrchestrator.jstrue enables verbose diagnostic logging for every strategy evaluation.
PARTIAL — read but only matters in some paths
Env VarCode LocationWhy PartialMIN_TRADE_CONFIDENCETradingLoop.js:133Used as the global entry gate. But each strategy also has its own minConfidence inside its locked exit contract (e.g., RSI requires 0.60). The strategy's per-strategy minimum overrides this for that strategy. Acts as a global floor only.
IGNORED — read into config but never affects trading
Env VarWhy IgnoredSTOP_LOSS_PERCENTEvery strategy has a locked exit contract with its own SL. The global default is never consulted.TAKE_PROFIT_PERCENTSame — locked exit contracts override.TRAILING_STOP_PERCENTSame — locked exit contracts override.
These env vars look like they should work. They don't. Setting them in any backtest is decorative. If you want to change SL/TP/trailing, you have to edit the strategy's exit contract directly in core/TradingConfig.js.
GHOST — referenced in old code but not read by trading logic at all

TRAILING_STOP_ENABLED
REGIME_FILTER_ENABLED
REGIME_ALLOW_TRENDING / REGIME_ALLOW_RANGING / REGIME_ALLOW_VOLATILE / REGIME_ALLOW_QUIET

These exist as references in parallel-backtest.js and possibly old config files. No live trading code reads them. They were removed from the rewritten sweep presets on 2026-04-07.

5. The Backtesting Playbook
Pick the test that matches what you're trying to find out. Each test has a different env var setup.
Test 1 — Pure strategy validation
Question: Does this strategy work on its own with zero environmental interference?
When to use: You added a new strategy, modified an existing one, or want to know its raw edge before adding any filters.
Setup:
bashSOLO_STRATEGY=<strategy_name>     # Only this strategy fires
ENABLE_<strategy>=true            # Master switch on
ENABLE_TRAI=false                 # No LLM modulation
ATR_FILTER_ENABLED=false          # No volatility gating
RISK_MANAGER_BYPASS=true          # No risk-mgr cuts
ACCOUNT_DRAWDOWN_BYPASS=true      # Drawdown check is broken
DIRECTION_FILTER=both
ENABLE_SHORTS=true
FEE_MAKER=0
FEE_TAKER=0
BACKTEST_MODE=true
BACKTEST_FAST=true
BACKTEST_NO_PATTERN_SAVE=true
INITIAL_BALANCE=10000
CANDLE_DATA_FILE=tuning/tsla-15m-2y.json
EXECUTION_MODE=backtest
CANDLE_SOURCE=file
What the result tells you: The raw P&L, win rate, and trade count of the strategy with zero environment interference. If this is negative, the strategy itself is broken or unsuited for the dataset. No amount of environmental tuning will save it.
How to read it: Look at the BacktestRecorder summary block (NOT the StateManager balance — that print is stale). Specifically check trade count, win rate, profit factor, max drawdown, and exit reason breakdown.
Test 2 — Environmental sensitivity sweep
Question: How does this strategy react to different environmental settings (volatility filters, position sizing, profit tiers)?
When to use: You have a working strategy from Test 1 and want to find the best environmental wrapper for it.
Setup: Use the parallel-backtest sweep tool with the --real preset:
bashnode tools/parallel-backtest.js --real --stocks --data tsla --solo=<strategy_name>
The --real sweep only varies HONORED env vars: ATR_MIN_PERCENT, MAX_POSITION_SIZE_PCT, TIER1/2/3_TARGET, and bypass toggles.
What the result tells you: A leaderboard of environmental configurations sorted by P&L. The winning config tells you which environment amplifies the strategy's edge.
How to read it: Look for spread. If all 10 results are within $50 of each other, the environment doesn't matter much for this strategy. If results span thousands, the environment is a major factor and you should run the winning config in Test 1 to confirm.
Test 3 — Multi-strategy interaction
Question: Do my strategies help each other or fight each other?
When to use: You have multiple working strategies and want to know if combining them produces a better result than any one alone.
Setup:
bashSOLO_STRATEGY=RSI,EMASMACrossover    # Comma-separated
ENABLE_RSI=true
ENABLE_EMA=true
# Everything else from Test 1
What the result tells you: Combined P&L. Compare against the sum of solo P&Ls from Test 1.
How to read it: If combined > sum of solos, confluence is helping (the orchestrator's confluence sizing is a real edge). If combined < best single solo, confluence is dragging down the winner — usually because a weaker strategy is winning the orchestrator vote on candles where the stronger strategy would have won otherwise.
Test 4 — Exit contract tuning
Question: Can I improve a strategy's locked SL/TP/trailing values?
When to use: Test 1 confirmed a strategy works but you suspect the exit values are leaving money on the table.
Setup: This is NOT a backtest sweep. Env vars don't help here. Process:

Open core/TradingConfig.js
Find the strategy's exit contract block (search for the strategy name)
Comment out the _validated line so the locked-config warning doesn't fire
Modify SL, TP, trailing, maxHold values directly
Run Test 1 (pure validation) with the new values on training data
If improved, run on a separate test dataset (held-out data the strategy wasn't tuned on)
If still improved, restore the _validated line with today's date as the new fingerprint
Commit the change with a clear message: tune: <strategy> exit contract SL X→Y based on walk-forward validation

One strategy at a time. No shortcuts. No sweeping. This is the slowest but highest-leverage form of tuning.
Test 5 — Live readiness paper trade
Question: Will the bot behave correctly on the next live tick?
When to use: Before deploying to live trading. Catches integration bugs that backtests miss.
Setup:
bashEXECUTION_MODE=paper
PAPER_TRADING=true
CANDLE_SOURCE=live
ENABLE_TRAI=true                  # Now we want LLM modulation
ATR_FILTER_ENABLED=true           # Real environmental gating
RISK_MANAGER_BYPASS=false         # Real risk checks
ACCOUNT_DRAWDOWN_BYPASS=false     # ⚠️ ONLY when drawdown calc is fixed
FEE_MAKER=<real broker rate>
FEE_TAKER=<real broker rate>
WARNING: Test 5 is currently UNSAFE because ACCOUNT_DRAWDOWN_BYPASS=false triggers the broken drawdown calculation. Do not run Test 5 until the drawdown bug is fixed. Until then, paper test with bypass=true and accept that you're not exercising the drawdown circuit breaker.

6. Landmines (read these before running anything)

ACCOUNT_DRAWDOWN_BYPASS=true is currently REQUIRED in backtests. The drawdown calculation is broken and fires on every trade when enabled, killing legitimate trades. This bypass must stay on until the calc is fixed. This means the production drawdown safety net is currently UNTESTED in backtest. Treat live deployment with caution.
SOLO_STRATEGY and ENABLE_* are independent gates. Setting one without the other gives you silent zero-trade results. Always set both.
Locked exit contracts override most env vars. Setting STOP_LOSS_PERCENT=0.5 does nothing for any strategy in the codebase. Edit the strategy's contract directly in TradingConfig.js if you need to change exits.
The StateManager balance print at end of backtest is STALE. Trust BacktestRecorder's summary block, not the Final Balance: $XXX line that comes from StateManager. They will disagree. BacktestRecorder is the truth source.
parallel-backtest.js wipes some parent shell env vars before spawning workers (STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, MIN_TRADE_CONFIDENCE, TRAILING_STOP_PERCENT, ATR_MIN_PERCENT) but NOT the ENABLE_* toggles. If you have stale ENABLE_* values in your shell from a previous run, they leak into every worker. Always run from a clean shell or use the wrapper scripts which set everything explicitly.
Two config systems exist (core/TradingConfig.js and foundation/ConfigLoader.js) with overlapping defaults. They can disagree on values for env vars like STOP_LOSS_PERCENT. This is a known cleanup item.
TRADING_VIEW PineScript and Polygon.io disagree on volume profile levels by $6–26 because TradingView uses Cboe/BATS regular-hours-only data while Polygon provides consolidated tape including pre/post market candles. Don't expect VP levels to match between Node.js backtest and TradingView chart.


7. Quick Reference: Which test for which question?
QuestionTestDoes my new strategy work?Test 1Should I add an ATR filter?Test 2Should I run RSI alone or combined with EMA?Test 3Can I improve RSI's stop loss?Test 4Is my bot ready for live trading?Test 5 (when drawdown is fixed)Why is SMS producing 0 trades?Test 1 with STRATEGY_DIAG=trueWhy are my sweep results all the same number?Read Section 5 — you're probably sweeping IGNORED env varsWhy does my Windows backtest produce different results than VPS?You almost certainly have an env var mismatch. Diff .env files.

8. Change Log

2026-04-07 — Initial guide. Audited all env vars. Identified STOP_LOSS_PERCENT / TAKE_PROFIT_PERCENT / TRAILING_STOP_PERCENT as IGNORED due to locked exit contracts. Identified TRAILING_STOP_ENABLED and REGIME_* as ghost env vars. Rewrote SWEEP_PRESETS in parallel-backtest.js to remove decorative presets. Added --real sweep mode that only varies HONORED env vars. Documented the five-test playbook for the first time.


Tell Claudito: "Save this as BACKTESTING-GUIDE.md at repo root. Replace any existing version. Commit it in the same commit as the SWEEP_PRESETS rewrite. Don't modify any of the content — paste it verbatim. This is the entry point for anyone touching backtests in the future."