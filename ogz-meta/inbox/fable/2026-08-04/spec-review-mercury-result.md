# Mercury spec review — directional-fix-spec (2026-08-04)

Dispatch: ask.js --agentic --max-iterations=60 --max-tokens=7750, spec inlined
(inbox paths are mercury.ignore-blocked, correctly). 26 iterations, 15 files
opened. Run ledger: ogz-meta/cognition-history/mercury-runs/2026-08-04.jsonl:2.

## Run-ledger provenance (preserved 2026-08-05 — ledger dir is gitignored)

run_id 2026-08-04T00-34-12-968Z-cdf2113b6ca5 at head 5a7e5aff. The ledger's
answer_quality flag was `unsupported_test_outcome_claim` with verdict
`cannot_verify`: the run executed ZERO checks (run_checks: [], no artifacts)
while the answer asserted behavioral outcomes — the quality gate correctly
flagged assertion-without-execution. All 15 file ranges opened were LIVE reads
(StateManager 560-880/1190-1280/3400-3600, OrderExecutor 40-80/970-1010,
SessionRouter 140-180, BacktestRunner 220-300), which is why every citation
verified exact-line at head despite the RAG index being stale since 2026-07-18
(index_stats: 621 files / 10,329 chunks at commit 04d5a1cf). Staleness cost
coverage routing, not citation accuracy. Mercury-2 rerun post-reindex is queued;
the spec is frozen at this reviewed version until Mercury-2 lands so the
two-run diff measures index staleness cleanly.

## Mercury's five angles, verbatim summary

1. SessionRouter.js:161-162 else-SELL guessed order — Mercury notes covered by Batch 2.
2. OrderExecutor.js:996-1002 null-to-SELL exit plan — Mercury notes covered by Batch 2.
3. BacktestRunner.js:231-232 window-end forced close infers LONG for direction-less
   trade — Mercury calls this a fourth door not covered by any batch.
4. StateManager.js:1236-1240 closePosition long-default — Mercury calls uncovered.
5. StateManager.js:592-601 getEquity short-default — Mercury calls uncovered.

## Session triage (transparent, per audit-categorization rule)

- Angles 1-2: AGREEMENT. Mercury independently rediscovered the audit's two worst
  order-sending guesses and matched them to Batch 2. Confirms Batch 2 scope.
- Angles 4-5: RE-FLAG OF COVERED ITEMS. The spec's Batch 3 names getEquity
  592-601, closePosition 1236, reducePosition 1489, applyFill 2666 explicitly
  (they were in the dispatched spec text). Mercury's "not covered by any batch"
  is a misread of the batch list, but its independent rediscovery of the same
  sites at the same lines strengthens the audit's citation base.
- Angle 3: REAL SPEC-TEXT GAP. The spec's Batch 6 says "windowEndPositions
  through the same trade contracts" but never names the BacktestRunner.js:231/:248
  direction-default ternaries for deletion the way Batch 3 names the StateManager
  sites. Fix to the spec: name BacktestRunner.js:231 and :248 explicitly in
  Batch 3 (guess deletion) and keep the contract-routing of windowEndPositions
  in Batch 6.

Net: one spec edit required (explicit BacktestRunner lines), zero new
categories of failure found, no objection to the route-to-existing-machinery
architecture or the no-new-throws constraint.
