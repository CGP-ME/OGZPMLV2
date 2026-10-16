# Remaining inactive and deferred control dispositions

**Current source checked:** `89affa44bda62f93158c1a125429adec6d34073b` on
2026-10-16. This is a bounded reading of the current source-gap ledger,
canonical-disposition result, saved-field result, and the active local rulings.
It does not add a consumer scan or change configuration.

## Ruling boundary

The explicit local ruling is [completion-candidate/STATUS.md:16-18](../../2026-10-13/completion-candidate/STATUS.md#L16): Trey deferred broader pattern/intelligence activation, requires dormant controls to remain labeled unimplemented/deferred, and says that feature construction does not hold up Stops 1/2. The same ruling holds end-to-end acceptance for a controlled paper walkthrough with Trey ([STATUS.md:28-30](../../2026-10-13/completion-candidate/STATUS.md#L28)).

That is an authorization to keep the following dormant feature work outside the
Stop 1/2 feature-build demand. It is not a per-control authorization to delete,
wire, enable, or relabel any of these fields as working. The gap ledger supplies
technical dispositions; it does not supply a separate user decision for each
field. The distinct explicit user deferral recorded in the ledger is limited to
PID outputs and the legacy pattern-memory bank ([current-source-gaps.md:17](./current-source-gaps.md#L17)).

## Current dispositions

| Family | Actual current path and effect | Editable? | Disposition and authorization status |
| --- | --- | --- | --- |
| Pattern exit | `featureCatalog.PATTERN_EXIT_MODEL.settings` constructs `PatternBasedExitModel` in `run-empire-v2.js:730-736`; the model has `evaluateExit` at `core/PatternBasedExitModel.js:81`, but the gap ledger establishes no active production caller. Its reversal lists are hardcoded at `:280-283`; eight settings have no model reader. | No dedicated ConfigLoader editable descriptor; the pre-final 1,405-row editable result (pinned `9545c26a`) has no matching field. | Deferred pattern/intelligence feature work under the October 13 ruling. It remains unimplemented, not an active exit capability. Do not wire or enable it without a new scoped decision. |
| Tier policy | `tierPolicy.*` is copied into role configuration (`foundation/ConfigLoader.js:1193`) and loaded by `FeatureFlagManager` (`core/FeatureFlagManager.js:66-72`). Its helpers merely return values (`:212-218`); the ledger's caller trace found no active trading-path enforcement. | No dedicated editable descriptor or all-editable row. | Preserved helper-only configuration. The broader deferral permits keeping it outside feature completion, but there is no separate user ruling to add an access/risk gate or remove it. |
| Generic timeframe fallback | `timeframeConfig.*` remains reachable through `ConfigLoader.getTimeframeConfig` (`foundation/ConfigLoader.js:4459-4464`). `ExitContractManager.createExitContract` applies it only if no strategy contract exists (`core/ExitContractManager.js:992-1005`); built-ins have strategy contracts and canonical contract timeframe trees are absent. | No dedicated editable descriptor or all-editable row. | Preserve as a generic-strategy fallback. It is not evidence of a currently selectable built-in control and does not require a new feature build for Stop 1/2. |
| Fund target | `fundTarget` is read by the legacy `ModuleInitializer.createTradingBrainConfig` (`core/ModuleInitializer.js:24-35`) and as the default for `discordNotifier.notifyHoustonProgress` (`utils/discordNotifier.js:51-57,405`). The ledger establishes neither helper has an active production caller. | No dedicated editable descriptor or all-editable row. | Legacy/deferred helper state, not a trading control. No individual removal authorization was found. |
| Scale-in sizing ladder | `exitContracts.{NoWickImbalance,default}.scaleIn.addSizingLadder` is an empty list under `scaleIn.enabled: false` in settings. `ExitContractManager` clones it (`core/ExitContractManager.js:227-234`); `OrderExecutor`'s scale-in admission logic reads enabled, maxAdds, trigger class, profit confirmation, and aggregate-risk cap (`:1649-1744`), never the ladder. | **No**: ConfigLoader exposes the other scale-in controls at `foundation/ConfigLoader.js:2624-2638`, but has no ladder descriptor. | The migration follow-up explicitly preserves it for later intended wiring ([config-migration-followups.md:203-205](../../2026-10-06/config-migration-followups.md#L203)). Keep it disabled/inert; no sizing behavior is authorized. |
| Partial-exit remainder trail | All 17 `exitContracts.*.partialExit` declarations are disabled. PolicyBuilder validates `remainderTrail` (`core/PolicyBuilder.js:152-158`), then `ProfitExitPlanner` carries it only in an intent-evidence object (`:177-221`). No confirmed execution reader exists. | **No**: ConfigLoader exposes `partialExit.enabled`, `triggerR`, and `fraction`, but no `remainderTrail` descriptor (`foundation/ConfigLoader.js:2642-2651`). | Evidence-only, unimplemented selection. The broader ruling permits leaving it outside feature construction; no individual user authorization to select ATR versus terrain behavior was found. |

The no-descriptor conclusions above are bounded to the current ConfigLoader
descriptor registry and `all-editable/current-result.json`; they do not claim
that every compatibility section is absent from every external UI.

## Stop 1 closure boundary

The explicit October 13 ruling defers broader pattern/intelligence feature construction. The other rows describe preserved legacy/conditional code, not separate per-field approval to implement or delete it. None may be advertised as active solely because it has a canonical owner. They must remain visibly
unimplemented/deferred rather than being counted as active behavior.

Truthful Stop 1 closure is still not supported by this configuration packet:

- Its own current README says “Stop 1 remains OPEN” and limits the work to source
  accounting/consumer repairs ([README.md:3](./README.md#L3)).
- The evidence validates source mapping and editable-field transport, not every
  downstream behavior ([README.md:7-14](./README.md#L7)).
- It explicitly withholds PM2/runtime acceptance and every-consumer completion
  ([README.md:38-40](./README.md#L38)).
- The live completion ruling still requires the controlled paper walkthrough
  with Trey before Stops 1/2 are accepted end to end
  ([completion-candidate/STATUS.md:28-30](../../2026-10-13/completion-candidate/STATUS.md#L28)).

Thus the remaining barrier is acceptance evidence and the separately tracked
source-delivery/paper-walkthrough boundary, not an obligation to implement the
dormant pattern, tier, fallback, legacy-helper, ladder, or remainder-trail
features in this configuration-closure lane.
