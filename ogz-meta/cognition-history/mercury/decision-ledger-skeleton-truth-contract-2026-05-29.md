Mercury attack target: decision ledger skeleton truth contract.

Changed ranges:
- core/dto/DecisionLedgerSchema.js:85-180
- core/StateManager.js:518-541
- core/StateManager.js:636-650
- test/decision-ledger-schema.test.js
- test/state-manager-open-position-scope.test.js

Context:
The old createLedgerSkeleton path fabricated evidence:
- missing symbol became "unknown"
- missing timeframe became "15m"
- missing executionMode became "backtest"
- missing strategySignals became []
- missing orchestratorDecision became { winnerStrategy:null, finalConfidence:0, reason:"unknown" }
- missing positionSizing became zero-size formula "N/A"
- missing exitContract became strategyName "unknown"

The patch removes those substitutions. createLedgerSkeleton now requires explicit
ledger evidence for tradeId, candleTimestamp, symbol, timeframe, executionMode,
entryPrice, direction, strategySignals, orchestratorDecision, positionSizing, and
exitContract. It validates the final skeleton with Zod and throws
LEDGER_SKELETON_REJECTED if evidence is missing or malformed.

StateManager.openPosition now passes raw context.ledgerData fields into
createLedgerSkeleton, catches LEDGER_SKELETON_REJECTED, returns a failed result,
and does so before this.state.activeTrades.set(...).

Attack questions:
1. Construct an input to StateManager.openPosition where missing ledger evidence
   still creates an active trade with fabricated "unknown", "15m", "backtest",
   zero sizing, or "N/A" ledger values.
2. Construct an input where createLedgerSkeleton returns a ledger that fails
   DecisionLedgerSkeletonSchema validation.
3. Construct an input where StateManager mutates activeTrades, scalar position,
   counters, or saved state before rejecting a malformed ledger.
4. Construct an input where explicit invalid values are coerced instead of
   rejected, for example executionMode:"simulated", candleTimestamp:NaN, or
   positionSizing:null.
5. Identify any new failure mode introduced by this patch in the normal
   OrderExecutor -> StateManager open path.
6. Architecture question: did this close the underlying mechanism of fake ledger
   evidence, or only hide the symptom? What new failure modes does it introduce?

Do not validate generally. Break or breach the change with file:line evidence.
