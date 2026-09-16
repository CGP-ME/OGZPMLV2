# STOP 1 J3 cold-pull review

Review the exact change from base `31f150f9744021f8a092787f755f8123b3abf0a5`.

1. Does `SingletonLock` retain any process listener or exit authority?
2. Does acquisition failure return to the runner without weakening J2 exclusivity?
3. Does lock-integrity failure reach the runner exactly once?
4. Are bootstrap fatal listeners removed only after the runner's runtime lifecycle exists, while instrumentation listeners remain?
5. Do SIGINT/SIGTERM and uncaught exception use one single-flight shutdown path with correct terminal status?
6. Does runtime unhandled rejection preserve its explicit report-and-continue disposition without acquiring shutdown authority?
7. Are producers stopped before service cleanup and persistence?
8. Are broker/dashboard/strategy services completed before state, pattern, and journal persistence?
9. Is the singleton released exactly once, after other cleanup and before process exit?
10. Does one cleanup failure remain visible, permit later cleanup, and produce nonzero terminal status?
11. Do backtest completion and failure use the same lifecycle?
12. Does the committed probe reproduce without loading the bot entrypoint or using Jest/network services?

Do not treat this child-process/source-exact receipt as deployed runtime acceptance. PM2 activation remains unapproved.
