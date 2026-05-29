Mercury attack target: TradingLoop decision-ledger strategy confidence truth.

Changed ranges:
- core/TradingLoop.js:74-116
- core/TradingLoop.js:1055-1066
- test/trading-loop-trace-spine.test.js

Context:
StrategyOrchestrator returns:
- orchResult.confidence on the public 0..100 percent scale.
- orchResult.allResults[].confidence on the strategy-result 0..1 scale.

The decision ledger schema requires strategySignals[].baseConfidence and
orchestratorDecision.competingStrategies[].adjustedConfidence to be 0..1.
The old TradingLoop ledger block copied allResults[].confidence with
`(r.confidence || 0)`, which could silently write a 0..100 value such as 80 into
ledger fields that mean 0.80. It also defaulted missing strategy names/reasons
to "unknown" and "signal fired".

Patch:
- Adds _ledgerConfidence01() to reject non-finite, negative, or >1 strategy
  confidence values.
- Adds _ledgerText() and _ledgerDirection() so ledger strategy names, reasons,
  and directions must be explicit.
- Uses the already-validated local `confidence` variable for winner
  finalConfidence.
- Replaces strategySignals and competingStrategies maps with the new helpers.

Attack questions:
1. Construct an orchResult where a 0..100 allResults confidence still reaches
   decision.ledgerData.strategySignals[].baseConfidence or
   competingStrategies[].adjustedConfidence.
2. Construct an orchResult where missing strategyName/name, missing reason,
   missing direction, or unsupported direction becomes "unknown", "signal fired",
   or "hold" instead of rejecting.
3. Construct an orchResult where winner finalConfidence and competing adjusted
   confidence are different scales for the same strategy.
4. Construct a normal StrategyOrchestrator output that this patch wrongly rejects,
   causing entries to stop even though the producer contract is valid.
5. Architecture question: does this close the ledger scale-corruption mechanism,
   or only mask it? What new failure modes are introduced?

Do not validate generally. Break or breach the change with file:line evidence.
