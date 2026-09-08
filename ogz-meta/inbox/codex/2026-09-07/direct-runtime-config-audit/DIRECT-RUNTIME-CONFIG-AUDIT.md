# Direct runtime config reachability audit

Audit time: `2026-09-07T19:14:03Z`

Audited tree: `e54a8b8dc40c4a5bf52984b823d1438c4de39f62` plus packet commit `079f91ab`. The current checkout is `367a04b7`, but `git diff --name-only e54a8b8d..HEAD -- <audited files>` returned empty for every source/config file cited below. The later local commit only changes Mercury bridge files.

This is a direct source-and-caller audit. It did not run Mercury, Fable, Kimi, embeddings, a model API, the bot, a broker, or PM2.

## Count and document-order correction

The request's “26 inputs” count does not match its described filter:

- 9 explicitly named env inputs + 14 `regimeMultipliers` leaves + the empty `universalLimits` object = **24**, not 26.
- The two rows that make 26 are `features.enableArbitrage` and `features.enableHedging`, but both manifest reasons explicitly say `RULED`, so the request's own “reason does not cite a Trey ruling” clause excludes them.
- Applying the non-ruling filter literally to current `trading.config.json` DELETE rows adds **22 `profiles.*` rows**, not two. Those 22 have live boot-time validation readers and are reported below.
- The manifest is timestamped `2026-09-06 14:34:34 UTC`. The cold-pull disagreement document is later, `2026-09-07 03:11:00 UTC`, and already says the profile rows must be relabeled. Source: `ogz-meta/inbox/cc/2026-09-06/STOP1-MISSION0-COLD-PULL-079f91ab-DISAGREEMENTS.md:260-304`.

## Shared live call chains

**ENV-PROOF:** `run-empire-v2.js:382` loads the proof logger; the live runner constructs `OrderExecutor` at `run-empire-v2.js:1320`; `TradingLoop` hands executions to it at `core/TradingLoop.js:2002` through `run-empire-v2.js:3123-3148`; the four entry/exit action branches call `TradingProofLogger.trade` at `core/OrderExecutor.js:4137,4396,4800,5462`; `trade()` calls `publishTrackRecord()` at `ogz-meta/claudito-logger.js:580,628-629`; the timer calls `_writeTrackRecordNow()` at `:717-727`; `_writeTrackRecordNow()` calls `_resolveTrackRecordAccountConfig(process.env)` at `:415-431`. This is static reachability; no trade had to be awaited.

**PROFILE-BOOT:** `run-empire-v2.js:4-5` requires and loads ConfigLoader. ConfigLoader requires the JSON at `foundation/ConfigLoader.js:28`; module initialization calls `buildRuntimeProfilesConfig()` at `:3345`; that function reads `tradingConfigFile.profiles`, iterates every profile, and value-checks every required key at `:2219-2235` before cloning the table at `:2237`.

**EXIT-LIVE:** `run-empire-v2.js:347-348` constructs `ExitContractManager`; `core/TradingLoop.js:1341-1355` calls `StrategyOrchestrator.evaluate`; a winning strategy calls `ExitContractManager.createExitContract` at `core/StrategyOrchestrator.js:2943-2947`; `getDefaultContract` selects the contract at `core/ExitContractManager.js:274-324`; computed ConfigLoader paths read each contract field at `:157-179`; `PolicyBuilder.normalizeContract` reads the trailing fields at `core/PolicyBuilder.js:240-241` (called at `core/ExitContractManager.js:195-196`). Entry freezing reads them again through `core/OrderExecutor.js:2374-2390` -> `core/PolicyBuilder.js:558-590` -> `:240-241`.

## Requested core input table

