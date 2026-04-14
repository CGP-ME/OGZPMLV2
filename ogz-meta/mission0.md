Absolutely. Here’s a Mission 0 integration spec you can hand to Mercury/Critic/Forensics as the canonical de-conflicted plan.

Mission 0 — Coordinated Partial-Close Refactor Integration Spec
0) Objective (single source of truth)
Fix the multi-leg partial-close pipeline so one parent trade can:

Execute multiple exits without premature full-close.

Persist leg-level decision ledger exits.

Aggregate outcomes once at full close for learning/analytics.

Preserve backward compatibility for legacy exitSize consumers.

This is required because current close flow still full-closes regardless of passed partial size and removes active trade immediately. 

1) Canonical semantics contract (must be explicit)
1.1 Field semantics
exitSize = absolute USD size closed in this leg (legacy-compatible).

exitFraction = fraction of remaining position at decision time (0,1].

remainingSize = post-leg remaining USD size on the parent trade.

1.2 Invariants
closeSize = preLegRemaining * exitFraction when exitFraction provided.

postLegRemaining = preLegRemaining - closeSize.

Parent trade remains open iff postLegRemaining > epsilon.

Full close iff postLegRemaining <= epsilon (then emit final outcome + cleanup).

These semantics are consistent with MPM’s tracked remainingSize lifecycle and tier exits. 

2) Ownership model (de-conflict)
2.1 State ownership
StateManager owns truth for:

per-trade remainingSize

leg realized pnl / fee math

activeTrades lifecycle (delete only on full close)

decision ledger exit appends + final write-on-close

Current closePosition() cannot be reused as-is for partials because it computes close on full trade size and deletes trade immediately. 

2.2 Executor ownership
OrderExecutor only:

resolves which tradeId to close

routes full close vs partial close calls

forwards metadata (exitReason, prices, timestamps, etc.)

2.3 MPM ownership
MPM only emits exit intent payloads (size/fraction/reason), no authoritative state mutation outside its own model.

3) API contract changes (minimal but strict)
3.1 StateManager.reducePosition(tradeId, fraction, price, context)
Required behavior:

Validate 0 < fraction <= 1

Lookup trade by tradeId in activeTrades

Use trade-local remainingSize (fallback once for legacy)

Compute per-leg pnl/fees

Append leg into trade.decisionLedger.exits[]

Update state totals

Remove trade only when fully closed

If fully closed: finalize decisionLedger.outcome, call writeOnClose

This aligns with the stronger mission proposal and not the 10-line delegate shim. 

3.2 OrderExecutor close routing
Decision routing precedence:

exitFraction valid => call reducePosition

else legacy fractional exitSize (<1) => convert and call partial path

else full close path

Current logic assumes fractional exitSize; this is where the semantic mismatch occurs today. 

4) Data model migration contract
4.1 Trade object extension
At trade open, persist remainingSize = size. 

4.2 Ledger schema
Strengthen exits from z.any() to typed exit entries (include both exitSize and exitFraction).
Current schema is permissive and should be tightened for auditability. 

4.3 Backward compatibility
Keep exitSize; add exitFraction and remainingSize as additive fields.
Do not repurpose old field meaning silently.

5) Cross-module integration requirements
5.1 TradeJournal
recordExit must not delete parent trade on first leg; delete only when remainingSize === 0.
Current behavior deletes immediately and loses multi-leg lifecycle. 

Also ensure callers pass leg size + remainingSize (bridge currently passes size only). 

5.2 BacktestRecorder
Aggregate by tradeId, but accumulate leg pnl/fees; do not overwrite with last leg.
The mission draft currently overwrites pnl with latest leg, which breaks parent trade economics. 

5.3 TRAI + UnifiedPatternMemory
Aggregate pending outcomes by tradeId; emit one learning sample only at final close.
Ensure percent math uses dollar-derived aggregate percent, not naive sum of leg percents. 

5.4 Break-even
If re-evaluating after partial, must apply result to effective stop path (not log-only).
Log-only proposal is non-functional. 

6) Hidden/adjacent modules that must be checked
Required review/update gates:

TradingLoop decision payloads (ensure tradeId continuity + exitFraction propagation). 

PositionTracker.closePosition partial path (currently delegates to flawed closePosition path). 

TradeJournalBridge exit payload enrichment (remainingSize, leg info). 

PerformanceAnalyzer assumptions around one-row-per-close vs parent aggregated trade. 

7) Atomic rollout plan (recommended)
Atomic Set A (must ship together)
Schema + MPM output semantics

StateManager remainingSize + robust reducePosition

OrderExecutor routing to reducePosition

Reason: these three define runtime execution correctness and cannot be split safely.

Atomic Set B (must ship together)
BacktestRecorder aggregation correctness

TRAI aggregation correctness

UnifiedPatternMemory aggregation correctness

TradeJournal partial lifecycle correctness

Reason: if split, you get phantom or duplicated records.

Set C
BreakEven partial re-eval apply-path (or explicitly deferred).

8) Acceptance criteria (hard gates)
A change is accepted only if all pass:

Single trade, multi-leg close: activeTrades retains parent until final leg, then removes.

Ledger correctness: decisionLedger.exits.length == number of executed legs.

PnL reconciliation: sum(exits.netPnlDollars) ≈ outcome.netPnlDollars within tolerance.

Learning dedupe: exactly one TRAI + one UnifiedPatternMemory outcome per parent tradeId.

Backtest dedupe: one parent row per tradeId (with leg breakdown retained somewhere).

Legacy compatibility: single-close trades unchanged.

9) E2E test blueprint (canonical)
Test name: partial_close_parent_trade_aggregation_e2e

Scenario:

Open trade: size 1000 @ entry 100

Execute 4 exits with controlled prices and fractions (e.g., 0.30, 0.30, 0.20, final 1.0 of remaining or equivalent)

Assertions:

post each leg, expected remaining

leg ledger append count increments

parent stays in activeTrades until final leg

final close writes one ledger outcome

reconciled pnl equals sum of legs

one learning sample per system keyed by tradeId

10) Forensics/Critic checklist (future runs)
Require these checks in audit prompts:

Any method named reducePosition that delegates to closePosition must be flagged.

Any partial-close path that deletes active trade before remainingSize==0 must fail review.

Any percent aggregation that sums leg % directly without weighting must fail review.

Any mission that introduces exitFraction but leaves TradingLoop/Executor tradeId ambiguous must fail review.

If you want, I can next produce a one-page “execution contract” JSON schema draft (fields + invariants + examples for full/partial legs) that your Architect/Fixer/Critic stack can automatically validate against before patch generation.