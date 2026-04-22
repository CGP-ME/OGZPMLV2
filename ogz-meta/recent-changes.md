
---

## 2026-04-22 (late session): Pre-Matrix Plumbing — L5 Obs, Per-Strategy ATR, ConfigLoader Crash Fix (7 commits)

**Impact:** CRITICAL — a 24-hour dormant crash in ConfigLoader blocked every entry point (live, paper, backtest, every sweep worker) between `1f3050f` and `57e8daa`. Plus architectural wins for observability (L5 riskGates) and per-strategy ATR isolation.

**Summary:** Wolf's MultiAsset broker-aware default spec (`1f3050f`) shipped a `envStr('BROKER', 'kraken').toLowerCase()` call inside `ConfigLoader.js`'s `tradingPair` default expression — but `envStr()` returns `{value, source}` for source tracking, not a bare string, so `.toLowerCase` was undefined. JS eager-evaluates function args, so it crashed at module load regardless of whether `TRADING_PAIR` was set. `run-empire-v2.js:3` imports ConfigLoader → every entry point dead-on-arrival. Discovered during Phase 0 baseline verification of the per-strategy ATR refactor, 24 hours after introduction. Fixed with raw `process.env.BROKER` read (the file's own header doctrine: ONLY ConfigLoader reads process.env — but nested defaults must use the raw read, not the tracking wrapper).

**Wins this session:**
- **L5 riskGates observability** (`a719edb`): every trade decision now carries the exact gate chain that allowed or blocked it. RiskManager `assessTradeRisk` and `isTradingAllowed` build arrays, TradingLoop collects from both, StateManager stores in ledger. No gate-logic changes.
- **Per-strategy ATR** (`2992f28`): Wolf spec executed. `exitContracts.<name>.atrMinPercent` per strategy (null = fall back to global). Reverse-splice loop replaces blanket-kill. Mercury 7/7 SAFE/EQUIVALENT + Phase 0 baseline reproduced bit-for-bit to the 14th decimal (`$17,950.589592711076 / 1430 trades / 57.55% WR / 2.63% DD`).
- **Matrix-sweep exits grid expansion** (`c7cef09`): 10 stopLoss points × `C(10,3) = 120` strict-monotonic tier cube = 1,200 configs per strategy. Eliminates duplicate tier labels Trey flagged earlier.
- **parallel-backtest reporter parity** (`1d8835f`): propagated the matrix-sweep reporter fixes that were missing on the sibling tool (Windows ATR sweep was showing `Trades: ?`).

**Mercury verification:** Per-strategy ATR static audit + empirical Phase 0 baseline reproduction, both clean. ConfigLoader crash discovered AFTER commit via Phase 0 rerun — Mercury was not dispatched before applying the 1f3050f spec. Going forward: Mercury audits specs before application, not after.

**Branch:** `alpaca/stocks-paper-flip`, commits `1d8835f..2992f28`

**Files Changed (code):**
- `core/StrategyOrchestrator.js`, `core/TradingConfig.js` (per-strategy ATR)
- `core/RiskManager.js`, `core/TradingLoop.js`, `core/StateManager.js`, `core/dto/DecisionLedgerSchema.js` (L5 riskGates)
- `core/MultiAssetManager.js`, `foundation/ConfigLoader.js` (broker-aware default + crash fix)
- `tools/matrix-sweep.js`, `tools/parallel-backtest.js` (sweep grid + reporter parity)

**Docs:** `ogz-meta/specs/apex-shipping-boundary.md` (PRE-APEX vs POST-APEX work classification, Mercury-drafted)

**Pending after this batch:**
- SessionRouter design + impl (blocks pattern-bank Phase 3 + clean market-transition swaps)
- PID coupling doc (Trey handling)
- Mercury Audit 2 (MaxProfitManager multi-tier wiring) + Audit 3 (7 unvalidated strategies infra parity)
- Asset-isolation audit (decision ledger, journal, pipeline snapshots, candle history)
- Per-strategy ATR sweeps to populate the null `atrMinPercent` values with validated numbers

---

## 2026-04-22: Alpaca Paper Trading Flip + Pattern Bank Isolation (14 commits)

**Impact:** CRITICAL — bot moved from Kraken BTC paper to Alpaca TSLA paper. Pattern bank architecture fixed after corruption incident.

**Summary:** `broker/alpaca-integration` branch had the AlpacaAdapter built (551 lines) but never registered in BrokerRegistry. Today flipped that switch: env-driven broker selection (`BROKER=alpaca` default), Alpaca registered, dashboard defaults switched BTC→TSLA. Midway through the flip, caught a pattern-bank corruption where `UnifiedPatternMemory` was keying storage by MODE only — 35 min of TSLA outcomes blended into 69K crypto patterns before catch. Recovery: nuked the contaminated file + contaminated runtime state. Architecture fix: asset-aware path resolution (live/paper = class bucket, backtest = per-ticker), plus `forceBackup()` method for future SessionRouter transitions.

**Mercury verification:** 7/7 claims CONFIRMED. One defensive flag on `MultiAssetManager.js:31` hardcoded BTC-USD fallback (runtime correct because .env has TRADING_PAIR=TSLA, but latent trap).

**Branch:** `alpaca/stocks-paper-flip`, 14 commits 419befd..24dea89

**Files Changed (code):**
- run-empire-v2.js (broker flip + extensive emoji/mojibake cleanup)
- brokers/BrokerRegistry.js (alpaca registered)
- brokers/BrokerFactory.js + brokers/AlpacaAdapter.js (emoji strip)
- core/BacktestRunner.js, core/BacktestRecorder.js, tools/matrix-sweep.js (matrix reporter + race + LOCKED_EXITS canonical + naming/routing)
- core/UnifiedPatternMemory.js (asset-aware path + forceBackup)
- public/unified-dashboard.html, public/js/chart.js, public/js/ChartManager.js (default asset TSLA)
- .env (TRADING_PAIR flipped BTC/USD → TSLA)

**Status:** Pushed. Bot running on Alpaca paper TSLA, pattern bank writing to `unified-patterns.paper.stocks.json`. 

---

## 2026-04-22: Matrix-Sweep — LOCKED_EXITS Canonical-Read Fix

**Impact:** CRITICAL — fixes silent-drift bug in matrix-sweep conf phase

**Summary:** matrix-sweep had its own hardcoded `LOCKED_EXITS` dict that had drifted from `TradingConfig.exitContracts` for 4 strategies. Confidence sweeps on MultiTimeframe/OGZTPO/OpeningRangeBreakout/SmartMoneySweep were silently using wrong baselines. Fix: read directly from `BASE_CONFIG.exitContracts`. Validated-4 strategies (RSI/EMASMA/MADynamicSR/LiquiditySweep) unchanged.

**File Changed:** tools/matrix-sweep.js

**Regression:** Full Phase 0 baseline replay = $17,950.589592711076 — match-to-the-cent.

**Status:** Committed `d78b6e4` + pushed.

---

## 2026-04-22: Matrix-Sweep — Output Naming + Worker Report Routing (Wolf spec)

**Impact:** QoL — readable leaderboard names + clean project root

**Summary:** Per Wolf's CC-SPEC-MATRIX-OUTPUT-NAMING.md. Two wins: (1) leaderboard files now named `matrix-{ticker}-{strategy}-{phase}-{date}-{ts}.json/csv` instead of opaque `matrix-{ts}.json`. (2) Per-worker reports route to `backtest-results/worker-reports/` instead of project root when `BACKTEST_REPORT_TAG` is set (matrix workers only). Standalone backtests keep legacy project-root path.

**Files Changed:**
- tools/matrix-sweep.js (getDataLabel helper, naming context in runMatrix, tryReadReport scan path)
- core/BacktestRunner.js (3-way reportPath branch: envRoot → workerDir → legacy root)

**Smoke test verified:** report lands in worker-reports/, Final Balance $17,950.589592711076 (no drift).

**Status:** Committed `102c98f` + pushed.

---

## 2026-04-22: Config Consolidation — Phase 1 Scaffold

**Impact:** SCAFFOLDING — Phase 1 of 14. Zero execution-path changes.

**Summary:** Per `CONFIG-CONSOLIDATION-SPEC.md §4.3` + V2 PATCH 4. Materializes `TradingConfig.BASE_CONFIG` to a canonical JSON at `config/trading.config.json` with a JSON Schema companion. Creates snapshot/matrix-run output dirs (gitignored contents) for Phase 6+ to populate. Resolves the `.env.gates` Phase-5-blocker investigation.

**Files Changed:**
- config/trading.config.json (new — 16.4KB, 24 keys, 4 _validated markers preserved)
- config/trading.config.schema.json (new — Draft-07 schema)
- config/snapshots/.gitkeep + README.md (new)
- config/matrix-runs/.gitkeep (new)
- .gitignore (added config/snapshots/* and config/matrix-runs/* runtime excludes)
- ogz-meta/specs/phase1-env-gates-investigation.md (new — Mercury + PM2 runtime verdict)

**.env.gates verdict:** Local-only sidecar for scripts/generate-live-proof.js. None of 3 live PM2 processes set DOTENV_CONFIG_PATH=.env.gates. Keep as sidecar, no Phase 5 action.

**Approval gates pending:**
1. Operator review — does config/trading.config.json represent current config intent?
2. Mercury diff — JSON values vs .env-resolved values must match before Phase 2 starts.

**Also:** CC issued false "Mercury hallucinated" accusation mid-investigation. Manual re-read of cited lines 239-242 proved Mercury correct. Corrected in feedback-verify-before-claiming.md memory with specific pattern: when cross-checking Mercury, inspect the EXACT cited lines, not a nearby range.

**Status:** Committed `cb1f0a5` + pushed. Mercury reindex follow-up.

---

## 2026-04-22: Matrix-Sweep Per-Worker Report Isolation — Race Condition Fix

**Impact:** CRITICAL for parallel matrix sweeps — eliminates silent cross-worker data contamination

**Summary:** Under parallelism, all 14 matrix workers wrote reports to project root; `tryReadReport` grabbed newest by mtime which wasn't guaranteed to be this worker's file. Each worker's report filename now suffixed with its `BACKTEST_REPORT_TAG` (uid); `tryReadReport` filters by that tag. Infrastructure was pre-wired at matrix-sweep.js:234 (uid generation) and :272 (env pass) but consumer end was unwired.

**Files Changed:**
- core/BacktestRunner.js (tag reads from BACKTEST_REPORT_TAG env, appended to filename when present)
- tools/matrix-sweep.js (tryReadReport accepts optional tag param + filters by it, call site passes uid)

**Regression:** Full Phase 0 baseline replay with race-fix = $17,950.589592711076 / 1,430 trades / 57.6% WR / 2.63% DD — match-to-the-cent.

**Smoke test:** BACKTEST_REPORT_TAG=smoke-race-test-tag produced file `backtest-report-v14MERGED-1776821581939-smoke-race-test-tag.json`.

**Back-compat:** Standalone backtests (no tag) get unchanged filenames. grid-search-confidence.js regex matches any `.json` → no breakage.

**Post-commit cleanup:** Safe to `rm backtest-report-v14MERGED-*.json` to clean accumulated pre-fix reports from project root.

**Status:** Committed `747909d` + pushed. Mercury reindex follow-up.

---

## 2026-04-21: Matrix-Sweep Reporter Bug Chain Fix — 4 bugs + expectancy

**Impact:** CRITICAL for tuning — matrix-sweep JSON now has full 23-field summary instead of 7

**Summary:** Atomic fix for reporter bug chain discovered during Phase 0 validation. `BacktestRunner` never called `BacktestRecorder.getSummary()` — silently dropped 16 metric fields (profit factor, drawdown, streaks, strategy/exit breakdowns) from every backtest JSON. `matrix-sweep` downstream then parsed a partial set via broken regex that missed 4 of 10 fields (`Net P&L` + prefix, `Avg Winner`/`Avg Loser` name mismatches, `Expectancy` never emitted). Plus `unlinkSync` destroyed per-worker reports post-read.

**Files Changed:**
- core/BacktestRecorder.js (expectancy added to getSummary + printSummary)
- core/BacktestRunner.js (spread getSummary into report.summary, preserve totalReturn alias)
- tools/matrix-sweep.js (4 regex fixes, tryReadReport expanded to 10 fields, unlink removed, header updated)

**Not fixed (tracked in backlog):**
- Per-worker BACKTEST_OUTPUT_DIR routing (race condition under parallelism, tryReadReport grabs newest-by-mtime which may not be your worker's file). Tracked in POST-MATRIX-BACKLOG.

**Verification:** Unit-level smoke test on BacktestRecorder confirmed 24 fields in getSummary, expectancy computation correct, printSummary emits Expectancy line. Regex validation: all 10 matrix-sweep patterns match live printSummary output.

**Status:** Committed `643a3c9` + pushed. Mercury reindex follow-up.

---

## 2026-04-20: Doc Alignment Sweep — 15 items across 11 alignment files

**Impact:** DOCS ONLY — zero execution-path code changes

**Summary:** Batched doc commit consolidating alignment state after brain-bug fixes + config consolidation Phase 0 + DEC-001 $970.71 anchor retirement. Full BEFORE/AFTER delta table at `ogz-meta/specs/doc-alignment-sweep-2026-04-20.md`.

**Files Changed:**
- ogz-meta/BACKTEST-OPS.md (Items 1, 11)
- ogz-meta/BACKTEST-PIPELINE-AUDIT.md (Item 2)
- ogz-meta/BACKTESTING_GUIDE.md (Items 3, 10, 13)
- ogz-meta/MASTER-ROLLOUT.md (Items 4, 15)
- ogz-meta/ENV-VAR-AUDIT.md (Item 7)
- tools/matrix-sweep.js (Item 8 — header comment only)
- ogz-meta/METHODOLOGY-VALIDATION-PIPELINE.md (Item 9 — 6 edits)
- ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md (Item 12)
- ogz-meta/specs/decision-ledger-schema.json (Item 6)
- ogz-meta/TODO-NEXT-SESSION.md (Item 14a)
- ogz-meta/RUNNING-TODO.md (Item 14b)
- ogz-meta/specs/doc-alignment-sweep-2026-04-20.md (new summary doc)

**Status:** Committed `70d0566` + pushed. Desktop v1+v2 audit rounds applied before commit. Mercury reindex + fixes.jsonl entry follow-up commit.

---

## 2026-04-20: Config Consolidation Migration — Phase 0 Baseline

**Impact:** BASELINE — reference numbers for 14-phase config migration

**Summary:** Recorded pre-migration backtest numbers on `config/consolidation` branch. Every subsequent phase (1-14) must reproduce these to the cent before advancing per CONFIG-CONSOLIDATION-SPEC.md §4.2.

**Numbers:**
- Final $17,950.59 (+79.5% / +$7,950.59) on $10K
- 1,430 trades, 57.55% WR (823W/607L)
- 2.63% max drawdown (well under Apex 5%)
- $15.37 avg win / -$7.75 avg loss (2:1 asymmetric)
- 44.4s wall-clock on 15,889 TSLA 15m candles

**Files Changed:**
- ogz-meta/specs/baseline-phase0-2026-04-20.md (new)

**Status:** Pushed as 2dbec67. Awaiting Phase 1 approval gate (scaffold JSON config + schema).

**Gotcha:** Initial run hung at 27min CPU. Re-ran with `timeout 300` wrapper. Every phase re-verify must include timeout + BACKTEST COMPLETE marker check.

---

## 2026-03-26: Long-Only Pipeline Fix (17 Bugs)

**Impact:** CRITICAL - Shorts were completely broken

**Summary:** Complete audit of pipeline revealed 17 locations where code assumed long-only trading. All fixed:

- TradingLoop: Added SELL_SHORT decision branch
- OrderExecutor: Added SELL_SHORT entry + COVER exit handlers
- StateManager: Direction storage, negative position support, balance accounting
- Exit system: Direction-aware PnL in all checkers
- RiskManager: Bypass now defaults to false

**Files Changed:**
- core/TradingLoop.js
- core/OrderExecutor.js
- core/StateManager.js
- core/ExitContractManager.js
- core/exit/DynamicTrailingStop.js
- core/exit/TrailingStopChecker.js
- core/RiskManager.js

**Status:** Pushed, awaiting backtest verification

