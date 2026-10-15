# Astra final adversarial decision: GO

Date: 2026-10-15. Final candidate tree: `3e6ef49e1d8b45bd0b783d98cc082af4fa4352d0`. Base: `b75734e77139336db7c8b6f93f76d43a3285df4c`.

GO for removal of the generic own-fill/high-water venue rail. The downstream defects found in earlier candidate trees are resolved in this final tree. This removal does not implement the requested 50% whole-account daily loss control; that remains separate work. Existing prop-specific limits remain intact.

## Final correction verification

- Compared final tree to `67f31886552d863d395549ebb2a1329c4b8b3fb4`: the entire difference is deletion of the `daily_loss_limit` and `max_drawdown` expectations from `test/trading-loop-trace-spine.test.js:784-790`. These were generated solely by the removed generic-risk test stub. Existing warmup, confidence, direction, opposite-position and max-position assertions remain. Programmatically verified exact expected bytes and syntax of this final changed test.
- All production and posture-gate bytes are identical to 67f31886, for which this reviewer ran the pinned isolated native fixture successfully and checked syntax of all 18 changed JavaScript files. The production fixture was not needlessly repeated after a two-line test-only change.
- The posture gate no longer demands the retired authority. Its complete REQUIRED_CONFIG_EXACT object was AST-evaluated and compared to base: exactly the two generic-rail keys are removed, with every other value retained. Final `ogz-meta/gates/eval-live-posture-gate.js:40-52` retains TTP volume, market-time, daily/max account loss, earnings and consistency requirements. Native fixture comparison also proved every profile's venueGuards equal to base.
- No retired RiskManagerConfig import, builder/brand helper, isTradingAllowed/assessTradeRisk method caller, railLocks consumer, or tradingAllowed summary consumer remains in the bounded runtime and active-test scan. Remaining retired config names in tests assert absence; they do not dereference deleted nested objects. Other max_drawdown references in public proof account rendering are unrelated account data, not the removed generic authority.
- The retained RiskManager reconciliation test still verifies report-only deltas and no mutation of own balance (`test/risk-manager-config.test.js:25-43`). Its forbidden-mechanism scan remains (`:45-75`), minus only the archived module from its file list. Runtime constructor verification now matches the retained canonical reporter contract (`:77-82`). The final base-to-candidate whitespace check passed.

## Acceptance scope and Mercury identity

No candidate-introduced blocker remains in the reviewed change and its direct consumers. This is bounded GO, not a claim that the full Jest suite passes: no whole-working-tree Jest run was performed, and unrelated staged reconciliation work was excluded from this source review.

Mercury's original a08686f0 receipt reports no_break_found; root dispatched supplemental review against 67f31886. This reviewer does not relabel either review as covering the exact final test tree or claim the supplemental provider's pending result. Final production/gate identity relative to 67f31886 is verified; the final two assertion deletions were reviewed independently here.

No production edits, trading-state imports/writes, broker requests, network, services, backtests, PM2 actions or publication were performed by this review. The earlier other-agent singleton/state-write incident remains recorded in VERIFICATION.md; no claim of unchanged real state or guessed restoration is made. Full runtime activation, broker equity accounting, trading acceptance and the new 50% daily rule are not established.

The chronological provisional findings and verification receipts follow so the resolved defects remain auditable.

---

# Astra adversarial review — provisional NO GO

Date: 2026-10-15. Candidate `a08686f008404b78b9cda9a5569c9976be2dbaad`, base `b75734e77139336db7c8b6f93f76d43a3285df4c`.

NO GO for this candidate until direct downstream consumers are reconciled. Removing the generic own-fill/high-water 2.75% rail is authorized; neither finding asks to restore it. The replacement 50% whole-account daily control is not implemented or accepted by this patch.

## Introduced defects

