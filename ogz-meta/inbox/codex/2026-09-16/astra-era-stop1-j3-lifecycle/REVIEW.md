# STOP 1 J3 cold-pull review

Review the exact change from base `31f150f9744021f8a092787f755f8123b3abf0a5`.

1. Does `SingletonLock` retain any process listener or exit authority?
2. Does acquisition failure return to the runner without weakening J2 exclusivity?
3. Does missing/replaced lock ownership reach the runner exactly once while lock read/parse errors remain evidence-only?
4. Are bootstrap fatal listeners removed only after the runner's runtime lifecycle exists, while instrumentation listeners remain?
5. Do repeated real SIGINT/SIGTERM and uncaught exception use one single-flight shutdown path with correct terminal status, without default signal termination bypassing cleanup?
6. Does runtime unhandled rejection preserve its explicit report-and-continue disposition without acquiring shutdown authority?
7. Are the actual startup, SessionRouter, candle-analysis, exit-monitor, and recovery producers stopped and their already-dispatched work settled before service cleanup and persistence?
8. Do the actual broker/dashboard owners cancel their own reconnect/request/snapshot machinery and report transport-close completion before state, pattern, and journal persistence?
9. Is the singleton released exactly once, after other cleanup and before process exit?
10. Does one cleanup failure remain visible, permit every later cleanup owner to run, and produce nonzero terminal status?
11. Do backtest completion and failure return through the actual runner dispatcher and same lifecycle, with the original failure preserved?
12. Does intentional backtest lock skipping remain distinct from failure to release acquired ownership and preserve a foreign record?
13. Do pattern and journal write failures propagate to the runner, and does one journal failure leave later journals attempted?
14. Does the correction add any generic request refusal, trading gate, pause, halt, flatten, retry threshold, timeout policy, or fallback controller?
15. Is every J3 interaction exposed by this walk fully connected now rather than represented by a deferred interface?
16. Does the committed probe reproduce without loading the bot entrypoint or using Jest/network services?

Do not treat this child-process/source-exact receipt as deployed runtime acceptance. PM2 activation remains unapproved.
