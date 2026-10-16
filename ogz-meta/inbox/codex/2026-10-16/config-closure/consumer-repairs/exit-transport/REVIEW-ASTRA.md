# Astra adversarial review: exit transport and zero allocations

Verdict: **GO for candidate `0665923646d05e9b802abab9134f392bc395e528` against base `86e45d6ff451623b5f6591e1048f0ba48c4b9f87`.** No concrete introduced defect found. Mercury's alleged execution mutation is contradicted by the actual consumer flow. Its recorded `found_break` is not being rewritten as a clean Mercury result; this is the requested independent adjudication under the operator override.

All code citations refer to the exact candidate tree, inspected with git. No production edits, trading imports, test execution, PM2 actions, or runtime mutations were performed by this reviewer.

## Mercury finding adjudication

`core/ExitContractManager.js:1069` formats nullable TP into a local string named `finalTp`. Its only consumer is the log interpolation at line 1073. Line 1075 returns `normalizedContract`; none of these formatting expressions assigns to its fields. The log does display null as `0.00`, an inherited presentation defect, but no cited value flows back into execution. The nullable ledger schema is also non-coercing: `z.number().nullable()` admits null instead of converting it.

The execution consumers preserve the no-TP semantics: `core/PolicyBuilder.js:200-202` produces null for off/ATR-multiple target modes, and `core/exit/TakeProfitChecker.js:21-22` returns no exit when TP is off or null. `core/StrategyOrchestrator.js:729-740` preserves explicitly null off-mode TP. The schema therefore accepts already valid producer values. Mercury's claim that the logging conversion can itself trigger a zero-profit exit has no source path and is rejected as an execution regression. This adjudication does not claim the inherited log presentation is accurate.

## Independent attack results

- **Zero scale-out allocation:** `ProfitExitPlanner.js:179-186` chooses the existing applicable allocation and returns no scale-out intent for exact numeric zero, matching the editable zero minimum at `ConfigLoader.js:2653`. Nonzero values retain existing validation, trigger evaluation, and allocation handling (`ProfitExitPlanner.js:187-223`). Pending intent handling still runs first in `plan` (`:314-321`). No cancellation of an existing broker order is introduced.
- **Zero tier mixed with positive tiers:** `ProfitExitPlanner.js:278-286` skips zero-allocation tiers; the open-weight sum also excludes exact zero (`:236-250`). A positive tier remains in its own denominator, and a last active tier naturally receives the remaining allocation. All-zero tiers yield no tier intent instead of attempting a zero allocation. Existing state checks remain. The editable tier descriptors already permit zero (`ConfigLoader.js:2656`).
- **Zero percent trailing distance:** `StrategyOrchestrator.js:747-774` now transports a numeric zero while continuing to reject negative/nonfinite values. Existing `PolicyBuilder.js:205-206` accepts nullable nonnegative percent values. Runtime percent trailing computes distance at `ExitContractManager.js:770-772`, and the existing distance validation/minimum-distance behavior explicitly admits zero at `:814-820`; this change does not add a zero-price stop path or disable a new gate. It aligns transport with the existing consumer domain.
- **Donchian ATR period:** the constructor validates the positive integer entry period (`DonchianBreakout.js:32-33,81`), actual ATR computation uses it (`:114`), and the signal now carries that same value (`:154`). The hint spread retains it (`StrategyOrchestrator.js:737-741`), ECM copies it (`ExitContractManager.js:1022-1040`), and PolicyBuilder preserves it (`:199`). It is sourced producer metadata, not an invented fallback.
- **Nullable ledger fields:** `DecisionLedgerSchema.js:79-88` now represents null TP and null max hold already supported by producer mode contracts. It does not mutate the original contract or weaken execution validation. Stop-loss remains numeric.

## Verification and source identity

Read the shared `fixtures/verify.cjs` and saved `verification.log`. The isolated run reports PASS. Relevant checks compare old/new zero scale-out behavior, positive tiers with a zero tier, all-zero tiers, Donchian ATR-period transport, actual AST-extracted exit-hint normalization including zero trailing values, and nullable ledger-schema acceptance. The shared fixture also tests separate pattern-input changes; those assertions are not used to qualify this exit candidate. This reviewer did not rerun the fixture.

Exact candidate blob identities:

| File | Candidate blob |
| --- | --- |
| `core/ProfitExitPlanner.js` | `45266da6c09ddea7a5e05b3630cf5970c6513cbb` |
| `core/StrategyOrchestrator.js` | `13b8f4965ecdffe6b715404c8c1b226b7a226703` |
| `core/dto/DecisionLedgerSchema.js` | `7196e9d38040b3b57d1e31539ec5efedfd861afc` |
| `modules/DonchianBreakout.js` | `e34f90a4aaf85005414bd0c29782a51f8c3761df` |

Planner, orchestrator, and Donchian pinned fixture files match these blobs exactly. The ledger fixture blob is `f5271b89298afbd4417107321c8de5452ea340fb`; it lacks previously landed configuration-receipt fields elsewhere in the file, while the tested ExitContractSchema is identical. The shared log's HEAD 101399e1 label must not be described as whole-file final-candidate identity.

This review does not certify full broker-fill lifecycle behavior, replay profitability, live deployment, unrelated dirty source, or full Stop1/configuration closure. The inherited misleading TP log was reported to the parent separately; it is not evidence that this candidate changes execution semantics.