1. The live-posture gate still requires the removed control: pinned `ogz-meta/gates/eval-live-posture-gate.js:33-34` requires `risk.guardMode=venueRailBuffer` and `risk.venueRailBuffer.enabled=true`. Its exact-value loop at `:511-513` evaluates those requirements for every loaded snapshot, and `:527` makes any errors a FAIL. Candidate settings and loader intentionally omit both fields, as the isolated native snapshot probe confirms. Valid rail-free configuration therefore cannot pass these two checks. Reconcile these obsolete checks without removing prop-specific requirements.
2. Active test consumers still import/dereference the removed API. Pinned `test/risk-manager-config.test.js:6` imports `../core/RiskManagerConfig`, but `git cat-file -e candidate:core/RiskManagerConfig.js` fails because the file was archived. The suite also calls deleted methods (`:87,109,136,144`) and expects the old constructor (`:221`). Other active suites require old config/proof fields, including `test/config-loader-live-guard.test.js:386-389` and `test/runtime-config-proof.test.js:284-285`. `package.json:8,75-81` keeps these suites in the test surface. Update the affected consumer expectations/contracts together with the API removal; do not restore the retired authority to satisfy obsolete tests.

## Completed bounded verification

Inspected the replacement fixture before running. It compiles only pinned ConfigLoader/RiskManager/PnLTracker/DrawdownTracker with restricted module and filesystem adapters; config and internals come from pinned Git objects and fixture credentials stay in memory. TradingLoop is parsed by AST and only its pure decision method executes; neither TradingLoop nor StateManager is imported.

Executed `REVIEW_TREE=a08686f008404b78b9cda9a5569c9976be2dbaad node ogz-meta/inbox/codex/2026-10-15/remove-generic-rail/fixtures/probe.cjs`: PASS. Paper/production snapshots and provenance omit retired fields, all seven profiles retain identical venueGuards, own-fill P&L and reconciliation alerts remain report-only, buy/short decisions are produced after 3% own-fill loss, malformed confidence yields HOLD. Pinned diff whitespace check passed.

Bounded active-consumer search across core, foundation, runner, config, public, scripts, tools and ogz-meta/gates found only the two eval-live-posture-gate references above for the removed module/method/config/summary authority. No other runtime consumer was found in that scope. Tests were inspected statically; no broad Jest run or posture-gate CLI was executed.

The earlier real-StateManager import/write incident is documented in VERIFICATION.md and is not claimed as safe or unchanged state. This reviewer did not repeat it. No network, services, broker calls, PM2 operations, real-state imports or writes, backtests, proof publication, or production edits were performed.

Mercury provider was still pending when this provisional review was recorded; no replacement Mercury run was launched and no Mercury conclusion is inferred. Awaiting a replacement candidate covering the directly affected consumers before final disposition.

## Replacement candidate 67f31886 — final assertion still open

Reviewed `67f31886552d863d395549ebb2a1329c4b8b3fb4` against the same base. Both initial findings are reconciled: the posture gate removes only the two obsolete rail requirements, and tests no longer import/call the retired RiskManagerConfig or RiskManager trading-authority API. Retained test assertions check absent retired fields or retained reporting behavior. The reconciliation and forbidden-mechanism scans remain present.

One direct test mismatch remains: `test/trading-loop-trace-spine.test.js:784-792` still expects `daily_loss_limit` and `max_drawdown` in the approved gate event, although this candidate removes the only test stub producing those gates at `:758-762` and the production generic risk authority is gone. Bounded source search finds these two names only in the assertion within TradingLoop and this test file. Remove those retired stub-only expectations while retaining the other gate assertions. This exact replacement tree remains NO GO until corrected.

Verification repeated on this tree: isolated native fixture PASS; syntax check of all 18 changed JavaScript files PASS; AST evaluation of REQUIRED_CONFIG_EXACT confirms its entire object equals the base object minus exactly `risk.guardMode` and `risk.venueRailBuffer.enabled`. All prop-specific gate requirements therefore remain byte/semantically intact; seven profile venueGuards also remain equal in the native fixture. No broad Jest or service run was executed.

Mercury's original a086 review is now available and reports no_break_found. It does not cover this replacement candidate and its assertion discrepancy; a supplemental review is owned by root, not launched by this reviewer.
