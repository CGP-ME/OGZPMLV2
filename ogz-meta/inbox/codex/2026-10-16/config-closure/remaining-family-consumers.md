# Remaining runtime-family consumer trace

Historical source pin: committed `097ef8c3ff3fa2af3c7c90795e215d094003f206`. This trace is limited to canonical settings/internals families requested by root: risk/profile risk, execution, session routing, learning/pattern memory, performance analysis, and confidence. Exit contracts, indicators, strategies, and already-registered gap families are excluded. Evidence comes from `git show HEAD` source; historical inbox copies and changelog narratives were not used as current source.

## Findings requiring ledger treatment

### Confidence: two stored leaves are assigned but have no active read

`settings.json:confidence.regimeMinConfidence` and `confidence.confluenceMinScore` are loaded into `StrategyOrchestrator` fields at `core/StrategyOrchestrator.js:823-824`. A committed-source search for `this.regimeMinConfidence` and `this.confluenceMinScore` finds only those assignments; there is no active branch consuming either field. The active strategy minimum is read dynamically through `core/StrategyOrchestrator.js:939-941` (`ConfigLoader.get('confidence.minStrategyConfidence')`), and candle-pattern confidence is read by `core/TradingLoop.js:1970`.

Disposition: subsequently archived and removed in `cbf7200c` under the user’s explicit ruling, together with the overwritten TwoPole base confidence. The remaining active thresholds/boosts were preserved.

### Pattern-memory bank subtree: canonical values belong to a legacy class with no active constructor caller

`settings.json:patternMemory.bank.*` is consumed by `core/PatternMemoryBank.js:125-150` only when that legacy class is constructed. The committed active TRAI implementation explicitly says UnifiedPatternMemory replaces PatternMemoryBank (`core/trai_core.js:20-22,35-37`), and its constructor calls `UnifiedPatternMemory` configuration resolution (`core/UnifiedPatternMemory.js:149-165,202-212`), which reads top-level `ConfigLoader.getSection('patternMemory')` leaves and never reads `.bank`. `git grep` on committed production source finds no `new PatternMemoryBank` caller; OrderExecutor's learning path calls the active TRAI object (`core/OrderExecutor.js:4871-4872` and the surrounding `this.ctx.trai.recordTradeOutcome` path).

Disposition: `patternMemory.bank.*` is an unwired legacy subtree, separate from the active top-level pattern-memory controls. Do not route it into UnifiedPatternMemory without an explicit behavior decision; do not claim the active top-level fields are dropped.

## Families with active consumers

### Risk and session risk

There is no standalone top-level `risk` object in `config/settings.json`; the runtime risk owner is each `launchProfiles.<profile>.risk.reconciliationReporter` block. ConfigLoader copies the selected profile risk tree to `config.risk` at `foundation/ConfigLoader.js:1041-1045,1193-1195`. `run-empire-v2.js:712` constructs `RiskManager` with that exact tree. `RiskManager.reportExternalLedgerDelta` reads enabled and both alert limits at `core/RiskManager.js:92-101`; the production SessionRouter reconciliation caller is `core/SessionRouter.js:1387`. This is an active report-only consumer, not a missing risk action.

The selected profile's session route is copied at `foundation/ConfigLoader.js:1036-1040`. `run-empire-v2.js:844-848,910-918` passes mode, static session, fast flag, check interval, force-close behavior, and the internal fast-check/store settings into the real `SessionRouter`. `core/SessionRouter.js:55-69` stores them; `:234-245` uses `forceCloseOnSessionEnd`; `:345-355` uses the selected interval. Session routing fields are therefore active.

The selected profile's `venueGuards.ttp` tree is copied to `evalRules.ttp` at `foundation/ConfigLoader.js:1046-1050,1196-1204`. `core/EvalRuleEngine.js:47-80` invokes earnings, account-limit, and volume-cap checks; concrete readers are `:247-270`, `:388-410`, and `:495-515`. `OrderExecutor.js:2242-2256` and TradingLoop's TTP consistency path consume the derived rule values. No missing consumer was found in this family.

### Execution

