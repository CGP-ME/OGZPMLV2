# Active consumer override review

**Pinned source:** `547a375ac7b02cd68b9645a2a97872b8c3cd5182` (`docs(config): reconcile final canonical provenance and approved retirements`). This is a read-only source review of the active initialisation and exit routes in `run-empire-v2.js`, `core/OrderExecutor.js`, `core/ExitContractManager.js`, and `core/TradingLoop.js`.

## Result

No additional concrete silent override or zero/false drop was found in the bounded committed route. The apparent precedence operations below either merge disjoint owned fields, select an explicitly strategy-owned value, or freeze entry-time policy intentionally. They do not replace one effective canonical leaf with an unrelated active canonical leaf.

## Checked paths

| Route | Concrete source to consumer path | Disposition |
| --- | --- | --- |
| Indicator engine construction | `config/settings.json:indicators.engine` and `config/internals.json:indicators.engine` are spread into `SymbolTradingContext` at `run-empire-v2.js:3052-3058`. At the pinned ref their top-level key intersection is empty: settings provides indicator parameters; internals provides `maxCandles` and `maxSeriesPoints`. `tf` is the selected runtime timeframe. | No competing value to overwrite. |
| EMA crossover construction | `strategies.EMASMACrossover` and the active launch profile's `strategyBehavior.emaCrossover` are spread at `run-empire-v2.js:3059-3062`. `ConfigLoader` explicitly populates that runtime behavior branch from `launchProfiles.<profile>.strategyBehavior.emaCrossover` and records its source (`foundation/ConfigLoader.js:1064-1069`). Every pinned profile's behavior keys (`confirmBars`, `entryEventsOnly`, `warmupBars`) are disjoint from the strategy keys. | Explicit profile projection; no collision or dropped zero/false. |
| Performance analyzer construction | The runner spreads `performanceAnalysis` and `internals.performanceAnalysis` at `run-empire-v2.js:724-727`. The pinned top-level key intersection is empty; behavior fields are settings-owned and path/logging fields are internals-owned. | No competing value to overwrite. |
| Entry exit-policy handoff | `ExitContractManager.createExitContract` starts from the matching strategy contract (`core/ExitContractManager.js:986-989`). Timeframe values apply only where no strategy contract exists (`:991-1005`). Signal fields are checked with `!== undefined` (`:1007-1056`), so supplied `0` and `false` values are retained. `OrderExecutor._buildEntryPlan` passes that selected contract to `PolicyBuilder.buildForTrade` with the receipt (`core/OrderExecutor.js:2343-2361`) and stores both contract and frozen policy on the opened trade (`:3847-3848`). | Strategy-owned signal values intentionally win for that entry. The frozen policy prevents later configuration edits from rewriting an open trade; it is not a competing current-config default. |
| Exit management after entry | `TradingLoop` passes the active trade and its current indicator/market context to `checkExitConditions` (`core/TradingLoop.js:1127-1148`). The manager reads the frozen entry trail and break-even policy (`core/ExitContractManager.js:735-765`, `:859-889`) and, if it is absent on legacy state, preserves existing stops rather than backfilling current config (`:720-730`). | Intentional frozen-state behavior. No stale current canonical value is substituted for an entry value. |
| Runtime scope metadata | The runner derives `executionMode` from the ConfigLoader-derived mode booleans and records broker/account/asset scope (`run-empire-v2.js:1320-1338`; mode is built from the active launch profile at `foundation/ConfigLoader.js:1161-1169`). `OrderExecutor._runtimeScope` gives an active SessionRouter envelope precedence and refuses static fallback if it is incomplete (`core/OrderExecutor.js:383-425`). | Runtime broker/account/session identity, not a second owner of a canonical tuning control. The `||` values here are non-empty scope identifiers; this review found no canonical numeric or boolean policy leaf on this route that can be erased by it. |
| Trading-loop indicator aliases | `indicators.volatility` is assigned from `atr` and `trend` from `superTrendDirection` (`core/TradingLoop.js:1062-1065`). | Derived observation aliases passed to exit/strategy logic, not configuration values. They do not overwrite a canonical configuration setting. |

## Existing repairs deliberately not reopened

The completed ledger already records the retired scale-out fee buffer, confidence fields, and prior consumer repairs (`ogz-meta/inbox/codex/2026-10-16/config-closure/current-source-gaps.md:7-10`). This review did not relabel those completed items as fresh findings.

## Working-tree qualification and limit

The five requested runtime files and `config/settings.json` have uncommitted modifications at review time. They were inspected only to establish that they differ; all behavior evidence above is from `547a375a`, not from those changes. This is not a runtime claim, a callback/reload audit, or a broader consumer census. It does not decide whether intentionally deferred controls in the existing gap ledger should be wired or retired.
