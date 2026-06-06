Mercury, break my fix.

Single target: the config-owner move for the parallel backtest runner.

Changed shape:
- `core/TradingConfig.js:971-1071` now owns `parallelBacktest` default data, data shortcuts, stock shortcut keys, strategy roster, sweep preset definitions, RSI sweep values, and gauntlet ATR values.
- `core/TradingConfig.js:1423-1425` returns a deep-frozen clone through `TradingConfig.getParallelBacktestConfig()`.
- `tools/parallel-backtest.js:57-60` reads that config once and derives `DEFAULT_DATA`, `DATA_SHORTCUTS`, and `STOCK_DATA_SHORTCUTS`.
- `tools/parallel-backtest.js:173` derives `STRATEGIES` from config.
- `tools/parallel-backtest.js:266-332` derives `SWEEP_PRESETS` from config definitions, freezes exported preset arrays/envs, and returns clones from function presets.
- `tools/parallel-backtest.js:334-348` derives RSI sweep thresholds from config.
- `tools/parallel-backtest.js:682-727` uses config-owned shortcuts to resolve data files and stock mode.
- `test/parallel-backtest-solo-env.test.js:49-79` asserts config ownership, frozen exports, and clone behavior.

Attack question:
Find a concrete state where this change still lets parallel-backtest sweep/data/strategy values silently drift outside `TradingConfig`, mutates the config-owned values, changes generated worker env compared to the pre-move behavior, or only moves the symptom while leaving a same-file duplicate owner. Include exact file:line evidence. If the mechanism is closed for `tools/parallel-backtest.js`, say what proof closes it and identify any new failure mode introduced by the move.
