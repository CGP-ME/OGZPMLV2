# Inherited Doctrine Violations and Debt

These findings were present at predecessor `f378184761dcb46daa9fce3973c8c837065da150`; they were not introduced or broadened by Part B and remain unfixed because they are outside the authorized behavior change.

## `core/AuthFailureGuard.js`

- Its existing ConfigLoader and input validation uses direct throws. Under the current Fourth Shape doctrine, those pre-existing throws require producer enumeration and producer repair before reconsideration.
- Existing failure logging serializes up to 200 characters of the caller detail object. Current callers supply classifier evidence, but this is a broader logging surface than Part B's persistence/flatten mandate and was not redesigned here.
- The sliding failure counter remains wall-clock/in-memory. Quarantine state persists, but threshold progress does not survive restart; this limitation was already documented in the file.

## `core/OrderExecutor.js`

- The existing entry path contains direct invariant throws for missing immutable scope and inconsistent backtest mode near the inserted choke. Those throws predate Part B and remain Fourth Shape debt.
- `OrderExecutor.js` is a very large multi-responsibility execution owner. Part B added only the ruled single broker-quarantine check and did not refactor this structural debt.

## `run-empire-v2.js`

- The constructor emits many emoji/malformed production log lines and exercises numerous ConfigLoader compatibility fallbacks. The wired construction probe observed both. Part B's new wiring lines contain no emojis and do not alter those inherited surfaces.
- The nearby trading-pair producer uses a pre-existing inline throw and carries inconsistent indentation. Both predate Part B and are outside wiring-only authority.

## `test/auth-failure-guard.test.js`

- The existing test helper directly deletes the repository-root `killswitch.flag` before/after tests. Part B retained this legacy assertion mechanism to prove the guard does not kill, but isolated all new broker quarantine flags in temporary directories. Migrating the legacy KillSwitch test fixture is outside this mission.

## Packet files

- No inherited violation can exist in the five new packet files. Any defect in them is authored Part B work and must be corrected before commit rather than classified as inherited.
- Repository-wide `npm run scan:secrets` remains nonzero on 15 paths outside Part B's authored packet: seven `apiKeySource` metadata false positives in `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/EVIDENCE.md` and eight existing fixtures across `test/mercury-consensus.test.js`, `test/mercury-llm-config-contract.test.js`, `test/mercury-provider-preflight.test.js`, and `test/mercury-run-ledger.test.js`. The Part B packet itself was removed from the finding list before commit.
