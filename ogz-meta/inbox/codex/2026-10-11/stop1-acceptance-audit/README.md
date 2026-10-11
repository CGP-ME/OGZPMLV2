# Stop 1 acceptance audit

**Stop 1 is not accepted against Trey's original requirements.** Those requirements included correct ownership and purpose, real initialization and callers, effective behavior, and removal of silent overrides and phantom paths. The earlier completion statement established less than that and must not be used as acceptance evidence.

## Counted coverage and boundaries

- **2,549/2,549 canonical leaves and empty containers are inventoried and assigned a source-effect disposition** in [coverage.json](coverage.json). This includes array elements, seven launch-profile variants, tuning presets, static internals and metadata. It is **not** a count of customer controls or successfully executed behaviors.
- **383 tracked JavaScript sources** were parsed for configuration reads, environment references and imports, including the actual production logger under `ogz-meta`. There were zero parse errors and zero missing literal relative imports in that set. **59 dynamic require sites remain separately enumerated**; the literal-import result does not certify every possible dynamic import or method call.
- The current worktree settings view returns **724 UI descriptors**, each recorded in [loader-ui-coverage.json](loader-ui-coverage.json). Registry availability, persistence plumbing and source-effect tracing are distinct from exercising every save and trading consequence.
- Source baseline: branch `astra-era`, HEAD `cb566d93a46dca8673def2f76ea685f5be0b148e`. Existing dirty production work is identified by source hashes. These observations are not a clean-HEAD full-bot test or proof that PM2 loaded current source.
- Three cheap agents (two Terra, one Luna) worked in bounded passes. This is a source audit, not a Mercury/Astra production-change approval. No production repair, new gate, throw, default, fallback, settings save, restart, resume or order was performed.
- Excluded from repair/re-investigation as instructed: Alpaca requested-frame failures causing broker-wide blocking, FIFO cross-frame selection, and Kraken forming-candle trading. Those three repairs are being handled outside this audit.

## Findings requiring disposition

| Finding | Actual behavior and consequence | Current source evidence |
| --- | --- | --- |
| SMS loss restriction remains active | `maxDailyLosses=3` suppresses SMS entries after three losing results per ticker until its daily reset. Trey states this was removed; its current presence conflicts with that instruction. It is not an unused setting. | `modules/SmartMoneySweep.js:108,183,225,328,511`; `core/StrategyOrchestrator.js:3207`; `core/OrderExecutor.js:4907,5538` |
| Independent entry-pause state remains | `isTrading` initializes false and can refuse non-backtest entries, including paper. The selected saved state is false with no reason/source. This is runtime state, not paper/live configuration; moving configuration did not establish its intended lifecycle. | `core/StateManager.js:546,634,2589`; `core/OrderExecutor.js:2920`; [runtime observation](runtime-observation.json) |
| MADynamicSR trend toggle does not control its veto | Turning `conditionFlags.trendGate` off does not disable the unconditional flat-slope rejection. The profile reports that condition as enabled independently. | `modules/MADynamicSR.js:357,769` |
| Values read or passed but not used | Two confidence thresholds, MADynamicSR persistence bars, SMS hold bars, OGZTPO adaptive flag, and TRAI maximum confidence do not reach the advertised decision behavior. | `core/StrategyOrchestrator.js:823`; `modules/MADynamicSR.js:203`; `modules/SmartMoneySweep.js:107`; [strategy supplement](strategies-deep.json); `run-empire-v2.js:815` |
| PID adjustments have no trading consumer | All 28 PID leaves configure adaptation updated from closed trades, but no production caller consumes its position, regime or trailing adjustment outputs. Internal updates are not an effect on trades. | `core/PIDController.js:124,193,291,301,311`; `core/OrderExecutor.js:4927,5557` |
| Pattern-recognition branches are dormant or metadata-only | Three history controls feed an uncalled helper; five fast-path controls require options absent from the actual caller. The checker confidence threshold updates statistics, not signal filtering; default quality supplies metadata. These must not be advertised as proven trading controls. | `core/EnhancedPatternRecognition.js:449,482,593,612,625`; `core/TradingLoop.js:2038,2052` |
| Percent target/trailing exit declarations are disconnected | The target checker is constructed but not called by the exit coordinator. The percent-trailing checker has no active production caller. Some target values still influence stock sizing, so they are not globally unused. | `core/ExitContractManager.js:259,364,738`; `core/exit/TakeProfitChecker.js:18`; `core/exit/TrailingStopChecker.js:54`; [execution report](execution.md) |
| Exit controls stop before their intended effect | BE scale-out fee buffer is copied into policy but not consumed by the planner; volatility lookback is validated and discarded; scale-in sizing ladder is carried without an executor reader. The separate trailing fee buffer has a real reader. | `core/PolicyBuilder.js:280,297`; `core/ProfitExitPlanner.js:152`; `core/ExitContractManager.js:868`; [execution per-key evidence](execution.coverage.json) |
| Pattern-exit model is tracking-only | Entry/close tracking runs, but its exit evaluator is uncalled. Eight of its configuration properties have no model reader at all; reversal names are hardcoded instead. | `run-empire-v2.js:737`; `core/OrderExecutor.js:4122`; `core/PatternBasedExitModel.js:81,280`; [actual-class probe](pattern-settings-probe.json) |
| Trade-intelligence “ACTIVE” label has no evaluation behind it | The engine is constructed with local hardcoded values. `misc.tradeIntelligenceShadow` changes the startup label; no production method call uses the engine. | `run-empire-v2.js:747,757`; `core/TradeIntelligenceEngine.js:47` |
| Dynamic TRAI veto declaration is overwritten | The constructor forces veto off regardless of the stored value under the existing opinion-only policy. Correct ownership/purpose needs disposition; this is not permission to enable a veto. | `run-empire-v2.js:811`; `core/TRAIDecisionModule.js:43` |
| Legacy fund target factory is uncalled | `fundTarget` reaches a legacy configuration factory with no active caller. That does not establish a working trading/fund-target feature. | `core/ModuleInitializer.js:24`; `run-empire-v2.js:640`; [execution report](execution.md) |
| Stock-download configuration lacks a current caller | Ten static tooling values are exposed/validated by the loader, but no current downloader consumer was found. This is a missing-purpose/caller question, not a reason to delete intended tooling. | `foundation/ConfigLoader.js:658,1627`; [services report](services.md) |
| Separate diagnostic/proof scripts retain environment ownership | A standalone proof script labels mode/risk/stop loss from old environment keys with literal defaults; diagnostic tools have independent tuning inputs. These are not established active-bot overrides, but prevent an unqualified repository-wide single-owner claim. | `scripts/generate-live-proof.js:239`; `tuning/pipeline-diagnostic.js:37`; `tools/trade-validator.js:43` |