| # | Input | Result | Receipt |
|---:|---|---|---|
| 1 | `TTP_DAILY_LOSS_LIMIT_DOLLARS` | **NO LIVE READER** | Only a message names it at `foundation/ConfigLoader.js:1365`; the actual daily-loss value is the launch-profile read at `foundation/ConfigLoader.js:931-938`. Excluded stamp: `ecosystem.config.js:23`. |
| 2 | `TTP_MAX_LOSS_THRESHOLD_EQUITY` | **READER** (fallback) | ENV-PROOF -> `ogz-meta/claudito-logger.js:340-350`; read only when `OGZ_MAX_DRAWDOWN` and `TTP_MAX_LOSS_DOLLARS` are absent. ConfigLoader's trading value separately comes from the launch profile at `foundation/ConfigLoader.js:938`. |
| 3 | `TTP_PROFIT_TARGET_DOLLARS` | **READER** (fallback) | ENV-PROOF -> `ogz-meta/claudito-logger.js:327-337,399`; second choice after `OGZ_PROFIT_TARGET`. ConfigLoader's trading value separately comes from the launch profile at `foundation/ConfigLoader.js:945-949`. |
| 4 | `OGZ_ACCOUNT_ID` | **READER** | ENV-PROOF -> `_readRequiredString(env, 'OGZ_ACCOUNT_ID')` at `ogz-meta/claudito-logger.js:292-297,393`. |
| 5 | `OGZ_ACCOUNT_LABEL` | **READER** | ENV-PROOF -> `_readRequiredString(env, 'OGZ_ACCOUNT_LABEL')` at `ogz-meta/claudito-logger.js:292-297,374-384`. |
| 6 | `OGZ_ACCOUNT_STAGE` | **READER** | ENV-PROOF -> `_readRequiredString(env, 'OGZ_ACCOUNT_STAGE')` at `ogz-meta/claudito-logger.js:292-297,395`. |
| 7 | `OGZ_ACCOUNT_STATUS` | **READER** | ENV-PROOF -> `_readRequiredString(env, 'OGZ_ACCOUNT_STATUS')` at `ogz-meta/claudito-logger.js:292-297,396`. |
| 8 | `OGZ_MIN_TRADES_REQUIRED` | **READER** | ENV-PROOF -> `_readPositiveInteger(env, 'OGZ_MIN_TRADES_REQUIRED')` at `ogz-meta/claudito-logger.js:309-315,401`. |
| 9 | `OGZ_TRACK_RECORD_START_AT` | **READER** | ENV-PROOF -> `_readRequiredIsoTimestamp(env, 'OGZ_TRACK_RECORD_START_AT')` at `ogz-meta/claudito-logger.js:318-324,402`. |
| 10 | `regimeMultipliers.strong_uptrend.slMultiplier` | **NO LIVE READER** | JSON definition `config/trading.config.json:2383`; hardcoded shadow `foundation/ConfigLoader.js:3333`; the only getter is `:4018-4019` and has no runtime callers. |
| 11 | `regimeMultipliers.strong_uptrend.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2384`; hardcoded shadow `foundation/ConfigLoader.js:3333`; uncalled getter `:4018-4019`. |
| 12 | `regimeMultipliers.mild_uptrend.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2387`; hardcoded shadow `foundation/ConfigLoader.js:3334`; uncalled getter `:4018-4019`. |
| 13 | `regimeMultipliers.mild_uptrend.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2388`; hardcoded shadow `foundation/ConfigLoader.js:3334`; uncalled getter `:4018-4019`. |
| 14 | `regimeMultipliers.trading_range.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2391`; hardcoded shadow `foundation/ConfigLoader.js:3335`; uncalled getter `:4018-4019`. |
| 15 | `regimeMultipliers.trading_range.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2392`; hardcoded shadow `foundation/ConfigLoader.js:3335`; uncalled getter `:4018-4019`. |
| 16 | `regimeMultipliers.accumulation.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2395`; hardcoded shadow `foundation/ConfigLoader.js:3336`; uncalled getter `:4018-4019`. |
| 17 | `regimeMultipliers.accumulation.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2396`; hardcoded shadow `foundation/ConfigLoader.js:3336`; uncalled getter `:4018-4019`. |
| 18 | `regimeMultipliers.volatile_spike.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2399`; hardcoded shadow `foundation/ConfigLoader.js:3337`; uncalled getter `:4018-4019`. |
| 19 | `regimeMultipliers.volatile_spike.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2400`; hardcoded shadow `foundation/ConfigLoader.js:3337`; uncalled getter `:4018-4019`. |
| 20 | `regimeMultipliers.breakout.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2403`; hardcoded shadow `foundation/ConfigLoader.js:3338`; uncalled getter `:4018-4019`. |
| 21 | `regimeMultipliers.breakout.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2404`; hardcoded shadow `foundation/ConfigLoader.js:3338`; uncalled getter `:4018-4019`. |
| 22 | `regimeMultipliers.consolidation.slMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2407`; hardcoded shadow `foundation/ConfigLoader.js:3339`; uncalled getter `:4018-4019`. |
| 23 | `regimeMultipliers.consolidation.tpMultiplier` | **NO LIVE READER** | JSON `config/trading.config.json:2408`; hardcoded shadow `foundation/ConfigLoader.js:3339`; uncalled getter `:4018-4019`. |
| 24 | `universalLimits` (empty object; no leaves) | **NO LIVE READER** | JSON `config/trading.config.json:2302`; ConfigLoader has an unrelated hardcoded empty object at `foundation/ConfigLoader.js:3227-3230`; no runtime `universalLimits` consumer exists. |
| 25 | `features.enableArbitrage` | **OUT OF FILTER; NO LIVE JSON READER** | Manifest reason says `RULED`; JSON `config/trading.config.json:2460` is shadowed by `ENABLE_ARBITRAGE`/default at `foundation/ConfigLoader.js:3647-3654`. |
| 26 | `features.enableHedging` | **OUT OF FILTER; NO LIVE JSON READER** | Manifest reason says `RULED`; JSON `config/trading.config.json:2461` is shadowed by `ENABLE_HEDGING`/default at `foundation/ConfigLoader.js:3647-3654`. |

