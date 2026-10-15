# Astra adversarial review — credential authority removal

Date: 2026-10-15. Candidate `ab61c1d211701ccc979a54a2aadcea6b0ec08252`; base `d9cea81e7c1ccb30a6ebd8a9b8adbc0867cd1571`. Production/test references below are candidate-tree line numbers. Fixture/dependency references describe the inspected disk files.

**Production verdict: GO for the scoped change on static evidence.** No introduced unintended defect found in the five-file diff. This is not an execution result or permission to activate runtime. The governing instruction removes credential-derived sticky trading authority while retaining loud failure/evidence; allowing a previously credential-blocked request to reach its broker is the intended behavior.

- `core/StateManager.js:2386-2400` retains mismatch integrity evidence, affected lanes, trace emission and error logging. It no longer creates credential-derived symbol holds or an `entryBlocking` flag. Credential mismatch detection and the evidence-preservation branch at `core/StateManager.js:2206-2260` remain intact. Removing the blocking API does not remove active records or claim broker flatness.
- `core/StateManager.js:4326-4339` retires only normalized holds whose code is `broker_unverifiable` and that diagnostic object's legacy `entryBlocking` field. Other halt codes survive. The existing corrected-state save at `core/StateManager.js:4491-4492` persists the migration. The later diagnostic producer at `core/StateManager.js:4414` no longer recreates the retired hold.
- The only Executor change deletes the credential verification veto. Explicit pause checks and independent global/symbol halt checks remain at `core/OrderExecutor.js:2887-2903`; capital checks and actual order routing/rejection handling are unchanged. No new defaults, throws, broker acceptance claims or autonomous flatten action are introduced.
- `test/auth-failure-guard.test.js` loses only the retired API mock. `test/order-executor-pause-gate.test.js` loses that mock/reset and exactly the obsolete broker-unverifiable entry-block case; the other cases are preserved. `test/state-manager-load.test.js:809-842,882-892` changes the mismatch assertion to evidence retention and checks retirement of the TSLA diagnostic hold while preserving the independent MSFT reconciliation hold. Tests were inspected, not executed.
- Pinned-tree search across `core`, `foundation`, `modules`, `test`, `run-empire-v2.js` and `ogz-meta/gates` found no remaining runtime caller of `getBrokerVerificationEntryBlock`; the sole test reference asserts its absence. `BROKER_UNVERIFIABLE` remains in the authorized-code enumeration at `core/StateManager.js:115`, but no remaining credential producer creates that halt in the inspected tree. The enum alone does not establish a reachable new veto.

**Fixture isolation verdict: GO for the inspected fixture in a fresh standalone Node process at the exact repository root with `REVIEW_TREE=ab61c1d211701ccc979a54a2aadcea6b0ec08252`.** This is a static path/import review, not a general filesystem sandbox or a claim that the fixture passed. I executed no production import, fixture, Jest test, broker call or service command.

- `fixtures/state-migration.cjs:10-15` creates a fresh directory beneath the packet and binds both configured storage paths to it. Lines 17-37 install the ConfigLoader and TradeNarrator interceptions before the pinned StateManager compilation at lines 66-72. The loader reports its snapshot loaded, supplies synthetic credentials, and returns the temporary `paths.dataDir` and `paths.stateFile` at lines 30-31. The narrator stub avoids its real initialization.
- StateManager's imports at `core/StateManager.js:76-87` were traced. FeeModel only imports the intercepted ConfigLoader. ExitContractOwnership and PositionEffect have no imports; FrozenExitPolicy imports only Node crypto. TraceSpine has no imported service/filesystem dependency; its subscriber set starts empty in this fresh process and the exercised emissions receive an empty context. None of these inspected dependencies eagerly loads real state or starts a service.
- The constructor calls `load()` at `core/StateManager.js:581` but does not start its separate dashboard heartbeat. The exported singleton remains lazy at `core/StateManager.js:4959,4974-4978`; the fixture explicitly constructs the exported class. Dynamic ledger imports in open/close/fill paths are not reached by the fixture's load, halt inspection and evidence-preservation calls.
- `core/StateManager.js:4205-4211` reads only the stub-configured file. Both the load migration save and the explicit evidence save use `core/StateManager.js:4107-4114,4144-4145`, whose directory/file arguments come from that same stub. Inspected `core/AtomicWrite.js:25-28` writes only the passed file's sibling `.tmp` and renames it to the passed file. Fixture lines 83-85 inspect the temporary saved JSON; lines 87-89 restore the loader and remove only the fresh directory.
- Dependencies other than StateManager come from the working tree, so this isolation conclusion is qualified to the digests below. The exact root working directory matters because interception compares resolved absolute paths. Do not generalize this conclusion to running legacy Jest or importing StateManager elsewhere without these interceptions.

Inspected disk SHA-256 identities:

```text
91ce1eb493b7df21373e859cb94d9eac008c56665ddcc2711fb21fe161a301d3 fixtures/state-migration.cjs
1cfc40f1d61f553ed48abc66aff05e563d4357a729080dfd7969ff0a1cacd74a core/FeeModel.js
5574b18d725b7ce0c544ccc47e39d1bd33d84cd82b6e402808a137b55ba0e3aa core/dto/ExitContractOwnership.js
76300ec0b959d5964fa14a49cefbf9614718a35b723e22e7062bb8fe84f359f4 core/dto/FrozenExitPolicy.js
70a5a4df27ccfd8972ab6bbfa954776abc64839ba1e80e8f061bca704f35e0b0 core/PositionEffect.js
6aff25395a4469238ab202115aa53ad3b46b95c17c4b2de4ceac644aae4927d1 core/TraceSpine.js
3d451213bba7b3680b7560e1d8c60e36650a595c7970a116a926f5d96390a924 core/AtomicWrite.js
```

Actual verification in this review: complete pinned diff inspection, bounded producer/consumer search, fixture/transitive import and persistence-path inspection, and successful `git diff --check` for the exact base/candidate. No claim of passing behavioral tests, a clean Mercury answer, full pipeline acceptance, live broker acceptance, deployment, or resolution of the separate real-state incident.

## Delivery evidence addendum

Root subsequently reported one successful standalone execution of the pinned native fixture. I read `private/probe-isolation.json`: exit code 0, with identical before/after SHA-256 and nanosecond mtime for the real `data/state-paper.json` and `logs/decisions/malformed_2026-10-15.jsonl`. This receipt supports preservation of those two checked files during that run; it does not certify every filesystem path or resolve the earlier incident. I did not rerun the fixture.

The completed `delivery-review-answer.txt` says `VERDICT: no_break_found` and `ADVERSARIAL_REVIEW_BLOCKING: no`, but expressly lists only the two production files as its examined set. Its statement that it examined all changed files does not cover this five-file candidate: the three changed test files are covered by Astra's static review above, not Mercury. Mercury's descriptions of inherited non-crashing logical concerns are not blanket endorsements of those behaviors; this GO rests on the bounded candidate diff and requested authority removal.

Final scoped verdict remains **GO**, with root's reported native fixture PASS, inspected isolation receipt, Mercury's two-runtime-file review, and Astra's five-file static review recorded separately. Legacy Jest was not run by Astra; full pipeline/live acceptance remains unclaimed.
