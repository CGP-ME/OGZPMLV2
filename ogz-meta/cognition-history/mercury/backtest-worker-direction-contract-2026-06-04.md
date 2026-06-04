Attack this worker-direction fix. Do not confirm it. Break it.

Changed files and ranges:

- tools/backtest-worker-env.js:62-71
- tools/backtest-worker-env.js:181-199
- tools/backtest-worker-env.js:223-247
- tools/backtest-worker-env.js:258-270
- test/backtest-worker-env.test.js:69-91
- test/backtest-worker-env.test.js:118-154
- test/backtest-worker-env.test.js:192-245

Context:

- Historical stock baseline runner used long-only unless shorts were explicitly enabled.
- Current worker env previously forced DIRECTION_FILTER=both because CANONICAL_BACKTEST_ENV overrode source env.
- The fix preserves explicit sourceEnv DIRECTION_FILTER when configEnv does not override it.
- configEnv DIRECTION_FILTER must still win over sourceEnv.
- Legacy aliases must normalize: long -> long_only, short -> short_only.
- Invalid direction values must fail loudly instead of silently falling back to both.
- summarizeWorkerEnv must stamp the effective DIRECTION_FILTER.

Attack questions:

1. Find any path where sourceEnv.DIRECTION_FILTER still gets silently overwritten by both when configEnv does not set DIRECTION_FILTER.
2. Find any path where configEnv.DIRECTION_FILTER fails to win over sourceEnv.DIRECTION_FILTER.
3. Find any path where alias values long or short survive into the child worker instead of normalizing to long_only or short_only.
4. Find any path where invalid direction values fall back to both instead of throwing.
5. Find any path where the worker result summary lies about the effective direction.
6. Identify whether this closes the underlying mechanism or only masks the symptom, and what new failure modes it introduces.

Answer with file:line evidence only. If a claim depends on another caller, cite that caller and the exact env object shape it passes.