Result for the intended core under the request's written ruling filter: rows 25-26 are excluded and the set contains 24 inputs, **8 reader / 16 no reader**. If the two ruled feature rows are included only to honor the title's count of 26, the result is **8 reader / 18 no reader**.

## Current-manifest non-ruling DELETE rows missed by the “26” count

These 22 rows pass the literal current-manifest filter because their reasons say only `banner-only reader`. Every one has a **live boot-time validation reader** through PROFILE-BOOT. The banner at `run-empire-v2.js:616-617` reads `misc.tradingProfile`, not any of these leaf values. `ConfigLoader.getProfile()` at `foundation/ConfigLoader.js:4025-4035` has test callers only, so this is validation reachability, not proof of a behavioral sizing/hold consumer.

| Input | Result | Receipt |
|---|---|---|
| `profiles.scalper.riskPercent` | **READER** | JSON `config/trading.config.json:2415`; PROFILE-BOOT -> dynamic `profile[key]` read at `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.scalper.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2416`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.day_trader.minConfidence` | **READER** | JSON `config/trading.config.json:2419`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.day_trader.maxPositionSize` | **READER** | JSON `config/trading.config.json:2420`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.day_trader.riskPercent` | **READER** | JSON `config/trading.config.json:2421`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.day_trader.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2422`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.swing.minConfidence` | **READER** | JSON `config/trading.config.json:2425`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.swing.maxPositionSize` | **READER** | JSON `config/trading.config.json:2426`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.swing.riskPercent` | **READER** | JSON `config/trading.config.json:2427`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.swing.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2428`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.conservative.minConfidence` | **READER** | JSON `config/trading.config.json:2431`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.conservative.maxPositionSize` | **READER** | JSON `config/trading.config.json:2432`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.conservative.riskPercent` | **READER** | JSON `config/trading.config.json:2433`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.conservative.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2434`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.balanced.minConfidence` | **READER** | JSON `config/trading.config.json:2437`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.balanced.maxPositionSize` | **READER** | JSON `config/trading.config.json:2438`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.balanced.riskPercent` | **READER** | JSON `config/trading.config.json:2439`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.balanced.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2440`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.quantum.minConfidence` | **READER** | JSON `config/trading.config.json:2443`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.quantum.maxPositionSize` | **READER** | JSON `config/trading.config.json:2444`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.quantum.riskPercent` | **READER** | JSON `config/trading.config.json:2445`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |
| `profiles.quantum.maxHoldMinutes` | **READER** | JSON `config/trading.config.json:2446`; PROFILE-BOOT -> `foundation/ConfigLoader.js:2230-2231`. |

The two sibling rows `profiles.scalper.minConfidence` and `profiles.scalper.maxPositionSize` at `config/trading.config.json:2413-2414` have the same live reader, but their manifest reasons cite `RULED`, so they do not pass the request's literal filter.

## Every `exitContracts.*.trailingStopPercent` / `trailingActivation` row

For `READER` rows, the full reader set relevant to the configuration input is: eager JSON-object read/clone by `requiredConfiguredPlainObject` at `foundation/ConfigLoader.js:75-82` and the named BASE_CONFIG construction line; computed field reads at `core/ExitContractManager.js:157-179`; value validation/normalization at `core/PolicyBuilder.js:240-241`, first via `core/ExitContractManager.js:195-196` and again via `core/OrderExecutor.js:2374-2390` -> `core/PolicyBuilder.js:558-590`. `trailingStopPercent` is additionally read for final logging at `core/ExitContractManager.js:1035-1043`.

For `NO LIVE READER (JSON)` rows, those runtime readers consume the hardcoded `foundation/ConfigLoader.js` copy, not the JSON row. The identically named JSON value is never selected.

| Input | Result | Definition / winning source receipt |
|---|---|---|
| `exitContracts.EMASMACrossover.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1258`; shadowed by hardcoded `foundation/ConfigLoader.js:2513`. |
| `exitContracts.EMASMACrossover.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1259`; shadowed by hardcoded `foundation/ConfigLoader.js:2514`. |
| `exitContracts.LiquiditySweep.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1279`; shadowed by hardcoded `foundation/ConfigLoader.js:2540`. |
| `exitContracts.LiquiditySweep.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1280`; shadowed by hardcoded `foundation/ConfigLoader.js:2541`. |
| `exitContracts.BreakRetest.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1301`; shadowed by hardcoded `foundation/ConfigLoader.js:2562`. |
| `exitContracts.BreakRetest.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1302`; shadowed by hardcoded `foundation/ConfigLoader.js:2563`. |
| `exitContracts.RSI.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1325`; shadowed by hardcoded `foundation/ConfigLoader.js:2591`. |
| `exitContracts.RSI.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1326`; shadowed by hardcoded `foundation/ConfigLoader.js:2592`. |
| `exitContracts.MADynamicSR.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1345`; shadowed by hardcoded `foundation/ConfigLoader.js:2618`. |
| `exitContracts.MADynamicSR.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1346`; shadowed by hardcoded `foundation/ConfigLoader.js:2619`. |
| `exitContracts.CandlePattern.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1366`; shadowed by hardcoded `foundation/ConfigLoader.js:2641`. |
| `exitContracts.CandlePattern.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1367`; shadowed by hardcoded `foundation/ConfigLoader.js:2642`. |
| `exitContracts.MarketRegime.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1386`; shadowed by hardcoded `foundation/ConfigLoader.js:2663`. |
| `exitContracts.MarketRegime.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1387`; shadowed by hardcoded `foundation/ConfigLoader.js:2664`. |
| `exitContracts.OGZTPO.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1406`; shadowed by hardcoded `foundation/ConfigLoader.js:2684`. |
| `exitContracts.OGZTPO.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1407`; shadowed by hardcoded `foundation/ConfigLoader.js:2685`. |
| `exitContracts.OpeningRangeBreakout.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1424`; shadowed by hardcoded `foundation/ConfigLoader.js:2705`. |
| `exitContracts.OpeningRangeBreakout.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1425`; shadowed by hardcoded `foundation/ConfigLoader.js:2706`. |
| `exitContracts.SmartMoneySweep.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1448`; shadowed by hardcoded `foundation/ConfigLoader.js:2726`. |
| `exitContracts.SmartMoneySweep.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1449`; shadowed by hardcoded `foundation/ConfigLoader.js:2727`. |
| `exitContracts.DonchianBreakout.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1473`; matching but independent hardcoded null at `foundation/ConfigLoader.js:2751`. |
| `exitContracts.DonchianBreakout.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1474`; matching but independent hardcoded null at `foundation/ConfigLoader.js:2752`. |
| `exitContracts.PropSafeEMAPullback.trailingStopPercent` | **READER** | JSON `config/trading.config.json:1497`; whole contract is loaded at `foundation/ConfigLoader.js:2770`; EXIT-LIVE -> `core/PolicyBuilder.js:240`. |
| `exitContracts.PropSafeEMAPullback.trailingActivation` | **READER** | JSON `config/trading.config.json:1498`; loaded at `foundation/ConfigLoader.js:2770`; EXIT-LIVE -> `core/PolicyBuilder.js:241`. |
| `exitContracts.EMATrendRetest.trailingStopPercent` | **READER** | JSON `config/trading.config.json:1521`; loaded at `foundation/ConfigLoader.js:2771`; EXIT-LIVE -> `core/PolicyBuilder.js:240`. |
| `exitContracts.EMATrendRetest.trailingActivation` | **READER** | JSON `config/trading.config.json:1522`; loaded at `foundation/ConfigLoader.js:2771`; EXIT-LIVE -> `core/PolicyBuilder.js:241`. |
| `exitContracts.RSI2MeanReversion.trailingStopPercent` | **READER** | JSON `config/trading.config.json:1545`; loaded at `foundation/ConfigLoader.js:2772`; EXIT-LIVE -> `core/PolicyBuilder.js:240`. |
| `exitContracts.RSI2MeanReversion.trailingActivation` | **READER** | JSON `config/trading.config.json:1546`; loaded at `foundation/ConfigLoader.js:2772`; EXIT-LIVE -> `core/PolicyBuilder.js:241`. |
| `exitContracts.TimeSeriesMomentum.trailingStopPercent` | **READER** | JSON `config/trading.config.json:1576`; loaded at `foundation/ConfigLoader.js:2773`; EXIT-LIVE -> `core/PolicyBuilder.js:240`. Value is null. |
| `exitContracts.TimeSeriesMomentum.trailingActivation` | **READER** | JSON `config/trading.config.json:1577`; loaded at `foundation/ConfigLoader.js:2773`; EXIT-LIVE -> `core/PolicyBuilder.js:241`. Value is null. |
| `exitContracts.NoWickImbalance.trailingStopPercent` | **READER** | JSON `config/trading.config.json:1600`; loaded at `foundation/ConfigLoader.js:2778`; EXIT-LIVE -> `core/PolicyBuilder.js:240`. Value is null. |
| `exitContracts.NoWickImbalance.trailingActivation` | **READER** | JSON `config/trading.config.json:1601`; loaded at `foundation/ConfigLoader.js:2778`; EXIT-LIVE -> `core/PolicyBuilder.js:241`. Value is null. |
| `exitContracts.default.trailingStopPercent` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1631`; shadowed by hardcoded `foundation/ConfigLoader.js:2782`. |
| `exitContracts.default.trailingActivation` | **NO LIVE READER (JSON)** | JSON `config/trading.config.json:1632`; shadowed by hardcoded `foundation/ConfigLoader.js:2783`. |

