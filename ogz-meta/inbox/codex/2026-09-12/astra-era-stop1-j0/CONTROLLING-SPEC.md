# STOP 1 ASTRA-ERA CONTROLLING SPECIFICATION

Status: J0 draft pending Trey's four rulings in `RULINGS-REQUIRED.md`.

Branch: `astra-era`

Current source revision: `6ca25ae80cfcef12eec79e64c7d14162d9d4c751`

Historical comparison revision: `e54a8b8dc40c4a5bf52984b823d1438c4de39f62`

## 1. Control and supersession

This document replaces the following files as executable instructions:

- `ogz-meta/inbox/fable/2026-09-10/STOP1-BOUNDARY-MISSION-v4-2026-09-10.md`
- `ogz-meta/inbox/fable/2026-09-10/LAND-NOW-2026-09-10.md`

Those files remain historical evidence. Their rulings, checkmarks, sequencing, file limits, and acceptance claims do not authorize implementation unless reconciled here to Trey's words and current source.

The independent audit is preserved at `ogz-meta/inbox/astra/STOP1-EVIDENCE-6ca25ae8.zip`, SHA-256 `79852f809c4643ddde7fd5a4d0aee85aa198ff7d7e79dae66b35c6224d25905e`. It is evidence, not authority.

## 2. STOP 1 outcome

STOP 1 establishes one truthful configuration and initialization authority for the running bot. Completion requires all of the following:

1. Customer-editable behavior has one durable owner and one runtime projection.
2. Static internals have one owner and cannot override customer behavior.
3. Credentials have one bootstrap producer and are supplied only to the services that consume them.
4. Execution mode governs every order, cancellation, flatten, webhook, cutoff, and recovery mutation boundary.
5. Configuration receipts describe the values consumers actually use, including type, unit, source, revision, and meaningful zero, false, null, empty-string, empty-array, and empty-object semantics.
6. An open trade retains the complete operative exit policy accepted at entry. A later global setting cannot change it.
7. A one-trade operator edit is identified, validated, persisted, applied to that trade's operative policy, and acknowledged without changing global settings or another trade.
8. Required initialization is reported truthfully. A missing component is neither fabricated into readiness nor converted automatically into whole-process death.
9. Operator shutdown, runtime producer failure, incomplete trading initialization, entry permission, exit availability, and process survival remain distinct states.
10. Switching uses one schedule owner and carries broker, account, mode, session generation, asset, symbol, and timeframe identity end to end.
11. Recovery proves the original condition repaired before clearing exactly that condition. It cannot clear unrelated pauses or halts.
12. The singleton lock is truly exclusive and has one shutdown/release owner.
13. Notifications, publication, and acceptance receipts report outcomes rather than attempts.

Moving values between files without closing every old producer and live reader does not satisfy STOP 1.

## 3. Required architecture

### 3.1 Configuration ownership

- Customer behavior owner: `config/settings.json` or the final ruled equivalent.
- Static implementation owner: `config/internals.json` or the final ruled equivalent.
- Bootstrap credential owner: one loader whose output reaches every intended service.
- Runtime read owner: one accepted ConfigLoader revision. `get()`, section getters, exit-contract getters, timeframe getters, aliases, constructors, and snapshots must project that revision rather than fall through to competing `BASE_CONFIG`, JSON, environment, preset, or constructor policy.
- Mutation owner: one durable settings writer. A UI acknowledgement is emitted only after validation, persistence, revision creation, and consumer adoption succeed.
- Receipt owner: the accepted revision includes a recursive canonical hash over non-secret operative values. Nested values must affect the hash.

Obsolete environment variables are migration inputs to remove from producers and consumers. Their presence is not authority for a new whole-process refusal.

### 3.2 Execution identity

One resolved execution identity carries at least mode, broker, account, execution venue, asset class, symbol, and session generation.

That identity must reach:

- normal entries and exits;
- webhook emissions;
- broker-router orders;
- TTP cutoff cancellation and orphan recovery;
- exit-desynchronization recovery;
- forced flattening that Trey separately authorizes;
- state and financial receipts.

Paper mode is decided before route selection. A feature flag, dry-run flag, webhook toggle, adapter-specific mode, or recovery path cannot override it.

### 3.3 Initialization and process lifecycle

Module enumeration remains truthful. The runner cannot continue by substituting `undefined` for a component it unconditionally constructs or uses.

Initialization reports each component's actual state. Operational services that can run safely continue. Trading does not begin until its required producers and consumers exist. This is an initialization contract, not a new global safety gate.

The runner owns orderly SIGINT/SIGTERM shutdown. It awaits state, pattern, journal, service, and lock cleanup before terminating. SingletonLock does not independently call immediate `process.exit()` for the same signals.

Runtime producer failures are repaired and reported at their owner. They do not acquire blanket authority to stop every healthy component.

