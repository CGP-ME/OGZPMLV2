# Stop1 deep subset notes

Supplement to the acceptance audit. It covers 208 literal settings rows in MADynamicSR, SmartMoneySweep, BreakRetest, OGZTPO, orchestrator, and strategyBehavior. The JSON preserves a per-row reader, initialized caller, and effect.

- 186 rows have an initialized decision/calculation effect.
- 12 rows are live when enabled.
- 5 MTF rows create trace attribution only.
- patternPersistBars, maxHoldBars, and OGZTPO.adaptive are read-discard; MADynamicSR.conditionFlags.trendGate is an ignored toggle.
- SmartMoneySweep.maxDailyLosses remains a wired restriction contrary to current user intent.

The MTF traces deliberately do not investigate or alter the separately assigned MTF defects.