This proves **10 live JSON readers and 24 shadowed/dead JSON inputs** across the 34 trailing rows. It does **not** prove the 10 values trigger trailing exits. The live trailing state machine uses `exitLogic.trail`/ATR inputs at `core/ExitContractManager.js:724-817`, not `contract.trailingStopPercent` or `contract.trailingActivation`. The only trigger-side percent consumer is `core/exit/TrailingStopChecker.js:54-72`; no production module requires or constructs that checker. `core/ContractValidator.js:184-195` also has no caller for `validateExitContract`.

## Direct answer for the Sept. 7 15-key replay surface

All 15 are **NO LIVE READER**. Their exact names occur in production scope only as `ecosystem.config.js` stamps; the current runtime obtains the corresponding behavior from launch-profile/config paths instead.

| Input | Result | Receipt |
|---|---|---|
| `ACCOUNT_DRAWDOWN_PCT` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:107`; absent from ConfigLoader env readers/mappings. |
| `ENABLE_BREAKRETEST` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:187`; actual toggle is `pipeline.enableBreakRetest` from launch profile at `foundation/ConfigLoader.js:1018,1722,1785`, consumed at `core/StrategyOrchestrator.js:2223-2230`. |
| `ENABLE_MTF_CONFLUENCE_BOOSTER` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:175`; actual block is launch-profile `confluence.mtfBooster` via `foundation/ConfigLoader.js:1807`, consumed at `core/StrategyOrchestrator.js:1264-1270`. |
| `ENABLE_NOWICK` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:189`; actual toggle is launch-profile `pipeline.enableNoWickImbalance` at `foundation/ConfigLoader.js:1023,1728,1790`, consumed at `core/StrategyOrchestrator.js:2223-2235`. |
| `ENABLE_ORB` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:190`; actual toggle is launch-profile `pipeline.enableOpeningRangeBreakout` at `foundation/ConfigLoader.js:1021,1726,1788`, consumed at `core/StrategyOrchestrator.js:2223-2234`. |
| `ENABLE_STRATEGY_MTF_CONFLUENCE` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:176`; actual block is launch-profile `confluence.strategyMtf` via `foundation/ConfigLoader.js:1808`, consumed at `core/StrategyOrchestrator.js:1353-1356`. |
| `EVAL_RULES_ENABLED` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:154`; actual enable is launch-profile `venueGuards.ttp.enabled` at `foundation/ConfigLoader.js:911-915,1753-1754`. |
| `MTF_BOOSTER_BOOST_MTF_CANDIDATE` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:183`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_CONFLICT_MULT` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:181`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_MAX_MULT` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:180`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_MIN_CONFIDENCE` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:178`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_MIN_SCORE` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:177`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_PENALIZE_CONFLICTS` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:182`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_BOOSTER_STRENGTH_MULT` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:179`; no ConfigLoader env reader/mapping; runtime booster object comes through `foundation/ConfigLoader.js:1807`. |
| `MTF_MISSING_HIGHER_TF_MULT` | **NO LIVE READER** | Excluded stamp `ecosystem.config.js:186`; no ConfigLoader env reader/mapping. |