## Purpose distinctions that must not become invented repairs

- Five noneditable MTF fields affect annotations only. They have a trace effect, but no ranking/veto/size effect. Their intended role remains unresolved; calling them wholly nonfunctional would overstate the evidence.
- The 28 `timeframeConfig` leaves serve the generic/custom-strategy contract fallback. Current built-ins have specific contracts and bypass those values. Existing fallback behavior is recorded, not endorsed as fulfilling the no-fallback requirement.
- Tier policy feeds summaries and helpers; several enforcement helpers have no trading caller. This does not authorize adding tier restrictions.
- Configuration validation thresholds, revision metadata, chart colors and log precision are real non-trading purposes. They should not be counted as customer trading controls merely because their values exist.
- Backtest descriptors deliberately override named configuration/profile values. Their explicit precedence is recorded in [profiles.json](profiles.json); this is different from an undisclosed module override.

## Corrected leads and actual verification

Proof publication was initially missed by a directory-excluded search. Independent review found its real production logger under `ogz-meta/claudito-logger.js`; all nine values have consumers. EnhancedPatternChecker is constructed and called. FVG is an active ORB component, not an unregistered standalone-strategy defect. Dynamic sizing has an actual executor implementation despite the separate unused sizer object. These corrections are preserved in the supporting reports.

The [independent report review](review.md) found no blocking acceptance overclaim and records the remaining static-analysis limits.

Verification performed: source/HEAD hashes, complete canonical-key reconciliation, AST import/config/env census, selected caller-chain review, syntax and JSON checks, and an isolated actual PatternBasedExitModel method probe demonstrating the ignored reversal-list setting against a working confidence-threshold control. Read-only PM2/persisted-state observation is recorded separately. No exhaustive live save matrix, full trading replay, broker-order acceptance or runtime activation was performed.

`coverage.json` is the final reconciled index. Earlier bounded reports retain explicitly unverified rows that later named supplements resolve; do not use an earlier pass alone as the final coverage result. Detailed field evidence remains in the linked packets. Large intermediate token-match candidates and the redundant expanded index remain local supporting data, not staged publication artifacts.

**Nothing in this audit authorizes deleting intended features, wiring new trading restrictions, or declaring Stop 1 clean.** It supplies the concrete ownership, behavior and caller gaps for correction.
