# Mercury spec review — directional-fix-spec (2026-08-04)

Dispatch: ask.js --agentic --max-iterations=60 --max-tokens=7750, spec inlined
(inbox paths are mercury.ignore-blocked, correctly). 26 iterations, 15 files
opened. Run ledger: ogz-meta/cognition-history/mercury-runs/2026-08-04.jsonl:2.

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
