# Stop1 secondary strategy leaf audit

Static-only review of 152 leaves in the thirteen assigned `strategies.*` families at worktree observed from `cb566d93a46dca8673def2f76ea685f5be0b148e`. The JSON companion contains one row per settings leaf, its consumer family citation, initialization/evaluation chain, status, and effect. Source hashes bind the review to the observed dirty worktree; this is not proof that a runner currently enables or evaluates every strategy.

All 152 leaves have a concrete static production consumer. The only diagnostics-only leaf is `strategies.NoWickImbalance.debug`: it sets `DEBUG` and gates console output at `modules/NoWickImbalance.js:90,118,287,318,323,332,410,461,520`; it does not change a trade decision. Every `confluenceBoost.enabled`/`weight` row is conditional: `core/StrategyOrchestrator.js:1332-1349` applies it only after a strategy result and MTF confluence; `enabled` gates at line 1335 and `weight` changes the ranking multiplier at lines 1339-1349.

`CandlePattern` and `MarketRegime` have only those two confluence leaves in their assigned settings trees. `CandlePattern` produces a result at `core/StrategyOrchestrator.js:1955-1975` from inputs built in `core/TradingLoop.js:2052-2060`; `MarketRegime` produces its vote at `core/StrategyOrchestrator.js:1979-2015`. Neither statement establishes live activation.

No copied-but-unused or hardcoded-replacement leaf was found in this bounded family set. This result does not cover indicators, MADynamicSR, SMBreakOGZ, or broader orchestrator ownership assigned to other lanes.
