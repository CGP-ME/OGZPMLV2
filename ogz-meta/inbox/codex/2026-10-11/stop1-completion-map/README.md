# Whole configuration map

Scope: every entry in both canonical configuration files, including entries previously labelled active or not flagged as problems. This map replaces the narrow known-finding-only approach. It does not declare Stop 1 repaired or runtime-accepted.

- `config/settings.json`: **1,904** leaves/empty containers.
- `config/internals.json`: **645** leaves/empty containers.
- Total: **2,549**, with no missing, extra or duplicated owner/key pairs in the reconciled map.
- **724 UI descriptors** map to their actual canonical write targets. **17** are scoped to the selected launch profile. Array elements and seven profile variants expand those bindings to **840 canonical leaves**; these counts are not customer-control counts.
- All current UI values matched their canonical owner during the read-only ConfigLoader check. This establishes the mapping, not a real-save or trading-behavior result.

## How to read an entry

The group files below contain one JSON object per line. Every entry names the current owner and exact key, purpose, initialization, consumer/caller evidence, source-described effect, precedence or competing values, UI keys, source status and remaining behavior check. A no-caller or metadata-only finding remains visible; it is not silently counted as a functioning trading control. Scope-qualified source findings do not prove absence of every possible dynamic caller.

`owner` means current storage ownership. UI absence does not automatically mean a setting should be exposed, and a non-trading purpose is not automatically a defect. Intended-but-unwired features require the intended behavior to be settled before implementation; this map authorizes no deletions or new restrictions.

The [machine-readable index](map-index.json) identifies every group and its content hash. [Validation](validation.json) reconciles exported rows directly with the current JSON files. [Independent source review](review.md) records corrections and the boundary of the evidence. The [UI map](ui-bindings.json) supplies descriptor type, units, declared application timing and exact persistence target. Declared timing is separate from exercised behavior.

## Additional gaps found while mapping previously unflagged profile settings

- **Reconciliation alert settings: 21 leaves across seven profiles.** `RiskManagerConfig` captures them, and `RiskManager.reportExternalLedgerDelta` contains their alert comparisons, but no production caller of that method was found in the bounded source search. They do not control report retention, which happens independently. Evidence: `run-empire-v2.js:716`; `core/RiskManagerConfig.js:84-86,111-114`; `core/RiskManager.js:56-89`.
- **Session risk-response declarations: 28 leaves across seven profiles.** Configuration validation/freezing and runtime-proof metadata exist, but no risk-action consumer was found. Evidence: `core/RiskManagerConfig.js:87-95,116-123`; `core/RuntimeConfigProof.js:116-119`; no `sessionRiskResponse` read in `RiskManager` or `DrawdownTracker`. This is not permission to add a risk gate.

The [exit-family correction notes](exits/rows.json) explain the specialized finding IDs carried by exit entries.

The prior [known findings](../stop1-acceptance-audit/README.md) remain on the correction list; they were not the boundary of this map. The three outsourced MTF repairs remain separate.

## Source and activation boundary

Branch `astra-era`, source HEAD `d8cb9757945172d35a54d2660d8d291464bdc3c3`. Existing uncommitted production changes remain in place and are identified by the prior audit's per-file hashes. [Source identity](source-identity.json) records that all 383 inventoried source files still match the earlier source evidence; canonical config/loader/UI hashes are in the UI receipt. This is worktree evidence, not a claim that HEAD or PM2 contains those same bytes.

No production source, settings value, stored state, broker order or running process changed. No exhaustive save/reload/consumer matrix, trading replay or runtime activation occurred. The remaining checks in each row are still required before claiming the relevant behavior works. There is no new production approval claim.

The other files under `config/` are [accounted for separately](other-config-files.json): the 16-entry pattern-description dictionary is presentation data with a traced dashboard consumer, alongside the environment example and storage notes. They are not silently treated as extra dynamic config owners.

## All configuration groups

