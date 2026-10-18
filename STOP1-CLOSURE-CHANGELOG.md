# OGZPrime — STOP 1 Closure Changelog (Current-HEAD Audit)

**Baseline code:** [`codex/archive-legacy-env@db11d5c9cb2f8c96350d04b54a85000d774129f5`](https://github.com/CGP-ME/OGZPMLV2/tree/db11d5c9cb2f8c96350d04b54a85000d774129f5) · **Audit date:** 2026-10-17.

**Purpose:** One living ledger for config source-of-truth, silent override elimination, orphan proof, and provenance. **Not a declaration of STOP 1 completion.** Findings are ID-stable; never automatically reopen old documents or reuse a finding as authority without verifying this exact code.

**Boundaries:** NO new strategies or architectural redesign. No live broker calls, PM2 restarts, or destructive deletion implied by this ledger. Verified code behavior requires exercised receipts; static source maps are not executable proofs. Worktree changes not on remote HEAD are unavailable and MUST be accounted for separately before final acceptance.

## Completed factual checks

- [x] Correct branch and source SHA established from remote GitHub.
- [x] Both canonical JSON files parsed at pinned HEAD: `settings.json` has 2,893 leaves/terminal empty objects, `internals.json` has 1,069 (3,962 total; arrays expanded, empty arrays contribute zero). This is not consumer coverage.
- [x] Current source tree enumerated for executable JavaScript/TypeScript and public HTML candidate locations; source files are explicitly listed below.
- [x] Preliminary lexical scan of 290 distinct non-test JS/TS files outside `public` for direct `process.env`, `dotenv`, and simple `config.foo || literal` / `?? literal` idioms. This is not AST completeness or a reachability verdict.
- [x] Compared same JSON leaf paths across settings/internals: overlaps observed only at `schemaVersion` and `revision`; role-specific revision projection checked in loader.
- [ ] Whole-repository import + dynamic loader + reflective access graph complete.
- [ ] Full AST literal/assignment/fallback inventory with semantic disposition for EVERY reachable executable.
- [ ] Every canonical leaf tied to producer, loader path, consumer and effective value (including profile-specific and tool roles).
- [ ] Live/paper/backtest consumer-effective parity established; no unreported fallback or override remains.
- [ ] Proven orphans deleted without removing reachable dynamic imports; blast-radius receipts archived.
- [ ] Control-panel + dashboard settings and display values verified against effective runtime state.
- [ ] Current tests and paper boot receipts passed for all corrections; no deploy without explicit approval.
- [ ] Obsolete STOP 1 documentation retired only AFTER this ledger and required machine-executable evidence are complete and verified.

## Finding register (stable IDs, do NOT check off on an agent's assertion)

| ID | Status | Discovery |
| --- | --- | --- |
| [ ] S1-001 | OPEN — orphan candidate | MA extension filter |
| [ ] S1-002 | OPEN — orphan candidate | Trade intelligence constructed but uncalled |
| [ ] S1-003 | OPEN — confirmed live value | Global warmup = 15 hidden in TradingLoop |
| [ ] S1-004 | OPEN — confirmed independent UI state | Risk gauge displays locally stored 5% budget |
| [ ] S1-005 | OPEN — confirmed test-coverage gap | Existing AST config boundary does not census literals or all roots |
| [ ] S1-006 | OPEN — tool-only direct env to classify | Legacy backtest / validation behavior env |
| [ ] S1-007 | OPEN — scope/reachability | TRAI research mode bypasses canonical config |
| [ ] S1-008 | OPEN — suspected legacy-only config modules | Orphan and local-default candidates |
| [x] S1-009 | VERIFIED — no action | Duplicate revision names are role-specific |
| [x] S1-010 | VERIFIED — no action | OptimizedIndicators twoPole split is explicitly merged |
| [ ] S1-011 | OPEN — scoped consumer proof | Performance validator may be legacy path |
| [ ] S1-012 | OPEN — confirmed competing gate | Regime classification hardcoded 0.25 overrides configured threshold |
| [ ] S1-013 | OPEN — confirmed live source literal | Fibonacci analysis waits for hardcoded 30 candles |
| [ ] S1-014 | OPEN — confirmed live source literal | SmartMoneySweep wrapper has its own 50-candle gate |
| [ ] S1-015 | OPEN — reachability and ownership | PID controller sample-count and history constants |

### Source facts, required correction and closure criteria

#### S1-001 — MA extension filter

**Classification:** OPEN — orphan candidate.

**Grounded source:** Instantiated without arguments at [`core/StrategyOrchestrator.js:841`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/StrategyOrchestrator.js#L841). Its constructor locally supplies nine behavioral values at [`core/MAExtensionFilter.js:14–26`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/MAExtensionFilter.js#L14-L26). Only declaration and assignment to `this.maExtensionFilter` were found inside StrategyOrchestrator; no invocation on that property. **Do not reclassify as active risk gate without a caller; do not delete until dynamic-call and import graph proof.**

**Closure:** Trace runtime dereferences / reflective consumers. If truly unused, remove instantiation/import and the module only after blast-radius proof; otherwise give all nine leaves canonical ownership and prove effective values.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-002 — Trade intelligence constructed but uncalled

**Classification:** OPEN — orphan candidate.

**Grounded source:** [`run-empire-v2.js:738–749`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/run-empire-v2.js#L738-L749) injects six hardcoded P&L/time values; the class has more defaults at [`core/TradeIntelligenceEngine.js:50–76`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/TradeIntelligenceEngine.js#L50-L76). Runner references to `this.tradeIntelligence` appear only in the constructor block, despite logging ACTIVE or SHADOW MODE. This is NOT proof that the engine's `evaluate()` influences orders.

**Closure:** Resolve all consumers of the instance (including dynamic access). Then remove inert wiring, or migrate actually active behavioral values and prove consumption. Do not create a new trade exit layer.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-003 — Global warmup = 15 hidden in TradingLoop

**Classification:** OPEN — confirmed live value.

**Grounded source:** [`core/TradingLoop.js:1280–1303`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/TradingLoop.js#L1280-L1303) blocks the current analysis path when history has fewer than 15 candles. [`core/TradingLoop.js:505`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/TradingLoop.js#L505) repeats the value in risk-gate reporting. No dedicated universal-warmup leaf appeared in either current canonical JSON file during the targeted key census; existing per-strategy warmups are separate.

**Closure:** Decide canonical customer-tunable owner under settings; migrate all code and reporting uses together; verify 14/15-candle boundary and preserve current value unless explicitly ruled otherwise.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-004 — Risk gauge displays locally stored 5% budget

**Classification:** OPEN — confirmed independent UI state.

**Grounded source:** [`public/js/panels/risk-gauge.js:38–52`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/public/js/panels/risk-gauge.js#L38-L52) sets 5% default. [`public/js/panels/risk-gauge.js:122–145`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/public/js/panels/risk-gauge.js#L122-L145) loads browser localStorage and derives loss budget; [`public/js/panels/risk-gauge.js:480–481`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/public/js/panels/risk-gauge.js#L480-L481) persists changes locally. Dashboard includes this module at [`public/unified-dashboard-v2.html:1120`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/public/unified-dashboard-v2.html#L1120). This is **display-side**, not evidence that broker/runtime risk policy was changed.

**Closure:** Verify intended display semantics. Either explicitly label as personal UI-only gauge or bind its displayed enforced-risk claim to authoritative runtime state, never let a browser-local number impersonate an execution gate.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-005 — Existing AST config boundary does not census literals or all roots

**Classification:** OPEN — confirmed test-coverage gap.

**Grounded source:** [`scripts/check-config-boundary.js:6–26`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/scripts/check-config-boundary.js#L6-L26) names its default source roots, omitting `backtest/`, most `scripts/`, `tools/`, `trai_brain/`, and inline HTML. Its [`scripts/check-config-boundary.js:451–466`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/scripts/check-config-boundary.js#L451-L466) silent-override detector targets `||` tied to environment or ConfigLoader calls, not arbitrary constructor local defaults like S1-001/S1-002.

**Closure:** Keep existing guard intact and record supplementary literal/source graph coverage. Do not expand default guard into independent tooling until credentials/bootstrap semantics are separated and false positives adjudicated.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-006 — Legacy backtest / validation behavior env

**Classification:** OPEN — tool-only direct env to classify.

**Grounded source:** [`backtest/OptimizedBacktestEngine.js:370`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/backtest/OptimizedBacktestEngine.js#L370) reads `TRADING_TIER || 'ml'` inside its direct CLI launch; [`tools/trade-validator.js:43–48`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/tools/trade-validator.js#L43-L48) reads `CANDLE_FILE`, `ISOLATE`, and `FEES_PCT` directly, with `parseFloat(...) || 0.50` shadowing zero. These were outside the AST guard default roots. **Not established as part of the live bot.**

**Closure:** Determine whether the tools are supported executable paths. For supported backtests/validators, use canonical descriptors and effective provenance; otherwise classify/archive with source evidence.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-007 — TRAI research mode bypasses canonical config

**Classification:** OPEN — scope/reachability.

**Grounded source:** [`trai_brain/research_mode.js:20–30`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/trai_brain/research_mode.js#L20-L30) uses `process.env.TRAI_RESEARCH_ENABLED`, `TRAI_SEARCH_ENDPOINT`, and local rate-limit defaults. Not established as a live trading-path consumer; may be a standalone research subsystem.

**Closure:** Trace import/instantiation and role boundaries. If on bot runtime, eliminate behavioral env bypass; if a separate tool, record its explicit independent authority.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-008 — Orphan and local-default candidates

**Classification:** OPEN — suspected legacy-only config modules.

**Grounded source:** [`core/AdaptiveTimeframeSelector.js:15–33`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/AdaptiveTimeframeSelector.js#L15-L33) contains embedded timeframe exit templates and local defaults. [`core/MarketRegimeDetector.js:36–88`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/MarketRegimeDetector.js#L36-L88) and [`core/SupportResistanceDetector.js:16–49`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/SupportResistanceDetector.js#L16-L49) contain local decision settings. Current main runner uses `RegimeDetector` by a different class name. No direct use of these three candidate classes was seen in the sampled entrypoint/orchestration sources; that is NOT yet a whole-repo dead-code verdict.

**Closure:** Static graph + dynamic loader blast-radius proof first; classify each as RETAIN, MIGRATE, or PROVEN-ORPHAN. No deletion based on naming or one grep.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-009 — Duplicate revision names are role-specific

**Classification:** VERIFIED — no action.

**Grounded source:** Both canonical files have `schemaVersion` and `revision`. `revision` values at this pinned commit are 15 (settings) and 6 (internals). [`foundation/ConfigLoader.js:585–624`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/foundation/ConfigLoader.js#L585-L624) explicitly returns settings revision for the relevant roles and internals revision for supervisor. This is intentional distinct role projection, not automatically a competing trading owner.

**Closure:** Maintain separate provenance receipts per role. Recheck if loader routing changes.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-010 — OptimizedIndicators twoPole split is explicitly merged

**Classification:** VERIFIED — no action.

**Grounded source:** `config/settings.json:indicators.optimized.twoPole` owns behavior keys while internals `twoPole` owns storage/presentation keys. [`core/OptimizedIndicators.js:55–61`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/OptimizedIndicators.js#L55-L61) explicitly merges both when constructing the oscillator, rather than relying on the shallow parent object spread.

**Closure:** Preserve two-source leaf-level ownership; verify behavior with runtime snapshot during acceptance.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.

#### S1-011 — Performance validator may be legacy path

**Classification:** OPEN — scoped consumer proof.

**Grounded source:** [`core/PerformanceDashboardIntegration.js:9–43`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/PerformanceDashboardIntegration.js#L9-L43) creates `new PerformanceValidator()` with no canonical settings. [`core/PerformanceValidator.js:11–27`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/PerformanceValidator.js#L11-L27) has local performance thresholds. The principal runner does not directly import PerformanceDashboardIntegration in the entrypoint review; that does not prove dynamic consumers absent.

**Closure:** Trace all consumers of the integration. If orphan, remove with graph proof; if live, migrate thresholds before changing display or auto-disable behavior.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending where marked OPEN.


#### S1-012 — Regime classification hardcoded 0.25 overrides configured threshold

**Classification:** OPEN — confirmed competing gate.

**Grounded source:** [`core/StrategyOrchestrator.js:2726–2754`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/StrategyOrchestrator.js#L2726-L2754) only classifies a regime when `regimeConfidence >= 0.25`. The trend-regime gate then requires `regimeType === 'trending' && regimeConfidence >= trendRegimeGate.minConfidence` at [`core/StrategyOrchestrator.js:2750–2755`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/StrategyOrchestrator.js#L2750-L2755). But `strategyBehavior.trendRegimeGate.minConfidence` is a canonical customer setting with valid range 0–1 per [`foundation/ConfigLoader.js:2621–2623`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/foundation/ConfigLoader.js#L2621-L2623). Thus selecting 0.10 while confidence is 0.20 still fails the trend-regime gate because `regimeType` stays `unknown`. It also suppresses configured regime boosts until the hidden 0.25 boundary.

**Closure:** Preserve current default behavior, but make classification ownership explicit and ensure a valid configured threshold cannot be silently superseded by the other threshold. Verify a table across confidence 0.10/0.20/0.25/0.30 with trend gate enabled and disabled, and cite before/after decisions.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending.

#### S1-013 — Fibonacci analysis waits for hardcoded 30 candles

**Classification:** OPEN — confirmed live source literal.

**Grounded source:** [`core/TradingLoop.js:1067`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/TradingLoop.js#L1067) and [`core/TradingLoop.js:2052`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/TradingLoop.js#L2052) gate Fibonacci processing at `priceHistory.length >= 30`. Canonical `fibonacci.lookbackCandles` is 100; it may govern the detector's own lookback rather than this minimum readiness gate. Do not equate the two without tracing the detector.

**Closure:** Trace detector's true minimum and owning setting. If 30 is a behavior-affecting independent gate, relocate it to settings without changing its default; otherwise document an internal invariant and remove redundant gating only with parity proof.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending.

#### S1-014 — SmartMoneySweep wrapper has its own 50-candle gate

**Classification:** OPEN — confirmed live source literal.

**Grounded source:** [`core/StrategyOrchestrator.js:2121–2133`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/StrategyOrchestrator.js#L2121-L2133) returns before invoking SmartMoneySweep unless 50 candles exist. `orchestrator.minCandlesSweep` is a **different LiquiditySweep gate** (see [`core/StrategyOrchestrator.js:1784–1792`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/StrategyOrchestrator.js#L1784-L1792)), so treating the two as one config would be an incorrect migration.

**Closure:** Determine whether SmartMoneySweep 50 is algorithmic minimum or configurable entry policy; tie it to the correct owner, retain value, and verify 49/50-candle evaluation behavior.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending.

#### S1-015 — PID controller sample-count and history constants

**Classification:** OPEN — reachability and ownership.

**Grounded source:** [`core/PIDController.js:97`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/PIDController.js#L97) caps history at 200 and [`core/PIDController.js:223–245`](https://github.com/CGP-ME/OGZPMLV2/blob/db11d5c9cb2f8c96350d04b54a85000d774129f5/core/PIDController.js#L223-L245) applies sample minimums 5 and 3. Settings has `pid.warmupTrades=50`, a separate threshold. No PID getter consumption was found in the main runner / TradingLoop / OrderExecutor / StrategyOrchestrator / ExitContractManager / PolicyBuilder spot-check. Dynamic reachability remains unverified.

**Closure:** Prove whether PID outputs reach sizing, exits or regime before migrating values or deleting. If runtime-unwired, label clearly; do not claim autonomous tuning is active.

**Commit / verification receipt:** NOT RECORDED. **Owner disposition:** pending.

## Code-census appendix — source paths requiring independent semantic disposition

These checkboxes are intentionally **unchecked** even for files whose basic lexical patterns were screened. A checkbox means the file's full config/provenance, fallback, reachability and orphan status has been completed against the current frozen source. A basic text scan is not that proof. Files in `public/restore-reference` are archived candidates; no deletion without reachability evidence. Entries do not themselves assert a defect.

- **backtest: 2 candidate source files**
- **brokers: 14 candidate source files**
- **core: 118 candidate source files**
- **devtools: 1 candidate source files**
- **foundation: 6 candidate source files**
- **modules: 14 candidate source files**
- **ogz-meta: 1 candidate source files**
- **pine-transpiler: 25 candidate source files**
- **public: 119 candidate source files**
- **ROOT: 8 candidate source files**
- **scripts: 27 candidate source files**
- **server: 8 candidate source files**
- **src: 1 candidate source files**
- **tools: 32 candidate source files**
- **trai_brain: 45 candidate source files**
- **tuning: 2 candidate source files**
- **utils: 3 candidate source files**

- [ ] `TierFeatureFlags.js` — lexical screen only
- [ ] `TradingProfileManager.js` — lexical screen only
- [ ] `backtest/OptimizedBacktestEngine.js` — lexical screen only
- [ ] `backtest/backtest-api.js` — lexical screen only
- [ ] `brokers/AlpacaAdapter.js` — lexical screen only
- [ ] `brokers/BinanceAdapter.js` — lexical screen only
- [ ] `brokers/BrokerFactory.js` — lexical screen only
- [ ] `brokers/BrokerRegistry.js` — lexical screen only
- [ ] `brokers/CMEAdapter.js` — lexical screen only
- [ ] `brokers/CoinbaseAdapter.js` — lexical screen only
- [ ] `brokers/GeminiAdapter.js` — lexical screen only
- [ ] `brokers/IBrokerAdapter.js` — lexical screen only
- [ ] `brokers/InteractiveBrokersAdapter.js` — lexical screen only
- [ ] `brokers/KrakenIBrokerAdapter.js` — lexical screen only
- [ ] `brokers/OandaAdapter.js` — lexical screen only
- [ ] `brokers/SchwabAdapter.js` — lexical screen only
- [ ] `brokers/TastyworksAdapter.js` — lexical screen only
- [ ] `brokers/UpholdAdapter.js` — lexical screen only
- [ ] `core/AdaptiveTimeframeSelector.js` — lexical screen only
- [ ] `core/AssetConfigManager.js` — lexical screen only
- [ ] `core/AssetRegistry.js` — lexical screen only
- [ ] `core/AtomicWrite.js` — lexical screen only
- [ ] `core/AuthFailureGuard.js` — lexical screen only
- [ ] `core/BacktestRecorder.js` — lexical screen only
- [ ] `core/BacktestRunner.js` — lexical screen only
- [ ] `core/BotStateFrame.js` — lexical screen only
- [ ] `core/CandleAggregator.js` — lexical screen only
- [ ] `core/CandleHelper.js` — lexical screen only
- [ ] `core/CandlePatternDetector.js` — lexical screen only
- [ ] `core/CandleProcessor.js` — lexical screen only
- [ ] `core/CandleStore.js` — lexical screen only
- [ ] `core/ContractValidator.js` — lexical screen only
- [ ] `core/CryptoMarketFeed.js` — lexical screen only
- [ ] `core/DashboardBroadcaster.js` — lexical screen only
- [ ] `core/DashboardDepthCoalescer.js` — lexical screen only
- [ ] `core/DataFileInstrument.js` — lexical screen only
- [ ] `core/DecisionAutopsyLogger.js` — lexical screen only
- [ ] `core/DecisionLedgerLogger.js` — lexical screen only
- [ ] `core/DrawdownTracker.js` — lexical screen only
- [ ] `core/DynamicPositionSizer.js` — lexical screen only
- [ ] `core/EMACalibrator.js` — lexical screen only
- [ ] `core/EnhancedPatternRecognition.js` — lexical screen only
- [ ] `core/ErrorHandler.js` — lexical screen only
- [ ] `core/EvalRuleEngine.js` — lexical screen only
- [ ] `core/EventLoopMonitor.js` — lexical screen only
- [ ] `core/ExitContractManager.js` — lexical screen only
- [ ] `core/FeatureExtractor.js` — lexical screen only
- [ ] `core/FeatureFlagManager.js` — lexical screen only
- [ ] `core/FeeModel.js` — lexical screen only
- [ ] `core/FibonacciDetector.js` — lexical screen only
- [ ] `core/IndicatorCalculator.js` — lexical screen only
- [ ] `core/KillSwitch.js` — lexical screen only
- [ ] `core/KrakenAdapterV2.js` — lexical screen only
- [ ] `core/MAExtensionFilter.js` — lexical screen only
- [ ] `core/MarketRegimeDetector.js` — lexical screen only
- [ ] `core/MemoryManager.js` — lexical screen only
- [ ] `core/MessageQueue.js` — lexical screen only
- [ ] `core/ModuleAutoLoader.js` — lexical screen only
- [ ] `core/ModuleInitializer.js` — lexical screen only
- [ ] `core/MultiAssetManager.js` — lexical screen only
- [ ] `core/NewsSearchProvider.js` — lexical screen only
- [ ] `core/NtfyTraceNotifier.js` — lexical screen only
- [ ] `core/OgzTpoIntegration.js` — lexical screen only
- [ ] `core/OptimizedIndicators.js` — lexical screen only
- [ ] `core/OrderExecutor.js` — lexical screen only
- [ ] `core/OrderRouter.js` — lexical screen only
- [ ] `core/OutputPaths.js` — lexical screen only
- [ ] `core/PIDController.js` — lexical screen only
- [ ] `core/PatternBasedExitModel.js` — lexical screen only
- [ ] `core/PatternMaturity.js` — lexical screen only
- [ ] `core/PatternMemoryBank.js` — lexical screen only
- [ ] `core/PatternQualityScoring.js` — lexical screen only
- [ ] `core/PatternScope.js` — lexical screen only
- [ ] `core/PerformanceAnalyzer.js` — lexical screen only
- [ ] `core/PerformanceDashboardIntegration.js` — lexical screen only
- [ ] `core/PerformanceValidator.js` — lexical screen only
- [ ] `core/PerformanceVisualizer.js` — lexical screen only
- [ ] `core/PipelineSnapshot.js` — lexical screen only
- [ ] `core/PnLCalculator.js` — lexical screen only
- [ ] `core/PnLTracker.js` — lexical screen only
- [ ] `core/PolicyBuilder.js` — lexical screen only
- [ ] `core/PositionEffect.js` — lexical screen only
- [ ] `core/PositionSizer.js` — lexical screen only
- [ ] `core/PositionTracker.js` — lexical screen only
- [ ] `core/ProfitExitPlanner.js` — lexical screen only
- [ ] `core/RegimeDetector.js` — lexical screen only
- [ ] `core/RiskManager.js` — lexical screen only
- [ ] `core/RuntimeAuditSink.js` — lexical screen only
- [ ] `core/RuntimeConfigProof.js` — lexical screen only
- [ ] `core/SessionRouter.js` — lexical screen only
- [ ] `core/SingletonLock.js` — lexical screen only
- [ ] `core/StateManager.js` — lexical screen only
- [ ] `core/StrategyOrchestrator.js` — lexical screen only
- [ ] `core/Supervisor.js` — lexical screen only
- [ ] `core/SupportResistanceDetector.js` — lexical screen only
- [ ] `core/SymbolTradingContext.js` — lexical screen only
- [ ] `core/TRAIDecisionModule.js` — lexical screen only
- [ ] `core/TRAIPatternIntegration.js` — lexical screen only
- [ ] `core/TRAIWebContext.js` — lexical screen only
- [ ] `core/Telemetry.js` — lexical screen only
- [ ] `core/TimeFrameManager.js` — lexical screen only
- [ ] `core/TimeframeEngine.js` — lexical screen only
- [ ] `core/TraceSpine.js` — lexical screen only
- [ ] `core/TradeIntelligenceEngine.js` — lexical screen only
- [ ] `core/TradeJournal.js` — lexical screen only
- [ ] `core/TradeJournalBridge.js` — lexical screen only
- [ ] `core/TradeNarrator.js` — lexical screen only
- [ ] `core/TradeReplayCapture.js` — lexical screen only
- [ ] `core/TradingLoop.js` — lexical screen only
- [ ] `core/TtpCutoffEnforcer.js` — lexical screen only
- [ ] `core/TwoPoleOscillator.js` — lexical screen only
- [ ] `core/UnifiedPatternMemory.js` — lexical screen only
- [ ] `core/VolumeProfile.js` — lexical screen only
- [ ] `core/WebSocketManager.js` — lexical screen only
- [ ] `core/WebhookOrderAdapter.js` — lexical screen only
- [ ] `core/WhaleFilings.js` — lexical screen only
- [ ] `core/dto/DecisionLedgerSchema.js` — lexical screen only
- [ ] `core/dto/ExitContractOwnership.js` — lexical screen only
- [ ] `core/dto/FrozenExitPolicy.js` — lexical screen only
- [ ] `core/dto/IndicatorSnapshotDTO.js` — lexical screen only
- [ ] `core/exit/BreakEvenManager.js` — lexical screen only
- [ ] `core/exit/DynamicTrailingStop.js` — lexical screen only
- [ ] `core/exit/MaxHoldChecker.js` — lexical screen only
- [ ] `core/exit/StopLossChecker.js` — lexical screen only
- [ ] `core/exit/TakeProfitChecker.js` — lexical screen only
- [ ] `core/exit/TrailingStopChecker.js` — lexical screen only
- [ ] `core/indicators/IndicatorEngine.js` — lexical screen only
- [ ] `core/indicators/TwoPoleOscillator.js` — lexical screen only
- [ ] `core/invariants.js` — lexical screen only
- [ ] `core/ogzTwoPoleOscillator.js` — lexical screen only
- [ ] `core/persistent_llm_client.js` — lexical screen only
- [ ] `core/session-router/TransitionStore.js` — lexical screen only
- [ ] `core/tradeLogger.js` — lexical screen only
- [ ] `core/trai_core.js` — lexical screen only
- [ ] `core/trai_llm_config.js` — lexical screen only
- [ ] `core/trai_symbol_extractor.js` — lexical screen only
- [ ] `devtools/repo-dump-for-gpt.js` — not yet screened
- [ ] `ecosystem.config.js` — lexical screen only
- [ ] `ecosystem.watch.config.js` — lexical screen only
- [ ] `foundation/ConfigLoader.js` — lexical screen only
- [ ] `foundation/IBrokerAdapter.js` — not yet screened
- [ ] `foundation/Instrument.js` — lexical screen only
- [ ] `foundation/MarketCalendar.js` — lexical screen only
- [ ] `foundation/ResilientWebSocket.js` — lexical screen only
- [ ] `foundation/ohlc-normalize.js` — lexical screen only
- [ ] `instrument.js` — lexical screen only
- [ ] `kraken_adapter_simple.js` — lexical screen only
- [ ] `modules/BreakAndRetest.js` — lexical screen only
- [ ] `modules/DonchianBreakout.js` — lexical screen only
- [ ] `modules/EMASMACrossoverSignal.js` — lexical screen only
- [ ] `modules/EMATrendRetest.js` — lexical screen only
- [ ] `modules/FairValueGapDetector.js` — lexical screen only
- [ ] `modules/LiquiditySweepDetector.js` — lexical screen only
- [ ] `modules/MADynamicSR.js` — lexical screen only
- [ ] `modules/MultiTimeframeAdapter.js` — lexical screen only
- [ ] `modules/NoWickImbalance.js` — lexical screen only
- [ ] `modules/OpeningRangeBreakout.js` — lexical screen only
- [ ] `modules/PropSafeEMAPullback.js` — lexical screen only
- [ ] `modules/RSI2MeanReversion.js` — lexical screen only
- [ ] `modules/SmartMoneySweep.js` — lexical screen only
- [ ] `modules/TimeSeriesMomentum.js` — lexical screen only
- [ ] `ogz-meta/claudito-logger.js` — not yet screened
- [ ] `ogzprime-ssl-server.js` — lexical screen only
- [ ] `pine-transpiler/__tests__/PineCorpus.catalog.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineParityHarness.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineParser.call-vs-def.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.cast-fns.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.fabrication-purge.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.load-refusal.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.noop-ta-arg.repro.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.sms-v4-behavior.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.tv-oracle.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineRuntime.type-violation.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineTALib.edge-evidence.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineTALib.golden.test.js` — test source (separate test review)
- [ ] `pine-transpiler/__tests__/PineTupleAssignment.test.js` — test source (separate test review)
- [ ] `pine-transpiler/core/PineArray.js` — lexical screen only
- [ ] `pine-transpiler/core/PineFeatureScanner.js` — lexical screen only
- [ ] `pine-transpiler/core/PineLexer.js` — lexical screen only
- [ ] `pine-transpiler/core/PineParityHarness.js` — lexical screen only
- [ ] `pine-transpiler/core/PineParser.js` — lexical screen only
- [ ] `pine-transpiler/core/PineRuntime.js` — lexical screen only
- [ ] `pine-transpiler/core/PineStrategyBridge.js` — lexical screen only
- [ ] `pine-transpiler/core/PineTALib.js` — lexical screen only
- [ ] `pine-transpiler/helpers/SessionTracker.js` — lexical screen only
- [ ] `pine-transpiler/modules/SmartMoneySweep-v4.js` — lexical screen only
- [ ] `pine-transpiler/tools/pine-import.js` — lexical screen only
- [ ] `public/404.html` — not yet screened
- [ ] `public/TimeframeManager.js` — not yet screened
- [ ] `public/_ds/ogzprime-design-system-802711b8-5fec-4a65-9ea6-0c4f5160d99c/_ds_bundle.js` — not yet screened
- [ ] `public/command-center.html` — not yet screened
- [ ] `public/communityMilestone.html` — not yet screened
- [ ] `public/complete-integration.js` — not yet screened
- [ ] `public/control-panel.html` — targeted UI read only
- [ ] `public/convert-modules.js` — not yet screened
- [ ] `public/customer-control-panel.html` — targeted UI read only
- [ ] `public/customer-gui-mockup.html` — not yet screened
- [ ] `public/dashboard-mockup-v1.html` — not yet screened
- [ ] `public/demo.html` — not yet screened
- [ ] `public/distribution-portal.html` — not yet screened
- [ ] `public/ds-base.js` — not yet screened
- [ ] `public/features.html` — not yet screened
- [ ] `public/final-dashboard.js` — not yet screened
- [ ] `public/index.html` — not yet screened
- [ ] `public/js/ChartManager.js` — not yet screened
- [ ] `public/js/IndicatorAdapter.js` — targeted UI read only
- [ ] `public/js/chart.js` — not yet screened
- [ ] `public/js/command-palette.js` — not yet screened
- [ ] `public/js/core.js` — targeted UI read only
- [ ] `public/js/drawing-tools.js` — not yet screened
- [ ] `public/js/indicators.js` — not yet screened
- [ ] `public/js/operator/trade-manager.js` — targeted UI read only
- [ ] `public/js/panels/ambient-fx.js` — not yet screened
- [ ] `public/js/panels/asset-tf-card.js` — not yet screened
- [ ] `public/js/panels/bot-intelligence.js` — not yet screened
- [ ] `public/js/panels/candle-countdown.js` — not yet screened
- [ ] `public/js/panels/celebration.js` — not yet screened
- [ ] `public/js/panels/chain-of-thought.js` — not yet screened
- [ ] `public/js/panels/chart-panel.js` — not yet screened
- [ ] `public/js/panels/confidence-heatbar.js` — not yet screened
- [ ] `public/js/panels/configuration-settings.js` — targeted UI read only
- [ ] `public/js/panels/custom-alerts.js` — not yet screened
- [ ] `public/js/panels/edge-analytics-panel.js` — not yet screened
- [ ] `public/js/panels/edge-analytics.js` — not yet screened
- [ ] `public/js/panels/equity-curve.js` — not yet screened
- [ ] `public/js/panels/gate-meter.js` — not yet screened
- [ ] `public/js/panels/goal-tracker.js` — not yet screened
- [ ] `public/js/panels/header-strip.js` — not yet screened
- [ ] `public/js/panels/layout-switcher.js` — not yet screened
- [ ] `public/js/panels/live-readouts.js` — not yet screened
- [ ] `public/js/panels/live-report.js` — not yet screened
- [ ] `public/js/panels/loss-recovery.js` — not yet screened
- [ ] `public/js/panels/milestone-effects.js` — not yet screened
- [ ] `public/js/panels/news-ticker.js` — not yet screened
- [ ] `public/js/panels/open-positions.js` — not yet screened
- [ ] `public/js/panels/pattern-card.js` — not yet screened
- [ ] `public/js/panels/pattern-sparkline.js` — not yet screened
- [ ] `public/js/panels/rail-resize.js` — not yet screened
- [ ] `public/js/panels/risk-gauge.js` — targeted UI read only
- [ ] `public/js/panels/session-phase.js` — not yet screened
- [ ] `public/js/panels/size-preview.js` — targeted UI read only
- [ ] `public/js/panels/spoofing-detector.js` — not yet screened
- [ ] `public/js/panels/strategy-leaderboard.js` — not yet screened
- [ ] `public/js/panels/system-health.js` — not yet screened
- [ ] `public/js/panels/system-snapshot.js` — not yet screened
- [ ] `public/js/panels/trade-log.js` — not yet screened
- [ ] `public/js/panels/trade-replay.js` — not yet screened
- [ ] `public/js/panels/trai-brain.js` — not yet screened
- [ ] `public/js/panels/victory-animations.js` — not yet screened
- [ ] `public/js/panels/voice-fx.js` — not yet screened
- [ ] `public/js/panels/voice-manager.js` — targeted UI read only
- [ ] `public/js/panels/watchlist-strip.js` — not yet screened
- [ ] `public/js/posthog-init.js` — not yet screened
- [ ] `public/js/run-frontend-empire-v2.js` — targeted UI read only
- [ ] `public/js/theme-customizer.js` — not yet screened
- [ ] `public/js/websocket.js` — targeted UI read only
- [ ] `public/launch.html` — not yet screened
- [ ] `public/launcher.html` — not yet screened
- [ ] `public/learn/backtest-crypto-strategy-real-fees.html` — not yet screened
- [ ] `public/learn/build-vs-buy-crypto-trading-bot.html` — not yet screened
- [ ] `public/learn/crypto-trading-bot-risk-management.html` — not yet screened
- [ ] `public/learn/crypto-trading-bot-strategies.html` — not yet screened
- [ ] `public/learn/index.html` — not yet screened
- [ ] `public/learn/kraken-trading-bot.html` — not yet screened
- [ ] `public/legal-final.html` — not yet screened
- [ ] `public/legal.html` — not yet screened
- [ ] `public/module-integrator.js` — not yet screened
- [ ] `public/modules/fibOverlay.js` — not yet screened
- [ ] `public/modules/goalTracker.js` — not yet screened
- [ ] `public/modules/leaderboardUploader.js` — not yet screened
- [ ] `public/modules/sparkleEffects.js` — not yet screened
- [ ] `public/modules/stochasticOverlay.js` — not yet screened
- [ ] `public/modules/supportResistance.js` — not yet screened
- [ ] `public/modules/trendLines.js` — not yet screened
- [ ] `public/ogz-core-config.js` — targeted UI read only
- [ ] `public/ogz-fx-engine.js` — not yet screened
- [ ] `public/ogzp-core-mind.js` — not yet screened
- [ ] `public/payment-portal.html` — not yet screened
- [ ] `public/practicingGUItrading.html` — not yet screened
- [ ] `public/pricing.html` — not yet screened
- [ ] `public/prime-bootstorm.js` — targeted UI read only
- [ ] `public/proof.html` — not yet screened
- [ ] `public/proof/index.html` — not yet screened
- [ ] `public/proof/track-record/app.js` — not yet screened
- [ ] `public/proof/track-record/index.html` — not yet screened
- [ ] `public/restore-reference/dashboard-upgrade-ADDITIONS.html` — not yet screened
- [ ] `public/restore-reference/index-BLENDED-DRAFT.html` — not yet screened
- [ ] `public/restore-reference/index-CURRENT.html` — not yet screened
- [ ] `public/restore-reference/index-ORIGINAL.html` — not yet screened
- [ ] `public/restore-reference/service-worker.js` — not yet screened
- [ ] `public/restore-reference/unified-dashboard-CURRENT-FOR-GROK.html` — not yet screened
- [ ] `public/restore-reference/why-ogzp-BLENDED-DRAFT.html` — not yet screened
- [ ] `public/restore-reference/why-ogzp-CURRENT.html` — not yet screened
- [ ] `public/restore-reference/why-ogzp-ORIGINAL.html` — not yet screened
- [ ] `public/snapshot.html` — not yet screened
- [ ] `public/stripe-checkout.js` — not yet screened
- [ ] `public/success.html` — not yet screened
- [ ] `public/support.js` — not yet screened
- [ ] `public/tailscale.html` — not yet screened
- [ ] `public/trade-journal.html` — not yet screened
- [ ] `public/trade-replay.html` — not yet screened
- [ ] `public/trai-widget.js` — not yet screened
- [ ] `public/unified-dashboard-legacy.html` — not yet screened
- [ ] `public/unified-dashboard-v2.html` — targeted UI read only
- [ ] `public/unified-dashboard.html` — not yet screened
- [ ] `public/why-ogzp.html` — not yet screened
- [ ] `run-empire-v2.js` — lexical screen only
- [ ] `scripts/build-ogz-rag-index.js` — lexical screen only
- [ ] `scripts/candle-interpolator.js` — lexical screen only
- [ ] `scripts/check-config-boundary.js` — lexical screen only
- [ ] `scripts/check-dashboard-token-containment.js` — lexical screen only
- [ ] `scripts/check-protected-paths.js` — lexical screen only
- [ ] `scripts/cleanup-patterns.js` — lexical screen only
- [ ] `scripts/download-tsla-polygon.js` — lexical screen only
- [ ] `scripts/download-tsla-walkback.js` — lexical screen only
- [ ] `scripts/download-tsla-walkforward.js` — lexical screen only
- [ ] `scripts/fetch-cryptocompare.js` — lexical screen only
- [ ] `scripts/fetch-historical-candles.js` — lexical screen only
- [ ] `scripts/fetch-stock-data.js` — lexical screen only
- [ ] `scripts/generate-live-proof.js` — lexical screen only
- [ ] `scripts/lint-dto.js` — lexical screen only
- [ ] `scripts/mercury-analyze.js` — lexical screen only
- [ ] `scripts/mercury-substrate-digest.js` — lexical screen only
- [ ] `scripts/scan-secrets.js` — lexical screen only
- [ ] `scripts/search-ogz-rag-index.js` — lexical screen only
- [ ] `scripts/session-handoff-rehearsal/executor-context.js` — lexical screen only
- [ ] `scripts/session-handoff-rehearsal/run.js` — lexical screen only
- [ ] `scripts/session-handoff-rehearsal/worker.js` — lexical screen only
- [ ] `scripts/smoke-test.js` — lexical screen only
- [ ] `scripts/supervisor-daemon.js` — lexical screen only
- [ ] `scripts/telemetry-report.js` — lexical screen only
- [ ] `scripts/test-patterns.js` — lexical screen only
- [ ] `scripts/update-repo-history.js` — lexical screen only
- [ ] `scripts/vps-disk-alarm.js` — lexical screen only
- [ ] `server/dashboard-market-scope.js` — lexical screen only
- [ ] `server/dashboard-pattern-contract.js` — lexical screen only
- [ ] `server/dashboard-session-auth.js` — lexical screen only
- [ ] `server/dashboard-stock-stream-config.js` — lexical screen only
- [ ] `server/dashboard-ticker-frame.js` — lexical screen only
- [ ] `server/emitter-bridge.js` — lexical screen only
- [ ] `server/kraken-depth-adapter.js` — lexical screen only
- [ ] `server/stock-data-adapter.js` — lexical screen only
- [ ] `src/indicators/ogzTwoPoleOscillator.js` — lexical screen only
- [ ] `tools/backfill-mercury-costs.js` — lexical screen only
- [ ] `tools/backtest-worker-env.js` — lexical screen only
- [ ] `tools/cachebust.js` — lexical screen only
- [ ] `tools/campaign-integrity.js` — lexical screen only
- [ ] `tools/config-audit.js` — lexical screen only
- [ ] `tools/data-parity-check.js` — lexical screen only
- [ ] `tools/decision-autopsy-report.js` — lexical screen only
- [ ] `tools/dep-scanner.js` — lexical screen only
- [ ] `tools/eval-trade-inspector.js` — lexical screen only
- [ ] `tools/fee-profiles.js` — lexical screen only
- [ ] `tools/grid-search-confidence.js` — lexical screen only
- [ ] `tools/harvest-pattern-pack.js` — lexical screen only
- [ ] `tools/instrument-env.js` — lexical screen only
- [ ] `tools/kill-switch.js` — lexical screen only
- [ ] `tools/lint-fallbacks.js` — lexical screen only
- [ ] `tools/matrix-sweep.js` — lexical screen only
- [ ] `tools/parallel-backtest.js` — lexical screen only
- [ ] `tools/probe-tfe-alive.js` — lexical screen only
- [ ] `tools/regression-test.js` — lexical screen only
- [ ] `tools/repodumpforgpt.js` — lexical screen only
- [ ] `tools/run-audit-apex.js` — lexical screen only
- [ ] `tools/run-audit-revised-part2.js` — lexical screen only
- [ ] `tools/run-audit-revised.js` — lexical screen only
- [ ] `tools/run-audit.js` — lexical screen only
- [ ] `tools/serena-bridge.js` — lexical screen only
- [ ] `tools/serena-symbol-scanner.js` — lexical screen only
- [ ] `tools/single-backtest.js` — lexical screen only
- [ ] `tools/strategy-lab.js` — lexical screen only
- [ ] `tools/strategy-parity.js` — lexical screen only
- [ ] `tools/trade-validator.js` — lexical screen only
- [ ] `tools/tuning-profiles.js` — lexical screen only
- [ ] `tools/weekend-campaign-gauntlet.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/cli.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/edit-ledger.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/finish-gate.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/hook-input.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/policy.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/post-edit.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/post-read.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/pre-bash.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/pre-edit.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/pre-read.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/prepare.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/prior-fixes.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/proof-writer.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/read-ledger.js` — lexical screen only
- [ ] `trai_brain/claude-bridge/task-contract.js` — lexical screen only
- [ ] `trai_brain/memory_store.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/adversarial-review.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/ask.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/codex-challenger.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/config.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/consensus.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/cost-accounting.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/direct-question.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/doctrine-review.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/evidence-ingestion.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/explicit-continuation.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/indexer.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/llm-client.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/mongo-store.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/provider-preflight.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/query-router.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/react-loop.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/reviewer-panel.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/run-ledger.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/searcher.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/substrate-digest.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/tool-adapter.js` — lexical screen only
- [ ] `trai_brain/mercury-bridge/trace-memory.js` — lexical screen only
- [ ] `trai_brain/persistent_llm_client.js` — lexical screen only
- [ ] `trai_brain/prompt_schemas.js` — lexical screen only
- [ ] `trai_brain/read_only_tools.js` — lexical screen only
- [ ] `trai_brain/repository-policy.js` — lexical screen only
- [ ] `trai_brain/research_mode.js` — lexical screen only
- [ ] `trai_brain/shared/break-my-fix-frame.js` — lexical screen only
- [ ] `trai_brain/trai_core.js` — lexical screen only
- [ ] `tuning/pipeline-diagnostic.js` — lexical screen only
- [ ] `tuning/run-round1.js` — lexical screen only
- [ ] `utils/discordNotifier.js` — lexical screen only
- [ ] `utils/telegramNotifier.js` — lexical screen only
- [ ] `utils/tradeLogger.js` — lexical screen only

## Change journal (append-only)

| Date | SHA | Scope | Action | Result |
|---|---|---|---|---|
| 2026-10-17 | `db11d5c9cb2f` | SOURCE | Classified additional hardcoded live gates and PID candidate; validated canonical trend-regime threshold contract. | Source evidence only; no runtime edits. |
| 2026-10-17 | `db11d5c9cb2f` | SOURCE | Constructed canonical code-census + grounded issue register from this exact branch. | No production edits, no runtime tests, no deletions. |

## Documentation retirement condition

Old STOP 1 docs are **historical, not instructions**. Once every OPEN row is closed with code+proof, the remaining dependency graph and canonical map are machine validated and Trey authorizes retirement, replace old documentation with this changelog plus only truly required executable proof material. Git commit history remains. Nothing is to be mass-deleted early.
