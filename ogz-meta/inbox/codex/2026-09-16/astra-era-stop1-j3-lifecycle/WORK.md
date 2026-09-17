# STOP 1 J3 work

## Producer-to-consumer trace

- J1 installed configuration-independent bootstrap fatal reporting at the top of `run-empire-v2.js`.
- J2 made the owner record exclusive, but `SingletonLock` still installed its own process listeners after acquisition and exited from its integrity monitor.
- `main()` later installed a second set of SIGINT/SIGTERM/fatal listeners.
- `OGZPrimeV14Bot.shutdown()` performed some service cleanup and pattern persistence, then called `process.exit()` without explicit state, journal, snapshot, broker-adapter, or lock completion.
- `BacktestRunner` bypassed that method with direct process exits. The first J3 version then called a shutdown callback that the runner never supplied.

## Implementation

- `SingletonLock` now owns lock mechanics only. Acquisition returns `false` with a named reason. Missing/replaced ownership invokes the injected runner callback once. Read/parse monitoring errors use a separate evidence-only callback. Process listener and exit counts are zero.
- The runner retains bootstrap reporting for pre-construction failures, then replaces only its bootstrap fatal listeners after a bot exists. Instrumentation listeners remain installed.
- The runner owns SIGINT, SIGTERM, uncaught-exception, pre-runtime failure, singleton ownership loss, startup failure, backtest completion, and backtest failure terminal routing. Pre-runtime cleanup releases only a singleton record that the process actually owns.
- Shutdown is single-flight. A later failure request upgrades an in-progress normal shutdown to nonzero terminal status.
- Repeated OS signals retain their listeners and reuse the same in-progress cleanup instead of restoring default signal termination early.
- Backtest returns its structured success/failure to the runner; the runner owns terminal routing. There is no second backtest lifecycle owner.
- Cleanup order is: stop the existing SessionRouter/snapshot/timer/callback producers; settle tracked startup/analysis/exit/recovery work; complete broker/dashboard transport teardown; stop strategy services; save state; save patterns; destroy every journal; release singleton; exit.
- Each service and persistence owner reports its real completion result. One cleanup failure produces the existing local fatal receipt, every later owner is still attempted, and the final status is nonzero.
- SessionRouter waits for an activation/transition already in progress and detaches its OHLC callback. Broker/dashboard owners cancel their own reconnect/snapshot timers and await their own pending request/transport close work.
- Pattern and journal save failures propagate through their existing cleanup calls instead of being logged as success.
- Backtest's intentional singleton skip is a successful no-op at shutdown; a foreign owner record is preserved.

## Deliberate boundary

J3 does not decide which components are required, whether incomplete initialization may continue, or how readiness recovers; J4 owns those decisions. J3 routes the existing terminal outcomes through one owner. It does not add financial authority or flatten positions.

J3 adds no generic runtime/request refusal. An early correction draft briefly added two such guards; both were removed before commit. Shutdown is achieved by stopping the actual producer owners and settling the work they already dispatched.

The direct probe executes source-exact function and class-method slices from the current owners, because importing the full entrypoint would perform application initialization. It separately loads the real `SingletonLock`, delivers repeated real OS signals to child processes, and reruns J2's real multiprocess contention probe.

## Footer

WHAT I DID: removed competing lifecycle owners, connected terminal producers to the runner, repaired the actual caller/consumer wiring, completed owner-local teardown and persistence outcomes, and produced direct local receipts.

WHAT I DID NOT DO IN THE DIRECT PROBES: boot the bot, run Jest, touch PM2, call a provider/broker/notifier/network service, trade, flatten, or change readiness/configuration policy. Mercury is a separate adversarial provider invocation and is not represented as an offline probe.

WHAT I ASSUMED: runtime unhandled rejection retains the later runner handler's explicit report-and-continue disposition. J4 remains responsible for classifying component/init failures; this package does not promote a rejection into trading or shutdown authority.
