# Session Handoff - 2026-06-11 Eval Readiness

## Purpose

This handoff freezes the current state before continuing eval/live-readiness work. It is written after a context-heavy run with multiple external audits, Claude/Codex/Mercury work, and a large dirty tree. Treat it as the next-session starting map, not as proof that eval is ready.

Current branch:

- `claude/new_beginnings`
- Local HEAD at time of writing: `ba4fc2d Fixed live eval rule startup guard`
- Remote `origin/claude/new_beginnings` matched `ba4fc2d` after push.

## Completed And Pushed Today

These commits are on `claude/new_beginnings`:

- `5d5ec3f Fixed Mercury ignored search boundary`
- `74105a0 Fixed Claude bridge enforcement surface writes`
- `b69e437 Fixed Claude finish gate hot path coverage`
- `39c4ffe Fixed Claude Bash hook mutation escapes`
- `ba4fc2d Fixed live eval rule startup guard`

### Mercury Ignore Boundary

Closed the retrieval contamination class where Mercury could still read ignored/intake paths. Current expectation:

- `mercury.ignore` is the boundary.
- Ledger/intake should not be indexed into Mercury.
- If Mercury can read ignored files again, stop and fix that before trusting any Mercury result.

### Claude Bridge Enforcement

Closed several Claude bridge enforcement gaps:

- Claude policy is separated from Mercury policy.
- Claude read/write hooks enforce the cloned policy.
- Claude task-contract hooks cover hot-path edits.
- Finish-gate/warden coverage was expanded so hot-path edits cannot proceed without required proof.

### Claude Bash Hook Mutation Escapes

Closed shell-level mutation escapes:

- Hook input now fails closed on missing/malformed hook JSON.
- Script runtimes and shell runtimes are blocked unless explicitly allowed.
- Wrapper chains are unwrapped.
- Path-prefixed mutators are classified by basename.
- `sudo`/privileged wrappers are blocked.
- Mutating `find`, `xargs`, archive extraction, and in-place editor flags are blocked.
- Git mutating commands route into Warden/finish-gate enforcement even with global git options.

Verification that was completed for this slice:

- `node --check` on touched Claude bridge files/tests.
- Focused Jest bridge tests passed.
- Claude bridge smoke test passed.
- Staged secret scan passed.
- Mercury attacked the change multiple times and found real bypasses that were patched before commit.

### Live Eval Rule Startup Guard

Closed the eval-rule flag fail-open seam:

- `ConfigLoader` now normalizes live aliases into the validated live posture:
  - `EXECUTION_MODE=live`
  - `TRADING_MODE=live`
  - `ENABLE_LIVE_TRADING=true`
- Live startup now hard-fails unless all are true:
  - `CONFIRM_LIVE_TRADING=true`
  - `EVAL_RULES_ENABLED=true`
  - `TTP_RULES_ENABLED=true`
- `run-empire-v2.js` no longer treats `TradingConfig.pipeline.executionMode` or `TradingConfig.pipeline.candleSource` as independent runtime-mode owners.
- `WebhookOrderAdapter` no longer treats `executionMode: 'live'` as an unvalidated live trigger. It only trusts `liveTrading: true`.

Verification completed:

- Syntax checks passed for `foundation/ConfigLoader.js`, `run-empire-v2.js`, `core/WebhookOrderAdapter.js`, and focused tests.
- Focused/adjacent Jest suite passed: 7 suites, 123 tests.
- Direct probes proved:
  - `EXECUTION_MODE=live` with eval rules disabled fails through ConfigLoader.
  - `TRADING_MODE=live` with eval rules disabled fails through ConfigLoader.
  - `LIVE_TRADING=true` without `CONFIRM_LIVE_TRADING=true` fails through ConfigLoader.
  - Paper posture with eval/TTP rules disabled still loads cleanly.
- Mercury attacked multiple rounds. Real alias and adapter issues were fixed. Remaining final claims were stale or mechanically refuted by direct probes.
- Staged secret scan passed before commit.

## P0 / Anchor Proof Status

Do not treat P0 as cleanly proven yet.

During the live eval rule startup guard slice, `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` printed `PASS`, and a fresh worker report existed at:

- `backtest-results/worker-reports/backtest-report-1781171283400-phase0-canonical-multi-runtime-gate-2026-06-11T09-46-50-963Z.json`

That worker report showed the canonical values:

- Final balance: `10710.667785934895`
- Trades: `1692`
- Win rate: `62.8%`
- Profit factor: `1.15`

However, `ogz-meta/gates/runs/multi-runtime-latest.json` still pointed at an older 2026-06-06 run. That means the gate runner/report pointer path is not trustworthy enough for eval readiness until fixed and re-run. The user also stated there have been zero trustworthy P0 runs in the last three days and that P0 has been effectively bricked. Treat this as an open blocker.

Required next step for P0:

1. Fix why `multi-runtime-latest.json` is stale or not being updated by `multi-runtime-gate-runner.js --p0`.
2. Re-run P0.
3. Open the updated latest report file and confirm the anchor values from that file, not only terminal `PASS`.
4. Only then use P0 as proof.

