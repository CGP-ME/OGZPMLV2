# Verification and limits

The OrderRouter no longer retains a broker-read outage map or exposes an entry-block API; OrderExecutor no longer consults that veto. The broker outage event, trace and error remain. A later actual order still reaches the adapter, whose rejection still propagates. No order validity, unknown-receipt, reconciliation or prop-evaluation hold is removed by this change.

The native fixture compiles the pinned OrderRouter source with a fake EventEmitter adapter; it does not import StateManager or OrderExecutor. It verifies outage observation, a recovered adapter order and propagation of an actual adapter rejection. Executor is inspected as source only. Six changed files passed syntax checks and scoped diff whitespace checks. The obsolete tests and rehearsal mock were reconciled, but Jest and the full trading pipeline were not run for acceptance.

Astra confirmed that exactly the two retired broker-read gate cases were removed and all retained test calls, including financial-halt coverage, remain byte-identical to base. An earlier helper edit incorrectly removed the financial-halt case; root restored it before the final candidate, and Astra verified that correction.

Mercury returned found_break: division by price, fallback to oldest BUY, and an unknownBrokerReceipt assignment. These are reviewed separately against the pinned base in REVIEW-ASTRA.md; this is not a clean Mercury verdict. Delivery relies on the user's standing authorization to use Astra's adjudication of Mercury's findings.

No PM2 restart, runtime activation, broker request or trading resume is part of this change. This fixture's isolation does not erase other verification incidents in this session; the separate StateManager legacy-test incident is recorded separately.
