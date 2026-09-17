# STOP 1 J3 evidence

## Reproduction

From the repository root:

```bash
node ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j3-lifecycle/probe-j3-lifecycle.js /tmp/j3-lifecycle-recheck.json
```

The committed `PROBE-RECEIPT.json` is produced by the same command with its output path changed to that packet file. Repeated OS-signal children require ordinary process signal permission; the probe performs no network operation. It hashes every changed production owner, the refreshed J2 probe, and the J3 probe.

## Direct receipt

The probe parses the current owners with Acorn and executes exact current methods without importing or starting the full application. It loads the real `SingletonLock` for acquisition/integrity/release, delivers repeated real SIGINT/SIGTERM signals to isolated child processes, executes the actual runner backtest dispatcher and lifecycle methods, executes each changed service teardown method against controlled pending work, and runs the J2 multiprocess ownership probe.

- `SingletonLock` adds zero process listeners and contains zero process-exit calls.
- A lock read/parse failure reaches only the evidence callback and retains ownership state. Removing its live owner record invokes the injected terminal owner exactly once; the lock class does not terminate the process.
- Runtime handler installation removes the two bootstrap fatal listeners while preserving pre-existing instrumentation listeners.
- SIGINT/SIGTERM belong to the runner. A repeated same signal during pending cleanup does not restore default signal termination. Uncaught exception requests code `1`. Runtime unhandled rejection records evidence without requesting shutdown.
- Pre-runtime termination releases the singleton before exit when this process owns it and does not attempt to remove another owner's record.
- Two concurrent shutdown calls return the same promise. A later code-`1` request upgrades an in-progress code-`0` shutdown.
- The actual candle-analysis and exit-monitor dispatches enter the tracked operation set; a controlled pending operation proves that settlement completes before persistence. Failure of one broker teardown does not skip the other broker, persistence, or lock cleanup.
- SessionRouter waits for active work; PipelineSnapshot cancels initial/repeating capture; dashboard and resilient sockets await close; Kraken awaits pending REST work and socket close; its wrapper delegates even without a current socket; Alpaca awaits both streams.
- State, pattern, journal, and singleton cleanup occur in order; BacktestRunner has no duplicate pattern-cleanup owner, pattern/journal failures propagate, all journals are attempted, and the singleton releases once before exit.
- A simulated state-save failure is reported, pattern/journal/lock cleanup still completes, and terminal status is `1`.
- `BacktestRunner` has zero process-exit calls. Its success/failure result reaches the actual runner dispatcher, which owns shutdown `0`/`1` and preserves the failure reason.
- Intentional backtest lock skipping exits `0` during normal shutdown while a foreign lock record remains byte-for-byte unchanged.
- The nested J2 probe re-runs eight fresh and eight stale six-process contention rounds. Every round retains exactly one owner and five refusals.

These receipts prove the exercised local lifecycle functions and lock behavior. They do not claim PM2-loaded code, real provider transport, or a successful/failed application boot. Those require separately authorized runtime activation; no source dependency needed for J3 is deferred to that acceptance step.

## Mechanical receipt

- `node --check` passes for all changed JavaScript files and both probes.
- `bash -n start-ogzprime.sh` remains clean from J2.
- Focused `git diff --check` passes.
- No Jest, bot entrypoint, provider, broker, notification, network, PM2, or trading operation is used by the direct probe. Mercury is recorded separately and is not direct proof.
