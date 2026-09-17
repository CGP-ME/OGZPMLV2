# STOP 1 J3 correction work

## Direct corrections

- `BacktestRunner` returns `{success, exitCode}`; the runner dispatcher owns shutdown and preserves the error.
- SIGINT/SIGTERM listeners remain installed and reuse the existing shutdown promise.
- singleton monitor read/parse errors report through a separate evidence callback with no shutdown authority.
- singleton ownership state distinguishes owned, skipped, refused, lost, and released without changing J2 exclusivity.
- runner startup, candle analysis, exit monitoring, liveness recovery, and backtest work participate in the runner's pending-operation set.
- SessionRouter stops its interval, detaches its OHLC callback, and awaits activation/transition work already dispatched.
- PipelineSnapshot and WebSocketManager retain and cancel the timers they own.
- resilient, Alpaca, and Kraken transport owners await their real close events; Kraken also settles its already-owned private request queue before close.
- pattern and journal persistence return their existing write outcomes through cleanup; BacktestRunner no longer performs a duplicate pattern save before the runner's final persistence pass.
- shutdown attempts every broker, strategy, persistence, and lock owner independently and releases the singleton last.

## Architecture check

No generic request refusal or runtime-operation refusal remains in the diff. No new trading permission, pause, halt, entry block, flatten action, retry threshold, timeout policy, or supervisor was added. Shutdown is implemented by stopping the producer owners and awaiting the work they already own.
