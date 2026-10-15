# Legacy StateManager tests wrote real paper state

2026-10-15. This is an agent verification incident, not a passing isolated test.

The helper ran `npx jest test/state-manager-load.test.js test/order-executor-pause-gate.test.js test/auth-failure-guard.test.js --runInBand` (11.64 seconds), followed by `npx jest test/state-manager-load.test.js --runInBand -t 'load preserves live Alpaca mismatch evidence without credential-derived entry holds'` (1.016 seconds), around 15:40–15:41 UTC. It reports output showing StateManager saving to disk and the focused test loading an unrelated BUY_TSLA record. Raw Jest output was not saved. No pre-test runtime snapshot exists; its before-index directory contains source only.

Root observed data/state-paper.json at 15:49:02 UTC with mtime 15:41:39.408785 UTC, balance 7500, zero active trades and null pauseReason/pauseSource. Root preserved the exact bytes privately, with mode 0600, before further investigation. test/state-manager-load.test.js:18-46 attempts isolation with retired environment settings including STATE_FILE. Its lines 1279-1285 directly set balance 7500, totalBalance 7600, initialBalance null and realizedPnL -25. This test setup does not establish the actual ConfigLoader state-file path after migration.

The earlier observed file at 15:11 UTC had balance 10000 and a SessionRouter transition pause. That observation followed a separately disclosed TradingLoop-import incident and is not a pristine pre-test backup. Neither observation establishes the running process's in-memory state.

PM2 inspection after the second incident: ogz-prime-v2 PID 2943769, restart_count 0, start timestamp 1792037912347, unchanged from the earlier observation. No restart, resume or guessed state restore was performed. The corrupted saved state must be reconciled with authoritative runtime/journal evidence before any reload. This remains OPEN; source delivery does not resolve it.

All further legacy runtime tests/imports were stopped. Later isolated ConfigLoader-stub fixtures do not retroactively make these commands safe. The root disclosed this incident to Trey. Raw state is private and must not be committed.
