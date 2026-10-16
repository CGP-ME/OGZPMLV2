# Exit-contract consumer trace at 8d0e3d3e

This table is based on committed `8d0e3d3e937eebbc860b02f14a38dd8e648bd72e` source, not the dirty worktree. It applies to every configured strategy contract plus `exitContracts.default`; strategy-specific rows are marked where the producer is conditional.

| Configured family | HEAD producer and consumer | Disposition |
|---|---|---|
| `stopLossPercent` | Contract → `PolicyBuilder.normalizeContract` (`core/PolicyBuilder.js:192-202`) → `StopLossChecker` through ECM | Active when stop type is percent; structural contracts intentionally bypass percent stop handling. |
| `takeProfitPercent` | Contract → `ProfitExitPlanner.planContractTakeProfit` (`core/ProfitExitPlanner.js:155-174`), invoked first by `plan` (`:327-330`) | Active percent TP. `tpMode: off`/`atrMultiple` normalizes the percent value to null. |
| `trailingStopPercent`, `trailingActivation` | Contract → ECM percent branch (`core/ExitContractManager.js:748-750,770-772`) | Active for `trailType: percent`; activation and distance are read directly. |
| `trailType`, `trailAtrMult`, `atrPeriod` | Contract/signal → ECM ATR/channel branches (`:737-766`); strategy producers emit ATR periods/hints | Active conditionally: ATR computes ATR from history; channel delegates ownership to channel contracts. |
| `trailChannelBars` | Donchian/channel strategy producer → channel contract | Conditional Donchian/channel behavior; carried by PolicyBuilder and signal override (`ExitContractManager.js:1040-1048`). |
| `maxHoldTimeMinutes`, `maxHoldMode` | Contract → MaxHoldChecker via exit coordinator | Active when hold mode is enabled; `off` intentionally disables the timed branch. |
| `invalidationConditions`, `rsiExitLong`, `tsmLookback`, `tsmEntryTrailingReturn` | Strategy/contract → ECM invalidation branches | Active only when the owning strategy emits the corresponding condition/data. |
| `minConfidence`, `atrMinPercent` | Contract → StrategyOrchestrator entry checks (`core/StrategyOrchestrator.js:637-649`) | Active nullable entry eligibility controls. |
| `partialExit.enabled`, `triggerR`, `fraction` | Contract → ProfitExitPlanner (`:179-217`) | Active partial-exit selector, trigger, and fraction. |
| `partialExit.remainderTrail` | PolicyBuilder validates it (`core/PolicyBuilder.js:152-158`); planner emits it only in intent evidence (`ProfitExitPlanner.js:217-221`) | No confirmed execution reader; metadata/evidence only. All 17 canonical partial-exit policies are disabled, and this field is not UI-editable. No remainder-trail change is invented. |
| `beScaleOut.enabled`, `triggerType`, `fixedPercentTrigger`, `scaleOutFraction` | Frozen policy → ProfitExitPlanner (`:177-223`) | Active when contract partial exit is not selected. |
| `beScaleOut.feeBufferPercent` | PolicyBuilder validates/stores (`core/PolicyBuilder.js:242-249`) | No reader in the audited planner/ECM; subsequently retired under the user ruling in `44901df4`. The active fee buffer is `trail.feeBufferPercent` at `ExitContractManager.js:879-883`. |
| `breakEvenStop.enabled`, `triggerPercent` | Frozen policy → ECM (`core/ExitContractManager.js:861-879`) | Active break-even trigger; fee protection reads the trail fee buffer. |
| `tieredExit.enabled`, tier fractions and profit tiers | PolicyBuilder builds adjusted tiers (`core/PolicyBuilder.js:457-509`) → Planner (`ProfitExitPlanner.js:258-311`) | Active when enabled; planner checks tier state, target move, and fraction. |
| `tieredExit` market/confidence multipliers | PolicyBuilder `targetAdjustment` (`core/PolicyBuilder.js:422-450`) | Active policy-construction inputs for tier target moves. |
| `volatilityAdjustment.enabled`, thresholds, `lookbackPeriods` | PolicyBuilder validates/derives adjustment (`core/PolicyBuilder.js:259-303`); OrderExecutor computes policy volatility using `lookbackPeriods + 1` (`core/OrderExecutor.js:2347-2351`) | All are consumed; `lookbackPeriods` is not a gap. |
| `contractVolatilityAdjustment.threshold`, `stopMultiplier`, `targetMultiplier` | ECM contract creation (`core/ExitContractManager.js:1059-1074`) | Active when supplied volatility exceeds threshold; stop/TP changes are mode/value conditional. |
| `maxConcurrentEntries` | Contract → OrderExecutor concurrency check | Active per strategy/direction. |
| `scaleIn.enabled`, `maxAdds`, `addTriggerClass`, `requireProfitConfirmation`, `aggregateRiskCap` | Contract → OrderExecutor scale-in admission block (`core/OrderExecutor.js:1649-1740`) | Active scale-in admission controls. |
| `scaleIn.addSizingLadder` | ExitContractManager clones it (`core/ExitContractManager.js:231-233`) | No HEAD executor reader; configured policies are disabled, so this remains disabled/inert. |
| `tpMode`, `tpAtrMultiple` | PolicyBuilder normalization (`core/PolicyBuilder.js:179-203`), StrategyOrchestrator hint validation (`core/StrategyOrchestrator.js:777-786`) | Mode/contract validation is active; generic ATR-multiple target execution is not implemented. The two canonical `tpAtrMultiple` entries (Donchian and TSM) are null and their producers disable TP; no active ATR-multiple target behavior is claimed. |
| `useStructuralExits`, `_validated` | PolicyBuilder normalizes; ExitContractOwnership/StateManager require ownership metadata | Metadata/ownership controls; no independent exit calculation branch. |
| `atrStopMult`, `targetRR`, `stopBuffer*` | Strategy modules produce concrete stops/targets (for example Donchian and EMA retest) | Conditional strategy-owned geometry; not generic ECM fields. |
| `donchianChannelUpper`, `donchianChannelLower` | Donchian producer → signal/contract channel fields | Conditional Donchian channel ownership. |
| `rsiPeriod` | RSI producer/signal → contract hint and RSI path | Carried/validated for RSI strategy; no independent generic ECM calculation. |
| `exitContracts.*.timeframes.*`, `timeframeConfig.*` | StrategyOrchestrator probes timeframe override trees; ECM uses `timeframeConfig` only when no strategy contract exists (`core/ExitContractManager.js:988-1005`) | Fallback-only for current built-ins; canonical strategy/default timeframe trees are absent. Preserve as deferred generic-strategy behavior. |

The current committed consumer trace confirms that volatility targets, percent TP/trailing, and lookback periods are consumed. The only confirmed HEAD-level dropped/inert exit controls in this trace are `beScaleOut.feeBufferPercent`, `partialExit.remainderTrail` execution application, and `scaleIn.addSizingLadder`. `volatilityAdjustment.lookbackPeriods`, percent TP, and percent trailing are consumed in HEAD and must not be carried forward as stale gaps.


TRAI blend ownership is delivered in committed `097ef8c3`: `config/settings.json:3823-3825` owns the advisory threshold/penalty and autonomous TRAI share; `core/TRAIDecisionModule.js:651-681` reads them through ConfigLoader. The three obsolete confidence leaves were subsequently archived and retired in `cbf7200c`.

## Subsequent approved retirements

The scale-out fee buffer discussed above was retired in `44901df4` after the user authorized removal of fields absent from the exit research. All 17 prior values are archived; the 16 editable descriptors and policy/override transport are removed. The separately active trail fee buffer is retained. The three dead confidence controls were retired in `cbf7200c`. Earlier source refs remain historical trace evidence, not pending proposals.