## Open Audit: Broker Auth Failure Escalation

An external audit was dropped in the latest pasted file. It says the broker auth failure work is only partially closed.

Closed according to the audit:

- Alpaca REST catches route auth-class failures through `AuthFailureGuard`.
- Alpaca account WebSocket application-level authorization failure routes through `AuthFailureGuard`.
- Kraken `connect()` credential test and token fetch auth failures route through the Kraken classifier.

Open items from the audit, in priority order:

1. Alpaca data WebSocket `T: "error"` auth codes.
   - Current TSLA eval risk: high and actively reachable.
   - File area read this session: `brokers/AlpacaAdapter.js` data stream message loop around the `msg.T === 'error'` branch.
   - Current behavior from audit: logs `Stream error`, continues, does not escalate.
   - Intended atomic fix: classify Alpaca data-stream error codes that are auth-class and call `authFailureGuard.recordFailure('alpaca', 'ws-data-stream-auth', { authFailure: true, evidence: 'alpaca-ws-data-error-code', code, message })`.
   - No edits were made yet.

2. Alpaca account WebSocket transport-level `error` event.
   - File area: `brokers/AlpacaAdapter.js` account stream `on('error')`.
   - Current behavior from audit: logs only.
   - Intended atomic fix: detect upgrade/auth rejection text such as `401`, `403`, `unauthorized`, `forbidden`, and route to `AuthFailureGuard`.

3. Alpaca data WebSocket transport-level `error` event.
   - File area: `brokers/AlpacaAdapter.js` data stream `on('error')`.
   - Current behavior from audit: logs only.
   - Intended atomic fix: same transport auth-class classification, kind `ws-data-upgrade-auth`.

4. Kraken private `placeOrder` catch.
   - File area from audit: `kraken_adapter_simple.js` `placeOrder` catch around private `AddOrder`.
   - Current behavior from audit: wraps/throws without auth escalation.
   - Intended atomic fix: call `recordKrakenAuthFailureIfRelevant(error, 'rest-place-order')` before rethrow.

5. Kraken auth WebSocket connect catch.
   - File area from audit: `kraken_adapter_simple.js` auth websocket connect catch.
   - Current behavior from audit: logs and returns `false`.
   - Intended atomic fix: call `recordKrakenAuthFailureIfRelevant(error, 'ws-auth-connect')` before returning/throwing according to current design.

6. Legacy broker adapters have zero auth failure guard wiring.
   - Files named by audit:
     - `brokers/BinanceAdapter.js`
     - `brokers/CoinbaseAdapter.js`
     - `brokers/GeminiAdapter.js`
     - `brokers/SchwabAdapter.js`
     - `brokers/TastyworksAdapter.js`
     - `brokers/InteractiveBrokersAdapter.js`
     - `brokers/OandaAdapter.js`
     - `brokers/CMEAdapter.js`
     - `brokers/UpholdAdapter.js`
   - Dormant in current TSLA/Alpaca posture, but reachable by config flip. Do not bundle all of these into the Alpaca/Kraken active-path fixes.

Important note:

- `brokers/AlpacaAdapter.js` was only read after this audit. It was clean at the start of this handoff. No auth-escalation patch is currently staged or committed for that file.

## Pattern System Audit Status

Do not restart pattern-system work until the external Ultracode result is reviewed.

Current known completed pattern-memory commits on this branch:

- `e1f19de Fixed pattern memory config ownership`
- `55dcc0b Fixed pattern bank corruption recovery`
- `43457e0 Fixed pattern memory runtime pruning`

Current code observations from read-only inspection:

- `UnifiedPatternMemory` uses `TradingConfig.patternMemory` ownership and no direct `PATTERN_*` runtime env ownership.
- Pattern banks are scoped by mode/asset bucket.
- `PatternMemoryBank` uses `normalizePatternScope()`.
- `SessionRouter` currently calls `memory.switchSessionScope(...)`; the older ledger claim that pattern handoff was missing is stale.
- The pattern audit was not completed in this session because the user already has Ultracode running on the full pattern system.

Open pattern items to verify against Ultracode:

- Whether `UnifiedPatternMemory.save()` log-only behavior is acceptable or should fail loud on runtime persistence failures.
- Whether `forceBackup()` being soft-fail/return-null matters if any live transition path relies on it.
- Whether premium/harvest companion-bank architecture is actually implemented or still a spec gap.
- Whether every live caller supplies complete scope including broker, account, asset class, symbol, timeframe, and execution mode.
- Whether pattern bank snapshot/rollback is complete enough to recover corruption without losing the last known-good state.

## Eval Readiness Gates

### Gate A - Runtime Posture

Code side is much stronger after `ba4fc2d`:

- Live cannot start with risk bypasses.
- Live cannot start with webhook dry-run when webhook orders are enabled.
- Live cannot start with eval/TTP rule flags disabled.
- Live aliases now normalize through ConfigLoader.

Still required:

- Verify actual PM2 process env before eval.
- Do not assume committed config is live runtime.
- Restart requires explicit operator approval.

