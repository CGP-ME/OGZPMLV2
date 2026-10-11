# Paper session handoff rehearsal

Built at Trey's request on 2026-10-11 to prove outgoing positions close and ledger/state persist before switching between Kraken crypto and Alpaca stocks. This is a repeatable isolated rehearsal of the existing production implementation; no production behavior was changed.

Run from the repository with installed dependencies:

```sh
node scripts/session-handoff-rehearsal/run.js HEAD
node scripts/session-handoff-rehearsal/run.js working
```

Each invocation creates a unique `runs/` directory, exports the selected tracked source, records original source hashes, redirects mutable paths, and runs with explicit fixture credentials. It prints the output location and returns nonzero on failure. `HEAD` means the current commit; `working` includes tracked uncommitted source. Generated copies and raw logs stay local.

## What passed

- Real SessionRouter/MarketCalendar schedules both handoffs, using actual OrderExecutor, StateManager, DecisionLedgerLogger, OrderRouter registration, UnifiedPatternMemory and transition persistence.
- A paper BTC long closes during wind-down before transfer to stocks. A paper TSLA short closes before transfer back to crypto.
- Before each transfer and again before resuming, assertions check zero active positions, completed ledger rows, independently reconciled P&L/equity, and saved state. Destination scope checks cover broker, account identity, symbol, asset class, paper mode and timeframe.
- Fresh StateManager instances restore completed state and P&L. Closed trade history remains in the ledger; it is not erased.
- Two genuine partial executions reduce a third position without flattening it. The residual and partial ledger survive reload; the router remains in crypto, paused and blocking new entries. No completed ledger row is fabricated for that position.
- Both committed and working sources pass; no broker order method is called. The working export matches all 159 source/config hashes captured for the earlier runtime activation.

## Evidence and limits

`committed-result.json` and `working-result.json` summarize the final runs against base `6de3673e19a0a2f986f9e52de1b4c5b6b4f416b2`. `review.json` records Astra's scoped adversarial review and hashes. The code lives in `scripts/session-handoff-rehearsal/` at Trey's direction so Mercury can review it; output stays in this inbox. `mercury-source-receipt.json` qualifies the source captured for that review. Mercury read all three files and reported no script defect, but returned `cannot_verify` because its per-target review records were incomplete and it cited unrelated repository findings. Its answer is preserved verbatim; this is not a clean Mercury verdict. `mercury-adjudication.json` records the separate Astra disposition.

Strategy decisions/contracts and external broker snapshots are controlled fixture inputs. Optional telemetry/notification hooks are stubbed. The runner scope boundary is injected; this does not bootstrap the entire runner, execute real broker fills, test broker connectivity, or prove recovery from disk failure or a crash at every transition boundary. Fixture filesystem/network controls are not an OS sandbox. No production restart, trading resume, state/config write, or broker order was performed for this task.