## 0.1a addendum — complete coverage of the original 79 DELETE rows

Audit extension time: `2026-09-08T01:17:45Z`.

Before the relabel, the eleven source/config/manifest hashes in the File receipts table were rechecked on shared-branch commit `a7d497f2`; every hash still matched the September 7 receipt. The relabel therefore uses the audited bytes, not a moved source tree.

The original manifest contains exactly 79 rows labeled `DELETE-AS-DEAD`. `DELETE-ROW-RECEIPT.tsv` accounts for all 79 by manifest id and points each row to the applicable section of this audit. The mechanically checked 0.1a disposition is:

- 41 rows remain `DELETE-AS-DEAD` because the named input has no live reader.
- 30 rows become `DELETE-RULED`: six symbol-loss-cooldown inputs and 24 legacy-profile inputs have live readers, but Trey's recorded ruling removes the input together with its reader.
- 8 proof-account inputs become `MOVE-TO-SETTINGS` because the live track-record publisher reads them.

### Cooldown readers omitted from the first audit table

All six cooldown rows have live readers. `run-empire-v2.js:4-5` loads ConfigLoader; `foundation/ConfigLoader.js:792-797` reads the three JSON/env inputs into the snapshot; `core/StateManager.js:3973-4003` reads the three resolved paths and uses the result in `_symbolLossCooldownUpdates`. Rows `A0101-A0103` and `E0124-E0126` therefore cannot remain `DELETE-AS-DEAD`. They become `DELETE-RULED` under the September 6 ruling to remove the cooldown everywhere.

