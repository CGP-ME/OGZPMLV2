# Astra adversarial decision: GO

Date: 2026-10-15. Candidate tree: `459a6d5e31dd5d393fc78ba98281fccf6e7d83df`. Base: `f0eff88ffa0d56f69162f9cc01701ddfa2a91b28`.

GO for the scoped auth-counter authority removal under Trey's explicit ruling: auth failures remain loud, failed broker operations return their errors, and the auth counter must not impose a sticky entry veto/quarantine or autonomously flatten positions. No unintended candidate-introduced blocking defect was demonstrated. Mercury's `found_break` receipt remains preserved; this is the independently authorized Astra disposition, not a clean Mercury claim.

Reviewed the entire pinned three-file diff, full pinned AuthFailureGuard, its production adapter callers, neighboring execution code, and every cited Mercury allegation. No unrelated working-tree source was edited. All line references below are candidate-tree references unless marked base.

## Behavior evidence

- `core/AuthFailureGuard.js:58-60` retains only configuration and in-memory per-broker counters. File IO, quarantine persistence/reads, runtime wiring, tracked-position selection and flatten execution have been removed.
- `:71-98` retains input checks, per-broker rolling-window accounting and unconditional error logging for every classified failure. Existing validation throws were not added by this change. `:100-115` emits `BROKER_AUTH_FAILURE_THRESHOLD_ALARM` with explicit `tradingAction: 'none'` and reconciliation-required telemetry, then returns without trading action.
- Native adapter call sites still call `recordFailure` with source-backed auth evidence: `brokers/AlpacaAdapter.js:140-155,158-178,182-195` and `kraken_adapter_simple.js:52-67`. No production caller of the removed runtime-wiring/quarantine methods remains in the bounded production scan.
- Both broker adapter files are byte-identical between base and candidate. Order-error propagation remains explicit at `brokers/AlpacaAdapter.js:529-536` and `kraken_adapter_simple.js:806-814`. This review did not send an unauthenticated request or claim a real broker test.
- `core/OrderExecutor.js:2887-2892` preserves explicit manual/session pause enforcement. The removed block was specifically the AuthFailureGuard quarantine veto. Existing broker-verification and other execution policy handling after it remains untouched (`:2893` onward). Runner deletion removes the guard's ability to call the bot's execution method.
- Existing quarantine files are left as historical files but have no authority through this removed reader. The test confirmed no new quarantine filename was created. This is not a claim that local historical files were deleted.

## Mercury allegation attribution

1. Removal of quarantine persistence and the auth entry guard is the user's required behavior, not an unintended break. Their missing imports follow removal of all corresponding consumers.
2. `_flattenAndHaltExitDesync` is unchanged. Candidate `core/OrderExecutor.js:1383-1445` matches base starting at `:1384` byte-for-byte, SHA-256 `3faf0e824e619baec590232438b7e35e0ff239f8b9c576f76cd886630f3b660e`. The catch captures `flattenError` at `:1408`, and downstream trace fields include that error at `:1441`; calling it silently swallowed based solely on the catch is incomplete. This separate exit-desynchronization mechanism is not the removed auth-counter flatten path.
3. Candidate receipt flags at `core/OrderExecutor.js:3635-3641` are byte-identical to base `:3661-3667` (SHA-256 `fe0c2d5c05656c25b7e75adfdf534a371515199fa50bd5cb28ff4a7717577727`). This review does not certify all pre-existing receipt semantics; the cited assignment is not introduced by this patch.
4. Candidate entry-price guard `core/OrderExecutor.js:4472-4477` matches base `:4498-4503`; entry-strategy guard `:4506-4511` matches base `:4532-4537`. Both are unchanged, with no introduced trigger supplied by Mercury.
5. Candidate `run-empire-v2.js:933-940` matches base `:934-941`, SHA-256 `dcd8924d469d3e4ce7c960e62afc36146d8d5c3443956a36e190eb8119efa025`. Contrary to the allegation's description, these lines reject a missing timeframe, increment a diagnostic counter and log an error before returning. They are not a newly added silent missing-symbol return.

The unrelated inherited findings were adjudicated against exact base bytes, not dismissed merely because they were outside the intended topic. None provides a candidate-specific regression attributable to this removal.

## Actual verification and limits

Inspected the fixture and imports before execution. It compiles only pinned AuthFailureGuard, uses ConfigLoader/TraceSpine and their inspected configuration/utility dependencies, and reads adapter files as bytes. It does not import StateManager, TradingLoop, OrderExecutor, the runner, or broker adapters.

Executed unchanged:

`REVIEW_TREE=459a6d5e31dd5d393fc78ba98281fccf6e7d83df node ogz-meta/inbox/codex/2026-10-15/auth-no-trading-authority/fixtures/probe.cjs`

PASS: one error per failure, threshold trace observed through native TraceSpine, no entryBlocking telemetry, tradingAction none, removed authority methods absent, quarantine filename inventory unchanged, adapter hashes unchanged, and pinned executor/runner wiring removed. Pinned `git diff --check` also passed. The fixture uses current ConfigLoader/TraceSpine utility implementations; the three reviewed implementation files are selected from the pinned candidate.

No production edits, state mutations through the trading runtime, network requests, services, backtests or PM2 actions were performed. Full broker rejection behavior, complete pipeline execution, deployment and live acceptance were not exercised. The verdict covers this atomic authority removal only.
