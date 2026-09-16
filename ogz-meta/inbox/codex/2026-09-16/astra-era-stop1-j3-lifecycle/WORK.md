# STOP 1 J3 work

## Producer-to-consumer trace

- J1 installed configuration-independent bootstrap fatal reporting at the top of `run-empire-v2.js`.
- J2 made the owner record exclusive, but `SingletonLock` still installed its own process listeners after acquisition and exited from its integrity monitor.
- `main()` later installed a second set of SIGINT/SIGTERM/fatal listeners.
- `OGZPrimeV14Bot.shutdown()` performed some service cleanup and pattern persistence, then called `process.exit()` without explicit state, journal, snapshot, broker-adapter, or lock completion.
- `BacktestRunner` bypassed that method with direct process exits.

## Implementation

- `SingletonLock` now owns lock mechanics only. Acquisition returns `false` with a named reason. Integrity failure invokes the injected runner callback once. Process listener and exit counts are zero.
- The runner retains bootstrap reporting for pre-construction failures, then replaces only its bootstrap fatal listeners after a bot exists. Instrumentation listeners remain installed.
- The runner owns SIGINT, SIGTERM, uncaught-exception, pre-runtime failure, singleton failure, startup failure, backtest completion, and backtest failure terminal routing. Pre-runtime cleanup releases only a singleton record that the process actually owns.
- Shutdown is single-flight. A later failure request upgrades an in-progress normal shutdown to nonzero terminal status.
- Cleanup order is: stop producers; disconnect market-data services; close dashboard service; stop strategy services; save state; save patterns; destroy journal; release singleton; exit.
- Each cleanup outcome is awaited. One cleanup failure produces the existing local fatal receipt, later cleanup still runs, and the final status is nonzero.

## Deliberate boundary

J3 does not decide which components are required, whether incomplete initialization may continue, or how readiness recovers; J4 owns those decisions. J3 routes the existing terminal outcomes through one owner. It does not add financial authority or flatten positions.

The direct probe executes source-exact function and class-method slices from the current runner with fake services, because importing the full entrypoint would perform application initialization. It separately loads the real `SingletonLock` and reruns J2's real multiprocess contention probe.

## Footer

WHAT I DID: removed competing lifecycle owners, connected terminal producers to the runner, completed orderly cleanup ownership, and produced direct local receipts.

WHAT I DID NOT DO: boot the bot, run Jest, touch PM2, call a provider/broker/notifier/network service, trade, flatten, or change readiness/configuration policy.

WHAT I ASSUMED: runtime unhandled rejection retains the later runner handler's explicit report-and-continue disposition. J4 remains responsible for classifying component/init failures; this package does not promote a rejection into trading or shutdown authority.
