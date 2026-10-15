# Generic drawdown rail removal verification

Candidate: `3e6ef49e1d8b45bd0b783d98cc082af4fa4352d0`. Initial production candidate: `a08686f008404b78b9cda9a5569c9976be2dbaad`.
Base: `b75734e77139336db7c8b6f93f76d43a3285df4c`.

The pinned fixture compiles the exact ConfigLoader, RiskManager, PnLTracker and DrawdownTracker from Git. Its filesystem adapter permits only the two canonical configuration reads from that tree and synthetic fixture credentials held in memory. It rejects other dependency/file reads. It extracts only the actual TradingLoop decision method by AST; it never imports TradingLoop or StateManager.

Passed: paper/production profiles load without the retired rail keys or provenance; all seven profile risk blocks lack those keys; prop-firm configuration is unchanged; own-fill losses remain reportable without a rail latch; reconciliation alerts still occur; BUY and SELL_SHORT decisions remain executable after a 3% own-fill loss; malformed confidence still produces the existing entry refusal. No broker calls or proof publication occurred.

Fixture setup errors corrected before the successful run: initial no-credential snapshot failed existing required-credential validation; a mistaken getState test call was corrected to the actual getRiskSummary API. These were test setup failures, not claimed production failures or passing runs.

Not proven: full trading pipeline, real broker equity accounting, full automated test suite, runtime activation, or the new 50% daily account-loss rule. Existing tests were reconciled: retired API/module tests and their stubs were removed; provenance assertions now use existing reporter fields or assert the retired fields are absent. The posture gate no longer requires the retired generic rail; every other prerequisite, including prop-firm rules, is unchanged. No new Jest tests were added, and the full Jest suite was not executed. Unrelated staged reconciliation changes in RiskManager/PnLTracker are excluded from this candidate.

## Verification isolation incident

An earlier helper-agent probe imported the working-tree TradingLoop directly. Its dependency graph loaded the real StateManager singleton and logged both `State loaded from disk` and `State saved to disk`. No pre-probe snapshot was captured, so the exact state delta cannot be proven. This was an agent verification mistake, not an isolated fixture run.

Subsequent read-only inspection identified `data/state-paper.json`, mtime `2026-10-15T15:11:13.880Z`: zero active trades, balance 10000, realized PnL -0.9243468060356577, pause reason `SessionRouter: transitioning to stocks`, null pause source, and no isTrading field. These are post-probe observations, not proof that the file was unchanged or that they match the live process's in-memory state.

PM2 inspection showed bot PID 2943769, restart count 0, process start 1792037912347. No restart or resume command was issued. The user was informed explicitly. Further direct singleton imports were stopped; no guessed state restoration or evidence deletion was attempted. The replacement pinned fixture described above performs no real state read/write.
