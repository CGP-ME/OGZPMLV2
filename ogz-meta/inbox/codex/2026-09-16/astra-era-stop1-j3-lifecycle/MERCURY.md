# STOP 1 J3 Mercury attack record

## Invocation

From the repository root, before commit:

```text
node trai_brain/mercury-bridge/ask.js "Mercury, break my fix." --max-tokens=7750 --max-iterations=60
```

The bridge reported a 60-iteration allowance and returned an answer on iteration
25. Mercury used `mercury-2`; Kimi used `kimi-k3`; the Fable seat was unavailable
because its Claude credentials were absent. The run was therefore reported by the
bridge as `UNVERIFIED`, not promoted to a multi-reviewer pass. The index was also
stale at `367a04b7`, while the bridge's current-change scan identified the three
changed production files from the working tree.

## Finding and source disposition

Mercury claimed that the backtest path calls `shutdown()` without terminating and
then falls through into live-service initialization. That finding is disproved by
the complete source path:

- `shutdown()` starts and returns `_performShutdown()` at
  `run-empire-v2.js:3608-3615`.
- `_performShutdown()` completes the ordered cleanup and calls
  `process.exit(finalExitCode)` at `run-empire-v2.js:3618-3714`.
- the live/paper initialization is not code after the backtest block; it is inside
  the `else` paired with `if (this.config.enableBacktestMode)` at
  `run-empire-v2.js:1943-2012`.
- `BacktestRunner` awaits that terminating shutdown at
  `core/BacktestRunner.js:547` and routes its failure path through the same owner at
  `core/BacktestRunner.js:552`.

No source change was made for this finding. Adding another return, exit, guard, or
backtest-only lifecycle owner would duplicate behavior already established by the
runner-owned shutdown path.

## Limits preserved

The run executed no check artifact, had one malformed search-tool call, did not
read every changed file in full, and could not run the Fable reviewer seat. It is
evidence that the required unsteered adversarial attempt occurred, not independent
proof of J3 correctness. J3's direct offline lifecycle receipt remains the proof
for shutdown ownership, ordering, continuation after cleanup failure, final exit
disposition, and refreshed singleton exclusivity.
