# Results

The deterministic write pipeline verified and applied the credential authority
removal. The final source change is limited to:

* `StateManager` still records Alpaca key-prefix mismatch lanes, emits the
  diagnostic trace/log, and preserves affected active-trade evidence through
  `_brokerUnverifiableLaneForTrade`; it no longer adds `entryBlocking` or a
  credential-derived symbol halt.
* `StateManager.load()` explicitly removes only saved symbol holds whose code
  exactly equals `broker_unverifiable`, and removes only that integrity record's
  persisted `entryBlocking` field. Other holds remain unchanged.
* The broker-verification entry-block API and its sole OrderExecutor consumer
  are removed. Auth-failure behavior is not changed.
* Named tests have only obsolete credential API mocks/assertions removed or
  revised. The StateManager test now also checks that an independent
  `exit_monitor_reconciliation_required` hold survives migration.

Focused proof passed:

* `node fixtures/state-migration.cjs` with a disposable Module ConfigLoader
  facade. It proved a PK/live restored lane remains active evidence, produces
  preserved-evidence records, removes the legacy credential hold and entry
  flag, and retains an independent exit-receipt hold. Output:
  `fixtures/state-migration.log`.
* Syntax checks passed for both production files and all three named tests.
* Static check found no remaining `getBrokerVerificationEntryBlock` or
  `brokerVerificationBlock` consumer in production source.
* `git diff --check` passed.

The combined three-file Jest run and the focused StateManager Jest run were unsafe: the legacy test setup relied on retired environment variables for its state-file path. The real paper-state file was written, later showing balance 7500 and no saved pause; the malformed decision log also contains a test record in that time window. No pre-test state snapshot was captured. These are verification failures, not merely unrelated test failures. Root preserved available evidence and disclosed the incident. Recovery remains OPEN; see ../verification-state-incident/INCIDENT.md. Later isolated fixtures do not undo these writes.

Coordination note: the initial pipeline application included stale broker-read
test blocks, then those two blocks were restored byte-for-byte from
`before-index/` and removed from this packet's final `edits.json` because the
`remove_generic_rail` lane owns them. The credential test removal remains this
packet's sole OrderExecutor test change.

No service, broker, network, PM2, backtest, commit, or Mercury run occurred.
Root owns review and delivery.
