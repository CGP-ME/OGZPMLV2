# Astra final adversarial decision: GO

Date: 2026-10-15. Final candidate tree: `f5a58283d40242b7b76fed9113c4e2a5d58d4535`. Base: `ea226fb489b185a7f17eac13782ece6bbbf5d27b`.

GO from Astra for this scoped broker-read authority removal. Earlier direct test-consumer defects are resolved. Mercury was pending at the initial review; the final source-based adjudication below resolves that condition under the user's standing Astra override. This is not full pipeline/live acceptance.

## Exact final-source verification

- Both production files, `core/OrderRouter.js` and `core/OrderExecutor.js`, are byte-identical to the previously native-probed candidate `85699e2c9fa5b59acd12810f901a7f7f92db7b63`. That isolated test executed actual pinned OrderRouter: outage log/event remained observable, a recovered fake adapter accepted a subsequent order, and an actual fake-adapter rejection propagated unchanged. No runtime probe was repeated solely for test edits.
- Final base-to-candidate diff contains only those two runtime files, three affected test files, and the rehearsal context stub. Runtime removal still drops only the sticky outage map, its getBrokerTruthEntryBlock API and the sole Executor consumer. Outage logging, trace/event emission, actual order rejection, explicit pauses and unrelated execution checks remain.
- AST comparison of `test/order-executor-pause-gate.test.js` proves exactly two test calls were deleted: the obsolete broker-read entry-veto test and its veto-specific direct-exit exception test. Every retained test call is byte-identical to base, including `preserves financial halt entry block without cooldown gate telemetry`, now starting at `:426`. No credential-case/mock edit from the working tree entered this pinned file.
- `test/order-router-cancel.test.js` removes only calls/assertions for the retired API at the old `:358-367`; its console-error and trace assertions remain. The existing test title still describes an entry block, a stale descriptive label, but no retained assertion requires that removed behavior.
- `test/order-router-registration-ownership.test.js` removes only the obsolete map-size assertion. Its original-connection order/read checks, rejected replacement listener-count assertion and collision ownership assertions remain (`:18-46`).
- `scripts/session-handoff-rehearsal/executor-context.js:21-29` removes the unused API stub; its broker-routing prohibition remains. Two unused stubs still exist in `test/auth-failure-guard.test.js:183,235`; neither calls a missing real method nor asserts that the retired block executes. They are not treated as a runtime failure or complete cleanup.
- Bounded runtime/test searches found no remaining invocation or assertion requiring the retired real API/map. Syntax checks passed for all six final changed JavaScript files; exact base-to-final whitespace check passed.

## Limits and review identity

Full Jest was not run. Source and AST comparison, prior exact-production native verification, and syntax checks support this scoped GO; they do not certify all inherited fixture behavior. The native fixture compiles OrderRouter only, whose dependency surface is EventEmitter and TraceSpine; no StateManager, TradingLoop, OrderExecutor or real adapter was imported. Its fake-adapter success/rejection test is not a real broker test.

No production source edits, network requests, services, trading-state reads/writes, PM2 actions or backtests were performed. Root owns the pending Mercury run and must preserve its exact candidate/result identity when adjudicating delivery. No Mercury-clean claim is made here.

The initial NO GO and the concrete resolved findings follow as review history.

---

# Astra adversarial review — provisional NO GO

Date: 2026-10-15. Candidate `85699e2c9fa5b59acd12810f901a7f7f92db7b63`, base `b75734e77139336db7c8b6f93f76d43a3285df4c`.

NO GO for this exact candidate until directly affected test consumers are reconciled. The production removal matches Trey's requirement that broker read/auth infrastructure events must not create an extra sticky trading authority. No unintended production behavior defect was demonstrated; restoring the removed map or veto is not the requested resolution.

## Direct downstream defects

- `test/order-router-cancel.test.js:358,366-367` calls removed `router.getBrokerTruthEntryBlock`. This now fails with a missing-method TypeError, and the test still specifies a sticky entry block (`:340`). Preserve its failure log/trace coverage while expressing the requested observer-only behavior.
- `test/order-router-registration-ownership.test.js:33` dereferences removed `router.brokerTruthUnavailable.size`. Preserve this test's rejected-registration ownership and listener isolation check using the retained observable event behavior; the removed map cannot remain its assertion surface.
- `test/order-executor-pause-gate.test.js:422-489` still expects the retired broker-read veto, call and trace, including `getBrokerTruthEntryBlock` at `:466` and `BROKER_TRUTH_ENTRY_BLOCKED` at `:476`. Reconcile that obsolete contract. The direct-exit test at `:491-524` and unused helper stubs also mention the retired API; they are stale fixture surfaces, not evidence of remaining production authority.

