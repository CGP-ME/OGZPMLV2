Mercury, break my fix.

Context: hot-path fix in core/StrategyOrchestrator.js EMASMACrossover adapter. modules/EMASMACrossoverSignal.js can produce a non-neutral alignment signal with crossovers=[]. The corrected fix no longer rejects that signal class. Instead, the orchestrator makes the basis explicit:

- crossoverCount = Array.isArray(sig.crossovers) ? sig.crossovers.length : 0
- signalBasis = crossoverCount > 0 ? 'fresh_crossover' : 'ma_alignment'
- reason says "EMA/SMA Crossover ..." only for fresh_crossover
- reason says "EMA/SMA Alignment ... (no fresh crosses)" for ma_alignment
- signalData carries signalBasis and crossoverCount

Attack only this fix. Find a path where EMASMACrossover can still produce a tradeable candidate/order reason that says Crossover while crossoverCount is 0, or where a fresh crossover can be mislabeled as Alignment, or where downstream trade/trace consumers lose the signalBasis/crossoverCount fields and still make the live trace ambiguous.

Use file:line evidence from:
- core/StrategyOrchestrator.js:336-381
- modules/EMASMACrossoverSignal.js:104-231
- core/TradingLoop.js:1050-1168 and 1480-1548
- core/OrderExecutor.js:1128-1155 and 2038-2046
- test/strategy-orchestrator-ema-crossover-validity.test.js:36-57

Also check sibling strategy adapter patterns in core/StrategyOrchestrator.js for the same bug class: trigger-count/reason says a specific event happened while candidate can be emitted with zero events.
