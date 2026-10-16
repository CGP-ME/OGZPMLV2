# Retire `performanceAnalysis.updateIntervalMs`

The committed baseline declares `internals.performanceAnalysis.updateIntervalMs: 60000`. The current runtime constructs `PerformanceAnalyzer` by merging `performanceAnalysis` then `internals.performanceAnalysis` at `run-empire-v2.js:725-728`; the constructor prints the value at `core/PerformanceAnalyzer.js:83`.

There is no analyzer timer: the committed `PerformanceAnalyzer` has no `setInterval` call. Its work is event-driven by `processTrade` (`core/PerformanceAnalyzer.js:181`), and current `OrderExecutor` calls that method after a completed trade at `core/OrderExecutor.js:4749` and in the alternate execution path at `core/OrderExecutor.js:5461`. The actual cadence setting for recommendations is trade-count based (`recommendationInterval`, `core/PerformanceAnalyzer.js:285-287`), separate from the retired interval value.

The old value was **60000 milliseconds**, apparently intended to describe a periodic update cadence. There is no current scheduling consumer for it. The candidate therefore removes only that property, increments the internals revision from 4 to 5, and removes only the log that reported the nonexistent schedule. It does not remove methods or add timers, guards, or throws.

`change.patch` is the exact two-file candidate. The fixture loads copied committed sources and merges actual committed `config/settings.json` `performanceAnalysis` with each baseline/candidate `internals.performanceAnalysis`, matching the active construction order. It freezes time, processes two synthetic closed trades, and proves the returned assessments and analyzer state are identical while the candidate lacks the obsolete log.

Limits: this is a static/copy-based isolated class check. It does not start the bot, call a broker, or prove a live process has reloaded configuration.
