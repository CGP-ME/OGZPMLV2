Re-attack the updated backtest-runner parity patch. Do not confirm it. Break it.

Context:
The project rule is that backtest and live execution must share the same execution path. This patch only touches tools/parallel-backtest.js, the child-worker wrapper for backtest sweeps. It should align parallel-backtest strategy isolation with tools/matrix-sweep.js without changing strategy logic.

Updated file ranges:
- tools/parallel-backtest.js lines 69-112: STRATEGIES, parseSoloStrategies, buildDormantStrategyEnableEnv, assertDormantStrategyEnvCompatible.
- tools/parallel-backtest.js lines 238-250: strategy-sweep roster.
- tools/parallel-backtest.js lines 339-380: selectedSoloStrategy, conflict guard, dormantStrategyEnv, child worker env construction.
- tools/parallel-backtest.js lines 736-746: updated help counts.
- tools/parallel-backtest.js lines 784-794: require.main guard and exports.
- test/parallel-backtest-solo-env.test.js lines 1-52: unit tests.

Known architecture:
- core/StrategyOrchestrator.js lines 139-147 parses SOLO_STRATEGY as comma-separated lowercase names.
- core/StrategyOrchestrator.js lines 228-232 registers only solo-selected strategies when SOLO_STRATEGY is set.
- core/StrategyOrchestrator.js lines 735-748 applies TradingConfig pipeline toggles after registration.
- core/TradingConfig.js lines 844, 848, 850 default BreakRetest, OpeningRangeBreakout, and NoWickImbalance disabled unless ENABLE_BREAKRETEST, ENABLE_ORB, ENABLE_NOWICK are true.
- tools/matrix-sweep.js lines 140-143 includes CandlePattern, NoWickImbalance, BreakRetest in ALL_STRATEGIES.
- tools/matrix-sweep.js lines 251-264 sets ENABLE_NOWICK/ENABLE_BREAKRETEST/ENABLE_ORB when those solo strategies are targeted.

Attack goals:
1. Find any child-worker path where --solo=NoWickImbalance, --solo=OpeningRangeBreakout, or --solo=BreakRetest still registers zero active strategies because the enable env is missing, overridden, or read from the wrong source.
2. Find any generated config path (strategy-sweep, gauntlet-atr, other presets) where config.env.SOLO_STRATEGY differs from parent process.env.SOLO_STRATEGY and the wrong dormant strategy toggle is enabled or disabled.
3. Find any non-solo path where this patch silently changes operator-specified env behavior or broadens baseline multi-strategy runs in a way that is not explicit.
4. Find any live/backtest parity break introduced by exporting helpers or moving prepareResultsDir/cleanupParallelStateFiles behind main.
5. Identify whether this closes the underlying mechanism or only one symptom, and name any sibling runner still needing the same treatment.

Return only concrete findings with file:line evidence and a minimal reproducer/path. If no finding survives code inspection, say what assumptions you tried to break and why they failed.