### 3.4 Trade policy, fees, and sizing

PolicyBuilder binds every live post-entry input actually used by exit evaluation. Direct and indirect global fee, trail, break-even, maximum-hold, and contract fallbacks cannot mutate an existing trade.

Fee policy follows the actual execution venue and account. Commission, regulatory charges, and simulated slippage remain separate values. An Alpaca commission ruling does not silently erase slippage.

Sizing has one final quantity producer. Normal allocation, earned boost, aggregate account exposure, current positions, pending allocations, confidence, confluence, minimum shares, maximum shares, notional limits, and venue rounding are resolved in that calculation. A later quantity adjustment cannot exceed a cap already reported as applied.

### 3.5 Switching, state, and recovery

SessionRouter owns the configured switching schedule and transition lifecycle. Broker adapters own truthful connection, subscription, account, and acquisition results. StateManager owns scoped durable state.

Transition pause and resume affect only transition-owned state. Completion cannot clear an operator, daily-loss, financial-integrity ambiguity, or unrelated producer pause.

Startup restoration of an existing same-identity trade is different from flattening a source broker before a scheduled switch. Neither may be inferred from the other.

The loss cooldown is removed with its producers, readers, configuration, normalization, and persisted state. Unrelated halt records remain.

Each halt recovery compares the current durable record with the record and condition it proved repaired before deletion.

STOP 1 owns the configured identities used by candle acquisition. STOP 2 owns broker-native candle acquisition, admission, correction, replay, and removal of watchdog trading authority. Full switching activation cannot be accepted until the joined identity-to-admitted-candle path is proved.

## 4. Current landed state

The `e54a8b8..6ca25ae8` interval contains 18 commits. The large product configuration migration has not landed.

### 4.1 Product runtime commits

- `3412c5c0` / L1: retain the phantom-module removal, truthful required list, and named validation results. The boot-refusal behavior is not accepted. The proposed L1b catch-and-continue is also not accepted because the runner unconditionally constructs `RiskManager`.
- `124efac4` / L6: retain the explicit shutdown exit-code parameter and `start()` requesting code 1 on terminal startup failure. This does not prove correct failure classification or shutdown because SingletonLock and bootstrap handlers still own competing immediate exits.

### 4.2 Shared runtime/tooling commits

Bridge and direct-question commits remain separate tooling work. Changes to `core/persistent_llm_client.js` require explicit TrAI regression evidence because TrAI imports that client, even where the ordinary text-return path is unchanged.

No provider, TrAI, bot, PM2, broker, trade, or phone result is treated as proved from those commits.

## 5. Source-proven defects controlling execution

The following current defects are implementation prerequisites, not optional improvements:

1. Paper mode can select a non-dry webhook route before the paper simulation branch.
2. TTP cutoff and orphan recovery can cancel or send through a separate permission path not governed by the resolved bot mode.
3. `ALPACA_MODE` and the main bot mode can select different execution environments.
4. Required-module catch-and-continue can reach an unconditional missing constructor.
5. SingletonLock registers immediate exit handlers before the runner's orderly shutdown handlers.
6. Singleton acquisition uses existence-check plus atomic replacement, not exclusive creation.
7. Configuration has multiple read surfaces and fallback owners.
8. The current fingerprint can omit nested values.
9. The proposed notifier dotenv deletion removes a credential producer without replacing its consumers' source on bare Node launch.
10. The proposed 5/7.5/25 field assignment does not implement those meanings.
11. Stock minimum-share adjustment can enlarge quantity after the dollar cap.
12. The configured SessionRouter schedule is validated but not consumed by the transition owner.
13. Crypto activation subscribes only the first configured crypto symbol.
14. Failed SessionRouter startup has no proved recovery to normal evaluation.
15. Transition completion can globally resume an unrelated pause.
16. Halt reset deletes by symbol without verifying it is still clearing the record whose condition was repaired.
17. Cooldown has live producers and durable restoration; removing only settings does not remove it.
18. Exit-policy freeze misses direct and indirect global readers.
19. The existing one-trade UI command has no proved bot handler; the candidate state mutation rejects policy changes and does not persist independently.
20. Fee selection can follow market-data identity instead of execution venue.
21. Publisher-off at scheduling alone does not cover pending and shutdown writes.
22. Early initialization failures occur before the existing notifier is installed.
23. Pattern-memory first creation can capture environment/default identity before later injection.
24. Initial SessionRouter activation rejects broker positions without reconciling valid restored same-identity trades.
25. Current bridge evidence checks can still grade formatting or promote agreement with only one claiming seat.
26. Direct-question failure after successful tool reads can lose the earlier tool receipts.

Each implementation packet must re-read and cite the complete producer-to-consumer path at the then-current revision. This list is not permission to apply the audit's proposed replacement blindly.

## 6. Corrected dependency order

