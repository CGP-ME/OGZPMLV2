# Mercury-2 spec review — fresh index, frozen spec (2026-08-05)

Dispatch: identical prompt to Mercury-1 (word-for-word), post-reindex.
Receipt (first live one from the f55f323c receipt patch):
verdict cannot_verify | quality flags none | tool failures 0/30 |
18 files opened | index freshness: indexed 2026-08-05T05:47 @ f55f323c —
HEAD f55f323c (0d old, same head) | run ledger 2026-08-05.jsonl:1.

## Mercury-2's 12 angles (vs Mercury-1's 5)

Enumerated the FULL guess-site list: OrderExecutor 996-997, SessionRouter
161-162, BacktestRunner 231-232, StateManager getEquity 592-601 /
closePosition 1236-1240 / reducePosition 1489-1491 / applyFill 2666-2670 /
:3784, ExitContractManager 312-315, PatternBasedExitModel 105,
PipelineSnapshot 306-307/315-316, TradeNarrator 668.

## Session triage (transparent)

- CATEGORY ERROR in Mercury-2's verdicts: it judged the spec as claiming
  fixes had LANDED and reported every site "uncovered" because "the code
  still contains the guess." Nothing has been implemented — the spec is a
  plan under review. Its "uncovered" column is therefore wrong as a
  coverage claim; its LINE CITATIONS are the value.
- ZERO genuinely new angles: all 12 sites were already in the audit and in
  the spec's own batch lists. The six-agent audit's coverage survived a
  fresh-index adversarial enumeration — strongest completeness signal yet.
- CONFIRMED SPEC EDIT (now flagged by Mercury-1, Mercury-2, AND the Fable
  review): BacktestRunner.js:231/:248 must be explicitly named for
  guess-deletion; Batch 1's load() gate does not seal the backtest
  force-close path.

## Staleness measurement (Mercury-1 vs Mercury-2 diff)

Stale index (Jul 18) cost BREADTH, not accuracy: 5 angles vs 12, 15 files
opened vs 18, and Mercury-1 missed the ECM/PipelineSnapshot/TradeNarrator/
applyFill/reducePosition sites entirely. Both runs' citations were
exact-line accurate (agentic live reads). Quality flags: Mercury-1 fired
unsupported_test_outcome_claim; Mercury-2 fired none — no unbacked claims
under the new evidence-quoting flagger.
