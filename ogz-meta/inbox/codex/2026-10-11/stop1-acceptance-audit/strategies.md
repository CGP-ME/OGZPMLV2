# Stop1 strategy/settings acceptance audit

**Scope and source identity.** Read-only audit on branch `astra-era`, baseline HEAD `cb566d93a46dca8673def2f76ea685f5be0b148e`. No module import, broker/network call, process restart, staging, or production-source mutation occurred. The three separately owned MTF defects (Alpaca failure broker latch, FIFO frame ranking, Kraken forming bars) were excluded. The worktree is dirty; all line evidence below describes the current worktree unless explicitly identified as a baseline fact.

The authoritative inventory is [source-census.json](source-census.json): **383** tracked JavaScript sources, **343** ConfigLoader calls, **2549** leaves, and **0** parse errors; SHA-256 `69c32e828f8ba69a9796335edb399a00245fecfa89403cb8fe00328b0952a5b3`. It proves inventory, import reachability, and source identity only.

## Acceptance result

**Not accepted.** The literal owned-key table in [strategies.coverage.json](strategies.coverage.json) has 661 rows: `confidence` 4, `regimeDetection` 13, `indicators` 115, `patternRecognition` 14, `featureExtraction` 12, `performanceAnalysis` 11, `fibonacci` 11, `patternMemory` 20, `regimeBoosts` 22, `volumeProfileBoosts` 21, `pid` 28, `strategyBehavior` 12, `strategies` 308, `orchestrator` 40, `filters` 2, `timeframeConfig` 28. It excludes `exitContracts` and `launchProfiles` from owned rows; they remain cross-scope evidence because they affect fallback and overlay interpretation. Status totals: `actual_effect` 84, `actual_effect_optional` 8, `annotation_only_noneditable` 5, `statistics_only` 1, `metadata_only` 1, `dormant_branch` 8, `orphan_internal` 28, `fallback_only` 28, `read_discard` 4, `ignored_toggle` 1, `contrary_to_current_user_intent` 1, `not_verified` 492. `not_verified` is intentional uncertainty, never a family-level pass.

| Finding | status | producer → initialized consumer | consequence |
| --- | --- | --- | --- |
| Confidence fields | `read_discard` | `confidence.regimeMinConfidence`, `confidence.confluenceMinScore` → `StrategyOrchestrator.js:823-824` → no later reader found | Saved values cannot alter the audited decision path. |
| MTF annotations | `annotation_only_noneditable` | Five explicit `orchestrator.*Mtf` keys → `StrategyOrchestrator.js:1456-1498,1522-1531,1584-1593` | They create trace/attribution evidence only; no rank, eligibility, size, or exit mutation. Their intended annotation role remains unresolved. |
| SMS loss cap | `contrary_to_current_user_intent` | `strategies.SmartMoneySweep.maxDailyLosses` → `SmartMoneySweep.js:108,183,225-226`; close producer → `OrderExecutor.js:4907-4912,5538-5543` → `StrategyOrchestrator.js:3207-3217` → `SmartMoneySweep.js:328-331` | Active SMS entry restriction despite the stated current intent that SMS was removed. |
| SMS max hold | `read_discard` | `maxHoldBars` assigned at `SmartMoneySweep.js:107` with no later reader | No hold-time behavior. |
| MA persistence/toggle | `read_discard` / `ignored_toggle` | `patternPersistBars` assigned `MADynamicSR.js:203-204`; slope veto is unconditional at `357-371` despite `conditionFlags.trendGate` | Neither setting has its advertised behavioral control. |
| PID | `orphan_internal` | PID controls → `PIDController.js:124-259`; close events → `OrderExecutor.js:4927-4936,5557-5566` | It updates controller state but no consumer of PID output getters was found. |
| Timeframe settings | `fallback_only` | `ExitContractManager.js:981-994` | Generic strategy fallback is reachable, but current built-ins all have strategy contracts. |

## Proven initialized paths and limits

- `EnhancedPatternChecker` is initialized by `run-empire-v2.js:518-520,665-675`, delivered to `TradingLoop` at `1442-1472`, and called at `TradingLoop.js:2038-2046`. This proves checker execution, not decision effect for every option. The per-key rows distinguish feature-vector controls from statistics/metadata and dormant helper branches.
- `FairValueGapDetector` is an `OpeningRangeBreakout` component, not a missing standalone strategy: constructed at `OpeningRangeBreakout.js:147-151`, reconfigured at `269-282`, and scanned in `WATCHING_FOR_FVG` at `415-445`. ORB is registered at `StrategyOrchestrator.js:2083-2131`.
- Regime boosts, volume-profile boosts, and generic MTF confluence have actual modifier paths at `StrategyOrchestrator.js:2727-2815`, `2822-2875`, and `1309-1390`; confluence sizing is `2974-2982`.
- `RegimeDetector` is constructed from `regimeDetection` at `TradingLoop.js:2121`. Fibonacci settings are consumed by detector construction and nearest-structure exit context.

## Worktree and verification

Critical evidence files including `config/settings.json`, `StrategyOrchestrator.js`, `ConfigLoader.js`, `TradingLoop.js`, `run-empire-v2.js`, `EnhancedPatternRecognition.js` and `ExitContractManager.js` are dirty; no claim should silently convert a worktree line trace into clean-HEAD behavior. Syntax/diff checks previously passed only as parse hygiene; they do not prove runtime activation. `ogz-meta/claudito-logger.js` is included in the census because `run-empire-v2.js:434` and `OrderExecutor.js:20` import it; its proofPublication reads are runtime consumers, not excluded metadata.