Canonical `execution.broker`, `assetClass`, `tradingPair`, `symbols`, and `candleTimeframe` are resolved and provenance-tracked by ConfigLoader (`foundation/ConfigLoader.js:891-909,1165-1168`). Direct production readers include `core/CandleProcessor.js:63-67`, `core/BacktestRunner.js:180-183`, `core/UnifiedPatternMemory.js:176-185`, `run-empire-v2.js:692-706`, and `core/SymbolTradingContext.js:50-55`. `brokerMode` and `candleSource` are derived launch-mode fields at `foundation/ConfigLoader.js:1067-1071`, with downstream backtest/live routing checks; they are not silently substituted canonical settings. No dropped execution leaf was found.

### Performance analysis

All eight `settings.json:performanceAnalysis.*` leaves are passed into the real analyzer by `run-empire-v2.js:724-727`. `core/PerformanceAnalyzer.js:285,336-354,768-821,1028-1091` reads recommendation interval, entry/exit/pattern weights, alert threshold, edge-decay lookback/threshold, analysis minimum, database path, and verbose logging. `core/OrderExecutor.js:4748-4749,5450-5461` supplies completed trades. The separate `internals.performanceAnalysis.updateIntervalMs` is only interpolated in the constructor log at `core/PerformanceAnalyzer.js:83`; it does not schedule or control analysis and was retired in committed `9545c26a`; it remains a source delivery, not runtime activation. The other internal fields have their corresponding path/log consumers. Thus the eight dynamic settings are active; the update interval is log-only and should not be counted as an active behavior control.

### Learning / active pattern memory

Top-level `settings.json:patternMemory.*` is resolved and validated by `core/UnifiedPatternMemory.js:149-165`, constructed at `:202-212`, and read by active methods at `:243-244,355,396-440,481-535,560,574,599-625,640-769`. `run-empire-v2.js:817` passes `features.enableLearning` into the active TRAI construction, while `core/TradingLoop.js:1978-1980` reads the learning flag for pattern observation recording. The top-level learning controls are active; only the separate `.bank` legacy subtree is unwired as described above.

### TRAI confidence/learning transport

The canonical `trai.weight`, `maxRisk`, `emergencyStopLoss`, `minConf`, `maxConf`, `legacyPatternMinSamples`, and `trackDecisions` are passed by `run-empire-v2.js:803-809` into `TRAIDecisionModule`. Their concrete effects are: `weight` changes final confidence only in advisory/hybrid blend branches at `core/TRAIDecisionModule.js:651-680`; `minConf` and `maxConf` bound recommendation confidence at `:763-789` and `:224`; `legacyPatternMinSamples` gates historical-memory weighting at `:582-588`; `trackDecisions` gates decision logging at `:994-1005`. `emergencyStopLoss` supplies the missing-stop-loss substitute and `maxRisk` sets the `max_loss_above_tolerance` assessment factor at `:731-749`; however, that assessment is explicitly opinion-only (`:255-256`), `makeRecommendation` does not read `riskAssessment`, and `checkVetoConditions` is never called (`:795-798`). Therefore those two fields affect diagnostic risk-assessment output, not TRAI's final recommendation or execution authority. `trai.enableBacktest` is transported at `run-empire-v2.js:1447` and consumed by `core/TradingLoop.js:2117`. `trai.patternPackPath` is read by `core/TRAIDecisionModule.js:64-67`; the LLM subtree is parsed by `core/trai_llm_config.js:51-75`. The family has active readers, with `maxRisk`/`emergencyStopLoss` limited to opinion telemetry rather than decision enforcement.

## Bounded result

Within the requested families and the exact committed paths inspected, the concrete unresolved consumer records are the two preserved confidence assignments and the legacy `patternMemory.bank.*` subtree. The active paths above are source-supported mappings; this document does not certify unrelated configuration families or historical reports. No production edits were made.

The autonomous branch at `core/TRAIDecisionModule.js:678-681` and advisory branch at `:659-664` now read the canonical blend controls delivered in `097ef8c3`; `trai.weight` remains the separate advisory/hybrid additive control. Risk fields remain opinion telemetry only, as described above.
