
---

## 2026-04-29 → 2026-04-30: Wolf's Post-Phase-3 Execution Queue Shipped + 2 Production Hotfixes (11 commits)

**Impact:** HIGH — entire 9-item queue from `CC-SPEC-POST-PHASE3-EXECUTION-QUEUE.md` shipped end-to-end + 2 production hotfixes. ~24 Mercury attack-framed adversarial rounds, ~55 real defensive bugs caught and fixed across the queue (beyond Wolf's documented spec items). Bot stable end-of-session; restart counter froze after the Kraken hotfix.

**Phase 0 baseline:** Bot was crash-looping every ~23min at session start (`WebSocket is not defined` errors during venue transitions; Alpaca offline all day; no trades since morning). End-of-session: stable, error log clean, reconciler gate firing on boot.

**Headline production fix (`ab0c860`):** `KrakenIBrokerAdapter.js:316` referenced `WebSocket.OPEN` (browser global) without `require('ws')`. Every venue transition to crypto threw `ReferenceError`, draining Alpaca subscriptions in the half-completed swap. One-character fix matching existing pattern at line 75 of the same file. Restart counter froze at 42 (was incrementing every 23min).

**Wolf's queue (9 commits):**
- `ba7ca59` Gap detector layered on aggregator emissions (monotonic clock, 5-min floor, partial-misconfig branch with two-path latch reach)
- `7a34a4b` Alpaca `_placeOrder` USD/shares dispatch + 13-bug hardening pass (CRITICAL pre-live; pre-fix $500 USD became 500 shares = $187,500)
- `dc9970a` `cancelAllOrders` on both adapters with native timeouts + response-shape validation (11 bugs)
- `a07516a` Broker-first liquidation in SessionRouter (15 bugs; pre-fix bot would record itself flat while broker still held the position)
- `7007edd` (production hotfix) Kraken WS `readyState=0` race — `setImmediate` defer dodges Sentry/OpenTelemetry async-hooks instrumentation timing. Error log went 132+ → 0 per boot.
- `ef43815` FAULTED state on transition failure (replaces silent auto-resume that let bot re-enter half-swapped venue)
- `f97434d` `NoWickImbalance` added to matrix-sweep ALL_STRATEGIES (also bundled an unrelated SYMBOL_MAP refactor — hygiene note)
- `712d772` Hardcoded dashboard token removed from 3 active source files (3-priority runtime injection chain; **token IS in git history regardless** — operator must rotate)
- `93f7f79` `package.json` `private: true` (one line, prevents npm publish leak)
- `175e59a` ExchangeReconciler wired with paperMode-aware gate + post-swap reconciliation in SessionRouter; rethrow on failure routes to FAULTED. Caught a destructure-require regression via 30 PM2 crash-restarts in smoke (recovered in 60s).

**Methodology that paid off:** Mercury attack-framed dispatch with `--max-tokens=7750`, `--agentic`, exact line ranges, hunt-freely framing. Average per-commit: 2-3 Mercury rounds → "defended" verdict. Most real bugs surfaced were defensive-validation gaps (NaN/Infinity handling, structural shape validation, status enumeration, race-window elimination) — small individually, collectively the difference between "passes happy path" and "defensible as a contract."

**Three things that bit me tonight (lessons logged):**
1. **Bundled commits**: Commit 6 picked up uncommitted SYMBOL_MAP refactor. `git diff --staged` before commit catches this.
2. **Module-export shape**: Wolf's spec assumed positional args; actual export is `{class, getInstance}`. Smoke test caught the regression in 30 crash-restarts via PM2 respawn.
3. **`timeout` on backtest**: hookify rule blocked me when I tried to wrap matrix-sweep in `timeout`. Hooks codifying feedback memory rules ARE the structural enforcement Trey put in place.

**Open items for next session (queued before live):**
- Adapter-agnostic ExchangeReconciler refactor (Kraken-specific today; required before live flip)
- Stale broker pointer in reconciler after SessionRouter swap (same root cause as above)
- Dashboard token rotation + BFG history scrub (operator action)
- 3× `.bak` file deletion (`git rm` + `.gitignore` rule, awaiting approval)
- `ExchangeReconciler.start()` double-start guard (one-line follow-up)

**Branch:** `alpaca/stocks-paper-flip`. Full session record at `ogz-meta/sessions/session-2026-04-29-30-post-phase3-execution-queue-shipped.md`.

---

## 2026-04-30: Matrix-Sweep TRADING_PAIR Fix — Live=Backtest Parity Restored (2 commits)

**Impact:** HIGH — Multi-Symbol Phase 3+4 backtest grid had been silently dead since `9be305b` shipped (2026-04-29). Every matrix-sweep config across the 416-grid produced `trades=null / netPnl=0 / exitCode=0` because workers had no `TRADING_PAIR` env, ConfigLoader defaulted `tradingPair='BTC-USD'`, and the new per-symbol routing in CandleProcessor.js:188 early-returned on every bar. Walk-forward sweeps blocked across 5 validated + 5 unvalidated strategies until this fix.

**Phase 0 baseline:** unchanged. Production code (BacktestRunner.js, CandleProcessor.js) byte-identical to HEAD pre-session. Fix is pure tooling — `tools/matrix-sweep.js` only.

**Highlights:**
- **Trey's principle:** *"these two systems are supposed to be the exact same code save env vars or feature flags."* Initial path patched BacktestRunner+CandleProcessor with backtest-only escape hatches; each "fix" exposed a deeper gate. Reverted via Edit (no `git reset --hard`) and pivoted to the single env-var injection.
- **One-shot diag:** `console.log` on first candle showed `ctx.tradingPair=undefined` definitively — ended speculation in 30 seconds and confirmed the deviation was env-config not pipeline-logic.
- **Fix:** `36e57aa` SYMBOL_MAP per --data shortcut + thread dataKey + inject TRADING_PAIR. Pipeline went `0 warmups / 0 emissions / 2.3s silent` → `20 warmups / 3,583 emissions / 6.2s real`.
- **Mercury 3-pass adversarial audit:** pass 1 caught 2 real bugs (`BROKER=kraken` + `TRADING_PAIR=TSLA` crash, regex fallback corrupting raw filepaths). Pass 2 (after refactor to `{symbol, broker}` + hard-error on unknown shortcuts) caught 1 latent precedence bug (`config.env` could override BROKER injection). Pass 3 returned all-defended on 3 new attack vectors. Findings shape converged.
- **Architectural refactor in `c653800`:** SYMBOL_MAP→`{symbol, broker}` is now single source of truth tying each shortcut to its validating broker. Hard-error on unregistered shortcuts replaces regex fallback. TRADING_PAIR + BROKER moved LAST in `Object.assign` chain as policy invariants — future `config.env` drift cannot regress.

**Operational milestone:** the entire Multi-Symbol Phase 3+4 backtest grid is unblocked. Walk-forward on all 5 validated strategies + 5 unvalidated strategies can now run.

**Lessons:**
- When backtest diverges from live, FIRST hypothesis: "what env var or config does live set that backtest didn't?" — not "what code path differs?"
- Mercury attack-framed prompts (CONSTRUCT/TRACE/COMPUTE) found bugs verify-framed prompts would have missed.
- Mercury pass-2 architectural framing ("is this the right shape?") catches precedence/coupling bugs invisible at the bug-class level.
- SYMBOL_MAP-as-single-source-of-truth pattern: when two coupled values can drift, key them to the same registry rather than separate lists.

**Branch:** `alpaca/stocks-paper-flip`, full session record at `ogz-meta/sessions/session-2026-04-30-matrix-sweep-trading-pair.md`.

---

## 2026-04-27: Mercury Audit Cycle + No-Deferred Adoption + First Live Alpaca (~28 commits, mine + parallel CC)

**Impact:** HIGH — 9+ real bugs closed across Mercury audits A/B1/C1/C2, no-deferred rule codified at the project-rule level (CLAUDE.md), and the bot transitioned to first-ever live Alpaca paper trading at ~12:55 PM EDT. Two operational milestones in one day: rule-of-engineering change + production validation of the resilience stack.

**Phase 0 baseline:** unchanged from prior session (`$17,551.91169513058 / 1265 / 61.5% WR / 2.66% DD / 2.67 PF`). No core-trade-logic touched today — audit work was entirely on the resilience-and-supervision layer.

**Highlights:**
- **Audit A (ResilientWebSocket)**: maxPayload cap (`0f66df5`), then re-attack found boundary-evasion + post-terminate race, fixed via token-bucket + capTripped (`292d2eb`)
- **Audit B1 (Supervisor)**: 5 findings closed in `a894efc` (HMAC + pidStartTime + bounds + legacy rejection). Then 5-round adversarial refinement on Finding 3 (register-before-start), closing 14 interaction bugs caught BEFORE landing in main (`21efb63`). Dual-timestamp ledger via `803ccde`.
- **Audit C1 (Alpaca migration)**: Tasks 1+2 verified EQUIVALENT by direct diff. Task 3 + bonus callback-overwrite bug closed by parallel CC's `28c070b` — that commit is what actually unblocked live Alpaca trading.
- **No-Deferred rule**: saved to memory + indexed in MEMORY.md + codified in CLAUDE.md (`8dffc81`). Sibling rule next to Document Accuracy + Reindex — completes the Mercury-output-quality triad.
- **Iteration-cap anti-pattern self-owned**: 4 separate Mercury dispatches hit max-iterations cap. Trey called the pattern out mid-session. Corrective: single yes/no questions for Mercury, not 3-task open-ended adversarial sweeps.

**First live Alpaca:** `[Alpaca] First bar RX for TSLA @ 2026-04-27T18:14:00Z OHLCV: 379.39` — and 6 more symbols. Bot transitioned to TRADING RESUMED after warmup hit 3 candles. SessionRouter + ResilientWebSocket + Supervisor + AlpacaAdapter validated end-to-end.

**Branch:** `alpaca/stocks-paper-flip`, full session record at `ogz-meta/sessions/session-2026-04-27-mercury-audit-cycle-no-deferred.md`.

**Open items for next session:** Fix #1 Tasks 1B + 1C re-dispatch (missed during iteration-cap thrashing), Audit D supervisor-daemon initial dispatch, stale-doc triage execution.

---

## 2026-04-25 → 2026-04-27: Asset Isolation + Strategy Parity + Bot Swap Resilience + Session-Doc Manifest (~20 commits)

**Impact:** HIGH — 3 audit gauntlets closed (Strategy Parity, Bot Swap Resilience, Asset Isolation), 9 dangerous half-cooked items burned to zero, $298 dashboard mismatch closed, SessionRouter flipped LIVE, and a new session-doc pattern established to stop the doc-drift problem.

**New Phase 0 baseline:** `$17,551.91169513058 / 1265 trades / 778W/487L / 61.5% WR / 2.66% DD / 2.67 PF` (post `16c1b1c` April 25 sweep-winners apply). Old baseline ($17,950.58…) superseded — Trey accepted "-$400 for better win rate and step-forward validation."

**Highlights:**
- **Strategy parity wired**: `minConfidence: null` added to all 10 unvalidated contracts (`d50394a`), per-strategy gate wired in StrategyOrchestrator (`fb8985a`)
- **SessionRouter LIVE**: flag flipped (`bec08c3`), Phase 10 deferred, docs corrected (`5d39230`, `2623d7c`), boot crash fixed (`deb276e`)
- **Bot swap resilience**: IndicatorEngine.reset() across asset transitions (`45d2b0b`), candle-history.json clear (`4433126`), abort-on-close-failure (`36d2da7`)
- **Asset isolation**: TradeJournal symbol fields (`b58d729`), PipelineSnapshot symbol (`53513fb`), BacktestRunner asset slug filenames (`35ab407`)
- **$298 dashboard fix**: CandleProcessor broadcasts `getEquity(price)` instead of free-cash sentinel (`707e370`)
- **Mercury tool expansion** (parallel CC): web_fetch (`b57493a`), git_show (`76a9a1b`), tavily_search (`d9a6bf2`)
- **Supervisor B1/B2/B3** (parallel CC): clock-monotonic + parallel polling (`29670af`), restart history persistence (`df344f5`), by-design docs (`91be425`)

**Process change:** Adopted **append-only dated session docs** as canonical record going forward. Old "mutate MASTER-ROLLOUT and rolling TODO docs" pattern was producing 14-day-stale docs and Mercury index pollution. New rule: every session writes one frozen doc under `ogz-meta/sessions/`. See `ogz-meta/sessions/SESSION-DOC-MANIFEST.md` for full standard. Full session record: `ogz-meta/sessions/session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md`.

**Branch:** `alpaca/stocks-paper-flip`, commits `d50394a..b57493a`

---

## 2026-04-23 (overnight): Dashboard deploy + exit-path unit-safety + SMS cleanup (9 commits)

**Impact:** HIGH — 6 new dashboard files from Cursor Claude shipped (chart polish, bot-offline watchdog, pill, matrix CSV leaderboard, TRAI backend tuning). Plus 3 exit-path safety fixes with Mercury audits (tier4 guard, OrderExecutor legacy branch deletion, SMS dead-log cleanup). Strategy roster went from 4 validated to 8 after Audit 3 added CandlePattern + MarketRegime + MultiTimeframe + SmartMoneySweep.

**Highlights:**
- **Exit-path unit-safety**: StateManager tier4 guard `>=` → `>` (`95225ba`), OrderExecutor legacy `exitSize`-as-fraction branch deleted (`d7a485c`), SMS dead debug logs deleted (`0e20116`). All Mercury-verified, all Phase 0 baseline bit-for-bit.
- **Dashboard deploy**: 6 files from Cursor Claude — chart scale split, real-time feel restored, crosshair tooltip, bot-offline pill + watchdog, TRAI disclaimer drop + token budget 200→600, command-center matrix CSV leaderboard.
- **Mercury verdicts**: Audit 2b (tier4 edge case confirmed), Audit 3 (3 strategies FULL PARITY added to sweep roster, BreakRetest confirmed DISABLED dead code), SMS reachability (MISSING branch UNREACHABLE).

**Branch:** `alpaca/stocks-paper-flip`, commits `95225ba..0e20116`

**Files Changed (code):**
- `core/StateManager.js`, `core/OrderExecutor.js`, `core/StrategyOrchestrator.js`
- `public/js/chart.js`, `public/js/core.js`, `public/unified-dashboard.html`
- `public/trai-widget.js`, `public/command-center.html`, `ogzprime-ssl-server.js`

**Phase 0 baseline across this window:** $17,950.589592711076 / 1430 trades / 57.55% WR / 2.63% DD / 2.69 PF — reproduced bit-for-bit after every core-touching commit.

**Ready for Cursor's multi-phase product build:** NLP layer, narrator system, Phase 1-3 dashboard, 7 new widgets, TRAI JSON endpoints, MarketEventGuard, Whale activity widget, Command Palette. 12-phase plan drawn up. Cursor builds + tests locally + posts verification; we install + re-verify + commit on VPS.

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