### Remaining eight PM2 stamps

The first audit's fifteen-key replay section covered 15 of the 23 no-reader PM2 stamps. A direct exact-name sweep of the runtime entrypoint, `core/`, `modules/`, `brokers/`, `foundation/`, and runtime-imported `ogz-meta/` JavaScript found the remaining eight names only in `ecosystem.config.js` and the separate posture-gate tool. The live ConfigLoader obtains the corresponding TTP values from `launchProfiles.*.venueGuards.ttp` at `foundation/ConfigLoader.js:911-949`; it does not read these environment names.

| Manifest id | Input | Direct result | Non-runtime occurrences |
|---|---|---|---|
| `E0163` | `TTP_BLOCK_ENTRIES_AFTER_CUTOFF` | NO LIVE READER | `ecosystem.config.js:162`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:29` |
| `E0166` | `TTP_DAILY_LOSS_PAUSE_ENABLED` | NO LIVE READER | `ecosystem.config.js:167`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:32` |
| `E0170` | `TTP_LIQUIDATION_ENABLED` | NO LIVE READER | `ecosystem.config.js:163`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:30` |
| `E0172` | `TTP_MARKET_TIME_ENABLED` | NO LIVE READER | `ecosystem.config.js:161`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:28` |
| `E0173` | `TTP_MAX_LOSS_ENABLED` | NO LIVE READER | `ecosystem.config.js:168`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:33` |
| `E0175` | `TTP_RULES_ENABLED` | NO LIVE READER | `ecosystem.config.js:155`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:25` |
| `E0176` | `TTP_VOLUME_CAP_ENABLED` | NO LIVE READER | `ecosystem.config.js:156`; posture-gate expectation `ogz-meta/gates/eval-live-posture-gate.js:26` |
| `E0177` | `TTP_VOLUME_CAP_FALLBACK_TO_RECENT` | NO LIVE READER | `ecosystem.config.js:159`; no other production-scope exact-name hit |