Each numbered work package is one logical behavior. A logical change may cross several files when producer and consumers must move atomically. Artificial one-file or non-overlapping-line limits do not outrank correctness.

1. J0: reconcile authority, record four rulings, complete the affected-leaf baseline, and publish one executable specification.
2. J1: establish one credential producer and early failure-reporting path.
3. J2: make the existing singleton identity exclusively acquirable.
4. J3: establish one operator-shutdown and failure lifecycle.
5. J4: reconcile required-component acquisition, initialization, recovery, and trading readiness.
6. J5: carry one execution mode through every order, cancellation, webhook, cutoff, flatten, and recovery producer.
7. J6: bind the complete operative exit policy before any hot mutation is enabled.
8. J7/J8 atomic deployment boundary: cut configuration to one revision while moving pattern-bank first-creation identity and every affected consumer with it.
9. J9: implement durable accepted settings revisions and the actual UI update path.
10. J10: implement the identified, operative, durable one-trade edit.
11. J11a: bind fee policy to execution venue/account and preserve slippage separately.
12. J11b: implement final allocation and quantity after Trey resolves its denominator and boost qualification.
13. J12: remove cooldown and migrate only cooldown state.
14. J13a: implement condition-specific halt recovery with record identity.
15. J13b: complete schedule consumption, transition identity, startup restoration, scoped pause/retry, and full intended watchlists.
16. J14: implement the ruled warning and daily-entry-pause contract after Trey resolves its accounting boundary.
17. J15: disable publisher writes at their owner and implement truthful notification outcomes.
18. J16: remove dead circuit-breaker policy and boot cosmetics as cleanup, without claiming runtime fault repair.
19. J17: repair bridge claim/evidence accounting and direct-question failure receipts as separate tooling work.
20. J18: run the joined STOP 1/STOP 2 identity-to-native-candle acceptance after STOP 2 acquisition repair exists.

No package begins until its dependencies are satisfied and its complete-read boundary, test, runtime proof, restart requirement, and rollback boundary are recorded.

## 7. Proof law

Proof is proportional to the changed boundary:

- Source receipt: exact revision, producer, caller, consumer, type, unit, and destination.
- Focused regression: preserves the source contract but does not prove deployment.
- Boot receipt: exact SHA, entrypoint, working directory, PID/start time, mode, broker/account scope, non-secret effective child environment, required-component results, and first operational state.
- PM2 receipt: proves the manager loaded the intended revision and environment; command spelling alone is not proof.
- State receipt: proves persistence, restart restoration, and rollback compatibility.
- Broker receipt: distinguishes request, broker response, acknowledgement, fill, reconciliation, and actual flatness.
- Notification receipt: distinguishes trace, enqueue, send attempt, service acceptance, failure, and watched phone delivery.
- Settings receipt: proves accepted durable revision and actual consumer adoption.

A green test, open socket, emitted trace, queued notification, HTTP success, populated cache, or process surviving 120 seconds cannot stand in for the required outcome.

PM2 is not restarted without Trey's explicit approval for that exact runtime step.

## 8. Commit and review law

- One logical behavior per commit.
- Show the exact diff before commit.
- Commit and push are paired once approved.
- Trading-path changes receive focused tests and a Mercury adversarial attack before commit.
- After push, Mercury repo context is not claimed fresh until the indexer succeeds for the pushed revision.
- A cold pull checks the committed diff and evidence; it does not replace runtime acceptance.
- Existing unrelated dirty and untracked work is preserved.
- No production implementation begins while a ruling in `RULINGS-REQUIRED.md` changes that package's behavior.

## 9. Closure refusal

STOP 1 remains open while any affected leaf lacks an owner or consumer-effective receipt; any behavioral environment, BASE, JSON, alias, preset, or constructor fallback remains an independent authority; paper can reach a live mutation path; hot settings can change an old trade; sizing or fees use the wrong identity; required initialization is fabricated or terminates recoverable services; shutdown has competing exit owners; singleton acquisition is nonexclusive; recovery clears unrelated state; cooldown can return after restart; switching identity exceeds actual acquisition; publisher or notification claims exceed outcomes; or runtime revision, state, account, broker, mode, rollback, and consumer receipts are missing.

## 10. Footer

WHAT I DID: validated and read Astra's complete audit; checked its item ledger and citation-validation artifact; directly inspected the highest-impact current source paths; replaced the historical execution sequence with this J0 draft.

WHAT I DID NOT DO: modify production code or configuration; read or expose `.env`; run tests; operate PM2; call a model, broker, webhook, or notifier; claim runtime acceptance.

WHAT I ASSUMED: the current pushed `astra-era` revision remains `6ca25ae80cfcef12eec79e64c7d14162d9d4c751`; Trey's next rulings supersede conflicting historical attributions and will be recorded before affected implementation.
