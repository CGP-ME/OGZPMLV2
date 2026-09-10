# Work

Executor: Codex on `codex/multi-asset-symbol-state`.

The containing atomic commit is the implementation/packet cross-reference.

## Work performed

- Added an optional `exitCode = 0` parameter to `OGZPrimeV14Bot.shutdown()`.
- Routed the `start()` failure catch through `shutdown(1)` so cleanup still completes before a non-zero exit.
- Forwarded the selected code to `process.exit(exitCode)`.
- Left both operator signal handlers as no-argument `shutdown()` calls, preserving their default exit code 0.
- Added focused tests for startup-failure routing, explicit shutdown code forwarding, and no-argument operator-signal behavior.

## Implementation and test files

1. `run-empire-v2.js`
2. `test/startup-exit-code.test.js` (new)

## Packet files

1. `MANIFEST.md`
2. `MISSION.md`
3. `WORK.md`
4. `EVIDENCE.md`
5. `REVIEW.md`
6. `INHERITED.md`

## Footer

**WHAT I DID:** completed the L6 full-file read, changed only startup/shutdown exit-code routing, added focused process-isolated tests, preserved unrelated dirty/untracked work, and prepared the Ruling 7 packet.

**WHAT I DID NOT DO:** start L7 or any later item; change SessionRouter hold, TrAI degraded handling, SingletonLock, fatal handlers, configuration, PM2, shared lock/state, brokers, or the running process; run a live/full bot boot; fix an unrelated stale runner assertion.

**WHAT I ASSUMED:** the one-or-two-file limit applies to implementation/test files, with required packet files additional; the containing atomic commit is the packet's self-reference; the focused method-level process-exit tests are the allowed pre-land acceptance evidence, while an isolated full boot and second-seat cold-pull remain separate post-land receipts.