Bounded active JavaScript search found no additional production call to the removed API or direct map access. The remaining non-test occurrence is a fixture stub at `scripts/session-handoff-rehearsal/executor-context.js:29-31`. `test/auth-failure-guard.test.js:183,235` contains unused stubs. Those definitions alone do not cause the missing-method failures above.

## Production evidence

Pinned `core/OrderRouter.js:40-44` retains adapter ownership and listener-identity tracking, dropping only the failure-state Map. `:386-413` still registers outage listeners and logs, traces and emits each outage record; it no longer stores an entry-blocking record. `:149-183` order routing and error propagation are unchanged from base. Pinned `core/OrderExecutor.js:2916` onward continues into existing independent execution checks after the sole removed broker-read veto. Neither broker adapter is changed.

## Actual isolated verification

Inspected fixture and imports before execution. Pinned OrderRouter imports only EventEmitter and TraceSpine, with no StateManager, TradingLoop, OrderExecutor or actual broker adapter import. The fixture uses a local EventEmitter fake adapter and reads pinned source via Git.

Executed `REVIEW_TREE=85699e2c9fa5b59acd12810f901a7f7f92db7b63 node ogz-meta/inbox/codex/2026-10-15/broker-read-no-trading-authority/fixtures/probe.cjs`: PASS. One outage record remains observable with its error code, no sticky Map/API exists, trace-emission source remains, recovered adapter order succeeds, and a subsequent actual fake-adapter rejection propagates unchanged with brokerRequestAttempted=false. This does not claim a real broker rejection test or native trace-subscriber coverage beyond the fixture's source assertion. Pinned diff whitespace check passed.

No production edits, network, services, real-state imports/writes, PM2 actions, broker requests or backtests were performed. Full execution-path acceptance and full Jest results are not established. Mercury has not yet been dispatched for this candidate according to the task handoff; no Mercury result is claimed. A final GO requires reconciliation of the concrete consumers above and the separately tracked Mercury review/adjudication.

## Final Mercury adjudication — GO under standing Astra override

Reviewed the delivered Mercury `found_break` against exact candidate `f5a58283d40242b7b76fed9113c4e2a5d58d4535` and base `ea226fb489b185a7f17eac13782ece6bbbf5d27b`. Astra GO remains. All three cited allegations are inherited code, not introduced edits, and Mercury supplies no new candidate-specific producer or trigger beyond removal of the intentionally retired veto.

| Allegation | Exact attribution |
| --- | --- |
| Division by price in `_applyStockShareRange` | Entire method is byte-identical at `core/OrderExecutor.js:2197-2297` in both trees; SHA-256 `64762ca5760a3f63794a47ee6cd735afff6f42c081f530d137cb1074ea7e4469`. The cited division at candidate `:2222` is not added or modified. |
| Oldest-BUY fallback | Candidate `core/OrderExecutor.js:4360-4400` exactly matches base `:4391-4431`; SHA-256 `6776b3cd51768df3f9ccd0a7498b0675f62858e96932048c3b259ae91aa13173`. Selection/fallback at candidate `:4384-4391` is unchanged. This separate exit attribution concern is not certified correct by this review. |
| unknownBrokerReceipt assignment | Candidate `core/OrderExecutor.js:3598-3614` exactly matches base `:3629-3645`; SHA-256 `57f04effc09c6cbde54f6600315c57e8caa95dbc5701c449ca77c99622c8c022`. Assignment at candidate `:3608` is unchanged. This review does not settle all existing receipt semantics. |

An exhaustive sequence comparison of OrderExecutor found exactly one changed region: deletion of base `:2919-2949`, the `getBrokerTruthEntryBlock` lookup and veto. Every other source byte is retained. Mercury's classification of the division/fallback as added or modified is therefore contradicted by the pinned diff. Removing the broker-read latch allows intended routing to existing checks; no evidence supplied connects this patch to a newly malformed price, trade ID, or receipt.

Mercury's `found_break` is preserved as its actual verdict. The override is Astra's scoped attribution decision, not a relabeling to Mercury clean and not dismissal of possible inherited defects. No tests or production imports ran during this adjudication: only Git source reads, text comparison and AST parsing. Root's separate state-incident investigation is outside this review; no claim about that incident's effects or unchanged real state is made.
