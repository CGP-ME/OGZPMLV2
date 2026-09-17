# STOP 1 J3 — one runner-owned lifecycle

J0 assigns J3 one behavior: the runner owns orderly operator shutdown and terminal runtime failure. It must await state, pattern, journal, service, and lock cleanup before terminating. `SingletonLock` must not independently install signal/fatal listeners or call `process.exit()`.

## Source-proven defects

At the base SHA:

1. Bootstrap fatal listeners exited immediately.
2. `SingletonLock.acquireLock()` installed separate exit, SIGINT, SIGTERM, SIGQUIT, uncaught-exception, and unhandled-rejection owners.
3. The later runner handlers competed with those earlier owners, so the first immediate exit could bypass asynchronous cleanup.
4. Missing or replaced lock ownership exited from `SingletonLock` instead of reporting to the runner. Lock read/parse errors were nonterminal log-only events at the base and must remain nonterminal.
5. `BacktestRunner` exited directly on both success and failure.
6. Runner shutdown did not explicitly persist state, stop the journal/snapshot owners, disconnect broker adapters, or release the singleton before exit.

## Implemented contract

- Bootstrap fatal reporting remains available before construction. Once the bot exists, those terminating listeners are removed and the runner installs the runtime lifecycle.
- SIGINT and SIGTERM request orderly exit code `0` through one shutdown promise.
- An uncaught exception is reported and requests orderly exit code `1` through that same promise.
- The runner's existing runtime unhandled-rejection disposition remains report-and-continue. It no longer gets preempted by bootstrap or singleton termination.
- Singleton acquisition failure terminates through the runner without touching another owner's record. A pre-runtime fatal failure releases this process's lock before exit when it owns one.
- Missing or replaced singleton ownership reports to the runner; the lock does not terminate independently. Lock read/parse errors report evidence without receiving shutdown authority.
- Backtest success/failure returns a structured result to the runner. The runner requests its one shutdown path with exit code `0`/`1`.
- Shutdown stops the real scheduling/callback producers, settles already-dispatched work, completes service teardown, persists state/pattern/journal data, releases the singleton last, and only then exits.
- Concurrent shutdown requests share one promise. Any nonzero terminal request is retained. Cleanup failure is reported, does not prevent later cleanup, and yields nonzero terminal status.
- Repeated SIGINT/SIGTERM keep the runner listener installed while cleanup is pending and reuse the same shutdown promise.
- Intentional backtest lock skipping is not misreported as a release failure and never touches another owner's record.

J3 adds no retry, timeout, supervisor, readiness decision, trading gate, pause, flatten, or configuration migration.