The posture gate is a separately invoked verification tool, not a path reachable from `run-empire-v2.js`, so its expected-key literals do not make these runtime configuration inputs live.

## Excluded-only occurrences

- The nine named env stamps exist at `ecosystem.config.js:23-35`; the mission explicitly excludes that file as a reader.
- Audit-only mappings for the three TTP numeric names exist at `tools/config-audit.js:67-69`.
- Tests mentioning the env keys include `test/ecosystem-eval-profile.test.js:14-67`, `test/config-loader-live-guard.test.js:66-73,181-196,714-716`, `test/claudito-track-record-config.test.js:21-30,487-549`, and `test/runtime-config-proof.test.js:125-194`.
- Trailing-field tool-only reads exist at `tools/config-audit.js:288-289` and `tools/weekend-campaign-gauntlet.js:433-436`.
- Dead source-only readers: `core/exit/TrailingStopChecker.js:54-72` and the uncalled `core/ContractValidator.js:184-195` method.

## File receipts

| File | SHA-256 |
|---|---|
| `run-empire-v2.js` | `566a2dac1d21d1443e352c6d4d3f7547f75272ce052d7b975b8286863b6a6f5e` |
| `foundation/ConfigLoader.js` | `7dee615515c2b00f874bae30cb40cdf01aff49fe78daea1333ae3b2482a93b73` |
| `core/ExitContractManager.js` | `800dd4df8c962f0fe6cd826d6cb907c40da3872eb11e5ead5692df7dc6187eac` |
| `core/PolicyBuilder.js` | `22d1e89a540c79995e98768606e558af0919b116bb64a81fc4503112a889e12f` |
| `core/StrategyOrchestrator.js` | `c34604885c1a91b15cea05b08b1dc3407a04c123631c3bc6e2758f257066449b` |
| `core/TradingLoop.js` | `a4246702d4ddc002ccbef0475a37778fc87f367ec4a8e381a89e25afdb791179` |
| `core/OrderExecutor.js` | `da890072869835aec90df2432b7f06f985e900536302a474b15c17785ae4210b` |
| `core/exit/TrailingStopChecker.js` | `0f1347d006a512aaa42c9406d53be519d6936a533ccb5aa55085b9caf616b3c0` |
| `ogz-meta/claudito-logger.js` | `73f77e145d2e6b1338e11acb7dd12f0c46e3c636001ba815c6c510ffb6d106c8` |
| `config/trading.config.json` | `b87eeef3ca26d15137b2670b245f130eda4b44f35175eaa2ee06b3b62d2336ec` |
| `stop1-manifest/MANIFEST.tsv` | `b9fb0988d0891ecf91753973661828744df99138d3438fe88bc6ed37909722d2` |

## WHAT I DID

Read the current sources directly; verified that the audited source/config files have no diff from `e54a8b8`; enumerated the JSON leaves; traced the entrypoint, ConfigLoader construction, dynamic key/path reads, proof logger call chain, profile validation loop, strategy-to-exit-contract construction, and the live/dead trailing consumers. Checked exact-name hits plus the dynamic `process.env[key]` and computed `ConfigLoader.get(path)` call sites.

## WHAT I DID NOT DO

Did not call Mercury, Fable, Kimi, OpenAI, embeddings, Serena, Tree-sitter, or any network service. Did not start the bot, wait for a trade, touch a broker, inspect or restart PM2, modify production code/config, stage, commit, or push. The only write is this audit receipt under the required Codex inbox route.

## WHAT I ASSUMED

“Reader” means a code path reachable from `run-empire-v2.js` actually obtains the named env value or the named JSON value. Parsing the containing JSON file, an error-message string containing the key name, an uncalled method, an excluded tool/test/ecosystem stamp, or reading an identically valued hardcoded shadow does not count as reading the input. Boot-time validation does count, even when no later trading behavior consumes the value.