| Owner | Group | Entries | UI-bound entries | Full map |
| --- | --- | ---: | ---: | --- |
| `config/internals.json` | `backtest` | 6 | 0 | [entries](map/internals/backtest.jsonl) |
| `config/internals.json` | `broker` | 8 | 0 | [entries](map/internals/broker.jsonl) |
| `config/internals.json` | `candleStore` | 1 | 0 | [entries](map/internals/candleStore.jsonl) |
| `config/internals.json` | `dashboard` | 43 | 0 | [entries](map/internals/dashboard.jsonl) |
| `config/internals.json` | `dataFeed` | 16 | 0 | [entries](map/internals/dataFeed.jsonl) |
| `config/internals.json` | `decisionRecords` | 4 | 0 | [entries](map/internals/decisionRecords.jsonl) |
| `config/internals.json` | `deployment` | 16 | 0 | [entries](map/internals/deployment.jsonl) |
| `config/internals.json` | `exitContracts` | 7 | 0 | [entries](map/internals/exitContracts.jsonl) |
| `config/internals.json` | `featureExtraction` | 6 | 0 | [entries](map/internals/featureExtraction.jsonl) |
| `config/internals.json` | `indicators` | 32 | 0 | [entries](map/internals/indicators.jsonl) |
| `config/internals.json` | `instruments` | 13 | 0 | [entries](map/internals/instruments.jsonl) |
| `config/internals.json` | `journal` | 8 | 0 | [entries](map/internals/journal.jsonl) |
| `config/internals.json` | `marketCalendar` | 7 | 0 | [entries](map/internals/marketCalendar.jsonl) |
| `config/internals.json` | `monitoring` | 4 | 0 | [entries](map/internals/monitoring.jsonl) |
| `config/internals.json` | `multiTimeframe` | 7 | 0 | [entries](map/internals/multiTimeframe.jsonl) |
| `config/internals.json` | `observability` | 6 | 0 | [entries](map/internals/observability.jsonl) |
| `config/internals.json` | `paths` | 5 | 0 | [entries](map/internals/paths.jsonl) |
| `config/internals.json` | `patternMemory` | 1 | 0 | [entries](map/internals/patternMemory.jsonl) |
| `config/internals.json` | `patternRecognition` | 1 | 0 | [entries](map/internals/patternRecognition.jsonl) |
| `config/internals.json` | `performanceAnalysis` | 3 | 0 | [entries](map/internals/performanceAnalysis.jsonl) |
| `config/internals.json` | `pipelineSnapshot` | 3 | 0 | [entries](map/internals/pipelineSnapshot.jsonl) |
| `config/internals.json` | `queues` | 3 | 0 | [entries](map/internals/queues.jsonl) |
| `config/internals.json` | `revision` | 1 | 0 | [entries](map/internals/revision.jsonl) |
| `config/internals.json` | `schemaVersion` | 1 | 0 | [entries](map/internals/schemaVersion.jsonl) |
| `config/internals.json` | `services` | 30 | 0 | [entries](map/internals/services.jsonl) |
| `config/internals.json` | `sessionRouter` | 3 | 0 | [entries](map/internals/sessionRouter.jsonl) |
| `config/internals.json` | `singleton` | 2 | 0 | [entries](map/internals/singleton.jsonl) |
| `config/internals.json` | `tooling` | 401 | 0 | [entries](map/internals/tooling.jsonl) |
| `config/internals.json` | `trai` | 5 | 0 | [entries](map/internals/trai.jsonl) |
| `config/internals.json` | `webhookOrders` | 2 | 0 | [entries](map/internals/webhookOrders.jsonl) |
| `config/settings.json` | `authFailureGuard` | 2 | 0 | [entries](map/settings/authFailureGuard.jsonl) |
| `config/settings.json` | `confidence` | 4 | 2 | [entries](map/settings/confidence.jsonl) |
| `config/settings.json` | `entryLogic` | 7 | 7 | [entries](map/settings/entryLogic.jsonl) |
| `config/settings.json` | `execution` | 10 | 0 | [entries](map/settings/execution.jsonl) |
| `config/settings.json` | `exitContracts` | 334 | 113 | [entries](map/settings/exitContracts.jsonl) |
| `config/settings.json` | `exitLogic` | 36 | 32 | [entries](map/settings/exitLogic.jsonl) |
| `config/settings.json` | `exits` | 7 | 7 | [entries](map/settings/exits.jsonl) |
| `config/settings.json` | `featureCatalog` | 52 | 0 | [entries](map/settings/featureCatalog.jsonl) |
| `config/settings.json` | `featureExtraction` | 6 | 6 | [entries](map/settings/featureExtraction.jsonl) |
| `config/settings.json` | `features` | 2 | 2 | [entries](map/settings/features.jsonl) |
| `config/settings.json` | `feeProfiles` | 22 | 0 | [entries](map/settings/feeProfiles.jsonl) |
| `config/settings.json` | `fees` | 8 | 6 | [entries](map/settings/fees.jsonl) |
| `config/settings.json` | `fibonacci` | 11 | 11 | [entries](map/settings/fibonacci.jsonl) |
| `config/settings.json` | `filters` | 2 | 2 | [entries](map/settings/filters.jsonl) |
| `config/settings.json` | `fundTarget` | 1 | 0 | [entries](map/settings/fundTarget.jsonl) |
| `config/settings.json` | `indicators` | 83 | 81 | [entries](map/settings/indicators.jsonl) |
| `config/settings.json` | `launchProfiles-backtest-all` | 83 | 17 | [entries](map/settings/launchProfiles-backtest-all.jsonl) |
| `config/settings.json` | `launchProfiles-backtest-masr` | 83 | 17 | [entries](map/settings/launchProfiles-backtest-masr.jsonl) |
| `config/settings.json` | `launchProfiles-backtest-rsi` | 83 | 17 | [entries](map/settings/launchProfiles-backtest-rsi.jsonl) |
| `config/settings.json` | `launchProfiles-backtest-trey-spec` | 83 | 17 | [entries](map/settings/launchProfiles-backtest-trey-spec.jsonl) |
| `config/settings.json` | `launchProfiles-backtest-ttp-5k-max` | 83 | 17 | [entries](map/settings/launchProfiles-backtest-ttp-5k-max.jsonl) |
| `config/settings.json` | `launchProfiles-defaultProfile` | 1 | 0 | [entries](map/settings/launchProfiles-defaultProfile.jsonl) |
| `config/settings.json` | `launchProfiles-paper` | 82 | 17 | [entries](map/settings/launchProfiles-paper.jsonl) |
| `config/settings.json` | `launchProfiles-production` | 82 | 17 | [entries](map/settings/launchProfiles-production.jsonl) |
| `config/settings.json` | `misc` | 3 | 0 | [entries](map/settings/misc.jsonl) |
| `config/settings.json` | `orchestrator` | 40 | 30 | [entries](map/settings/orchestrator.jsonl) |
| `config/settings.json` | `patternMemory` | 19 | 9 | [entries](map/settings/patternMemory.jsonl) |
| `config/settings.json` | `patternRecognition` | 13 | 13 | [entries](map/settings/patternRecognition.jsonl) |
| `config/settings.json` | `performanceAnalysis` | 8 | 8 | [entries](map/settings/performanceAnalysis.jsonl) |
| `config/settings.json` | `pid` | 28 | 0 | [entries](map/settings/pid.jsonl) |
| `config/settings.json` | `positionSizing` | 8 | 7 | [entries](map/settings/positionSizing.jsonl) |
| `config/settings.json` | `proofPublication` | 9 | 0 | [entries](map/settings/proofPublication.jsonl) |
| `config/settings.json` | `regimeBoosts` | 22 | 22 | [entries](map/settings/regimeBoosts.jsonl) |
| `config/settings.json` | `regimeDetection` | 13 | 13 | [entries](map/settings/regimeDetection.jsonl) |
| `config/settings.json` | `revision` | 1 | 0 | [entries](map/settings/revision.jsonl) |
| `config/settings.json` | `schemaVersion` | 1 | 0 | [entries](map/settings/schemaVersion.jsonl) |
| `config/settings.json` | `services` | 37 | 0 | [entries](map/settings/services.jsonl) |
| `config/settings.json` | `startingBalance` | 1 | 0 | [entries](map/settings/startingBalance.jsonl) |
| `config/settings.json` | `strategies` | 308 | 303 | [entries](map/settings/strategies.jsonl) |
| `config/settings.json` | `strategyBehavior` | 12 | 12 | [entries](map/settings/strategyBehavior.jsonl) |
| `config/settings.json` | `tierPolicy` | 27 | 0 | [entries](map/settings/tierPolicy.jsonl) |
| `config/settings.json` | `timeframeConfig` | 28 | 0 | [entries](map/settings/timeframeConfig.jsonl) |
| `config/settings.json` | `trai` | 23 | 14 | [entries](map/settings/trai.jsonl) |
| `config/settings.json` | `tuningProfiles` | 115 | 0 | [entries](map/settings/tuningProfiles.jsonl) |
| `config/settings.json` | `volumeProfileBoosts` | 21 | 21 | [entries](map/settings/volumeProfileBoosts.jsonl) |

## Rechecking the delivered map

Run `python3 ogz-meta/inbox/codex/2026-10-11/stop1-completion-map/fixtures/validate-map.py` to recheck keys, required columns, UI targets, group hashes and source drift. A passing map validator is not runtime acceptance. The raw agent drafts and their assembly scripts remain local working material; the exported group files above are the delivered mapping.
