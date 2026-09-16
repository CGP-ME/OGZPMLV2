# STOP 1 J3 evidence

## Reproduction

From the repository root:

```bash
node ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j3-lifecycle/probe-j3-lifecycle.js /tmp/j3-lifecycle-recheck.json
```

The committed `PROBE-RECEIPT.json` is produced by the same command with its output path changed to that packet file. It hashes the three changed runtime files, the refreshed J2 probe, and the J3 probe.

## Direct receipt

The probe parses the current runner with Acorn and executes the exact current `shutdown()`, `_performShutdown()`, `installRuntimeLifecycleHandlers()`, and `requestRuntimeShutdown()` source slices. Fake services expose call order without importing or starting the full application. The probe also loads the real `SingletonLock` and invokes its real acquisition/integrity/release path.

- `SingletonLock` adds zero process listeners and contains zero process-exit calls.
- Removing its live owner record invokes the injected integrity-failure owner exactly once; the lock class does not terminate the process.
- Runtime handler installation removes the two bootstrap fatal listeners while preserving pre-existing instrumentation listeners.
- SIGINT/SIGTERM belong to the runner. Uncaught exception requests code `1`. Runtime unhandled rejection records evidence without requesting shutdown.
- Pre-runtime termination releases the singleton before exit when this process owns it and does not attempt to remove another owner's record.
- Two concurrent shutdown calls return the same promise. A later code-`1` request upgrades an in-progress code-`0` shutdown.
- Service disconnect promises finish before persistence. State, pattern, journal, and singleton cleanup occur in order; the singleton releases once and before exit.
- A simulated state-save failure is reported, pattern/journal/lock cleanup still completes, and terminal status is `1`.
- `BacktestRunner` has zero process-exit calls and routes success/failure through `ctx.shutdown(0/1)`.
- The nested J2 probe re-runs eight fresh and eight stale six-process contention rounds. Every round retains exactly one owner and five refusals.

These receipts prove the exercised local lifecycle functions and lock behavior. They do not prove PM2-loaded code, a deployed signal, actual broker disconnect, or a successful/failed production boot.

## Mechanical receipt

- `node --check` passes for all changed JavaScript files and both probes.
- `bash -n start-ogzprime.sh` remains clean from J2.
- Focused `git diff --check` passes.
- No Jest, bot entrypoint, provider, broker, notification, network, PM2, or trading operation is used.