Required PM2 proof before go:

- `LIVE_TRADING=true`
- `CONFIRM_LIVE_TRADING=true`
- `EVAL_RULES_ENABLED=true`
- `TTP_RULES_ENABLED=true`
- `WEBHOOK_DRY_RUN=false` if webhook route is the live execution route.
- `ACCOUNT_DRAWDOWN_BYPASS=false`
- `RISK_MANAGER_BYPASS=false`
- Correct Alpaca/TTP/eval account values.

### Gate B - State And Broker Truth

Previously reported as green for paper only, with one open item:

- Paper account flatness proof existed in prior docs.
- Eval account flatness must be re-proven on go morning.
- Restart-with-open-position reconciliation proof remains open.

Required before eval:

1. Prove StateManager flat.
2. Prove scoped TradeJournal rebuild flat.
3. Prove broker REST positions flat on the actual eval account.
4. Prove account IDs match across state, journal, and broker.
5. Run or record a deliberate restart/reconcile proof if there is any possibility of open-position recovery being needed.

### Gate C - Signal Path Proof

This remains the main live-market blocker.

Needed during market hours:

- Live TSLA bars flowing through:
  - analysis start
  - strategy decision
  - eval rule check
- One paper broker round-trip with broker ack/reject captured.
- If dry-run is flipped off for paper validation, capture the full lifecycle and then restore intended posture.
- Full trace should show why a signal was born, why it was allowed/blocked, order plan, eval-rule inputs, broker response, active trade state, exit reason, P&L, tier/stop state, and final journal/recorder output.

### Gate D/E/F - Eval Rule Engine And TTP Rules

Current code/test state after `ba4fc2d`:

- Eval rules are wired pre-order.
- Live startup requires eval/TTP flags enabled.
- Focused eval/config tests passed.

Still needs live proof:

- Runtime env must show the flags enabled in PM2.
- Live market feed must produce actual `EVAL_RULE_CHECK` frames.
- TTP consistency threshold should be checked against the actual program document, not memory.

### Gate H - Dashboard/Report

Non-blocking for eval, but needed for diagnosis if eval fails:

- Continue proving the dashboard/live report shows real eval rule, trace, order, broker, and exit story.
- Do not let dashboard show green if eval rules are disabled or not loaded.

## Known Dirty Worktree Risk

The repo has a large dirty/untracked tree unrelated to the latest live eval guard commit. Do not use `git add -A`.

At handoff time, these tracked files were dirty but not part of the last committed slice:

- `AGENTS.md`
- `CHANGELOG.md`
- `ogz-meta/AGENTS.md`
- `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`
- `ogz-meta/Alignment/README.md`
- `ogz-meta/security/burned-dashboard-token-sha256.txt`
- `ogz-meta/sessions/session-2026-04-29-30-post-phase3-execution-queue-shipped.md`
- `public/proof/track-record/data/index.json`
- `scripts/scan-secrets.js`
- `test/secret-scanner-template.test.js`

There are also many untracked ledger, cognition-history, live-eval, proof, backup, and data files. Treat them as operator/other-agent work unless explicitly assigned.

## Immediate Next Steps

Work one atomic item at a time.

1. Fix P0 report freshness before relying on P0.
   - Root cause why `multi-runtime-latest.json` stayed stale.
   - Re-run P0 and verify the actual latest report file.

2. Close Alpaca data WebSocket `T:"error"` auth escalation.
   - Patch only that path first.
   - Add focused test in `test/auth-failure-guard.test.js` or a focused Alpaca adapter WS test.
   - Mercury: one prompt, "Mercury, break my fix."
   - P0 only after trade-path/hot-path changes if the P0 runner itself is fixed enough to produce trustworthy proof.

3. Close Alpaca WebSocket transport-level auth errors.
   - Account WS error event and data WS error event may be separate commits if strict atomicity is required.

4. Close Kraken private order auth escalation.

5. Close Kraken auth WebSocket connect escalation.

6. Review Ultracode pattern-system output and pick only concrete current-code findings.

7. Market-hours capture:
   - Use paper first.
   - Capture live TSLA bars and eval-rule traces.
   - Capture broker ack/reject path before eval launch.

## Commands / Proof Anchors

Useful commands:

```bash
git status --short --branch
git log --oneline -n 12
npx jest test/config-loader-live-guard.test.js test/webhook-order-adapter.test.js test/eval-rule-engine.test.js test/eval-live-posture-gate.test.js test/ttp-cutoff-enforcer.test.js test/eval-signal-path-proof.test.js test/ecosystem-eval-profile.test.js --runInBand
node scripts/scan-secrets.js --staged
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Do not trust `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` until the latest-report update path is fixed and verified.

## Final Warning

The eval is not blocked by a missing strategy feature right now. It is blocked by proof quality:

- P0 report freshness is suspect.
- Broker auth-failure escalation still has active WebSocket holes.
- Live market signal-path capture is still missing.
- Actual PM2 eval posture has not been proven after restart.
- Pattern system audit result is pending external review.

Do not flip eval live until these are closed with current-code proof.
