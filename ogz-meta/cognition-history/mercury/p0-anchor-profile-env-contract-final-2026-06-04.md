Find a practical state where this P0 anchor fix still lies about the canonical backtest target, silently inherits the wrong trading env, or lets a later P0 run overwrite/misrepresent the proof.

Scope:

- `ogz-meta/anchor-runner.js:56-67`
- `ogz-meta/anchor-runner.js:84-118`
- `ogz-meta/anchor-runner.js:128-150`
- `tools/backtest-worker-env.js:29-91`
- `tools/backtest-worker-env.js:100-205`
- `ogz-meta/gates/multi-runtime-gate-runner.js:12-17`
- `ogz-meta/gates/multi-runtime-gate-runner.js:329-345`
- `test/anchor-runner-env.test.js:1-64`

Attack requirements:

1. Try to construct parent `process.env` pollution that changes the P0 result while the gate still stamps `current-eval`.
2. Try to construct a config or instrument override that bypasses the explicit allowlists.
3. Try to find a report/log proof gap where the gate passes but the operator cannot later verify which env/profile produced the result.
4. Try to find a new failure mode introduced by using the shared worker env builder for P0.
5. Separate real bypasses from false positives with file:line evidence.

Do not give general advice. Give concrete exploit input/state or say no practical bypass found.
