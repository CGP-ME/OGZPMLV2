# Inherited findings

- `run-empire-v2.js:3630-3634` routes the process-level `uncaughtException` handler through no-argument `bot.shutdown()`, so that separate fatal-handler path still defaults to exit code 0. Fatal handlers and SingletonLock's signal behavior are explicitly excluded/contested V3-11/12 work, not L6.
- An exception inside shutdown cleanup can still reject before the final `process.exit(exitCode)` call. L6 preserves the ruled cleanup flow; redesigning the fatal cleanup boundary is separate work.
- The SessionRouter hold and TrAI-degraded paths remain unchanged and are not asserted to be fatal startup failures.
- `test/session-router-stock-symbol-config.test.js:69` has a stale pre-existing expectation for `routerMode === 'static'`, already absent at the L6 base. The unrelated test was not modified.
- Existing emoji-bearing shutdown logs remain outside L6's ruled exit-code lines. The broad boot-cosmetic item is L4 and was not bundled here.
- The full bot boot, actual signal receipt, and second-seat cold-pull are pending under the dispatch's isolation/hold rule.
- No trading-data default, environment bypass, broker mutation, PM2 action, shared lock/state mutation, or runtime activation was introduced.
