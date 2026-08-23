# Broker-Proof Wind-Down Rung — Landing Receipt (2026-08-23, Fable lane)

Mandate: Trey's brief "BROKER-PROOF WIND-DOWN RUNG — boundary-flat is proven at the broker, never in the ledger", ruled (a) with five conditions (2026-08-23). Prerequisite for live `directionFilter=both`. Supersedes the 2026-08-22 HOLD receipt.

## Adversarial layer — full panel, PASS

Standing law: nothing commits without the full adversarial layer. Rounds, one question each:
- Round 1 (Mercury + Fable + Kimi): Mercury PASS; reviewers BLOCKING — Mercury's search tools had failed (12 failed probes). Root cause: `rg` existed only as a shell function on the rebuilt VPS; ripgrep binary installed (14.1.1).
- Round 2 (tools live): Mercury PASS on all five with tool citations (26 iterations); reviewers BLOCKING for lack of verbatim quotes.
- Round 3: Fable/Kimi over Mercury's answer + machine-extracted verbatim packet v1 → CONSENSUS on flat-assignment, close chain, openPosition invariants, probes, diff audit; BLOCKING on registration body + journal/ntfy wiring quotes.
- **Round 4: Fable `VERDICT: pass`, `CONSENSUS_BLOCKING: no`; Kimi `CONSENSUS` on all five, `CONTRADICTIONS: none`, `CONSENSUS_BLOCKING: no`.** Sole NEXT_CHECK — run the probe suite in isolation — executed: `Test Suites: 1 passed / Tests: 8 passed, 8 total`.
Artifacts alongside this file: round1/round2 Mercury logs, round3/round4 review JSON, evidence packet v2.

## WHAT I DID

1. `core/SessionRouter.js`: `_proveSourceFlatAtBroker` runs after the state-side flatten in `_windDownForceFlatten`, reading the SOURCE broker through the pre-existing `_fetchBrokerRestSnapshot` (unmodified). `windDownFlattenComplete` is set true at one site only (`:482`), inside `if (brokerProof.flat)`, where `flat = openPositions === 0 && openOrders === 0` from the broker RE-READ. A close call's success is never accepted as proof.
2. Broker read rejection at any stage → `SESSION_WIND_DOWN_BROKER_FLAT_UNVERIFIABLE_HALT` (typed `reason`/`code` carried) → existing `_enterFailedSafe`. Boundary refused, process alive.
3. `_readyForBoundarySwitch` always runs the rung and returns `windDownFlattenComplete` — both directions, every crossing.
4. Ruling (a): each ghost leg is registered INTO state via the real `StateManager.openPosition` contract — `symbol/side/size/entryPrice` from the broker's own `getPositions` answer (`_normalizeBrokerPositions` now carries `entryPrice` through; null when the broker did not say), scope from `_buildRuntimeScopeForSession`, `orderId = tradeId = STALE_BROKER_ORPHAN:<broker>:<symbol>:<side>`, `action` BUY/SELL_SHORT from side, `entryStrategy: 'STALE_BROKER_ORPHAN'`, `provenance`, `quarantined: true`, `operationalQuarantine.eligibleFor: ['exit']`, explicit exit contract. Journal `SESSION_STALE_BROKER_ORPHAN_REGISTERED` + `…_RECONCILIATION` trace (stage `registered`, ntfy priority max) at registration; `SESSION_STALE_BROKER_ORPHAN_FLATTENED` + trace (stage `flattened`) at close.
5. Close runs through the ordinary path: `_closeSourceTradeThroughExecution` → `executeTrade` → `OrderExecutor._buildExitPlan` → `_findExitTrade` by the registered tradeId (KILL-5 satisfied by identity). `_closeSourceTradeThroughExecution` now returns the execution result; the orphan path treats `success:false` with the leg still in state as failure.
6. Condition 5 + floors: ordinary close failure after registration → `flatten_failed` journal/trace → `_enterFailedSafe('wind_down_orphan_close_failed')`. A leg still standing after a claimed-successful close is never re-registered; a second sighting in the same wind-down → `still_standing_after_close` → failed-safe. Broker answer without an entry price (Kraken spot has no cost basis) → `register_refused`, journaled, boundary shut, no failed-safe, nothing fabricated. State-tracked legs are skipped (not ghosts). `forceCloseOnSessionEnd=false` → traced, not closed.
7. Zero added `throw new Error`, zero `process.env` reads, zero config keys (diff audit in packet). One import added (`getExitContractManager`).
8. `test/session-router-broker-proof-wind-down.test.js` — 8 probes: (a) end-to-end crypto→stocks; stocks→crypto mirror; broker rejection → failed-safe; no-entry-price refusal floor; close refusal → failed-safe; still-standing → failed-safe; state-tracked skip; zero-state boundary still reads broker.

## Receipts

- `node --check core/SessionRouter.js` OK. Diff: `core/SessionRouter.js` +440/−24.
- 8 router suites: **109 passed / 1 failed / 110**. Probe suite isolated: **8/8**.
- The 1 failure is pre-existing and outside mandate: `test/session-router-stock-symbol-config.test.js:69` asserts the literal `routerMode === 'static'`; `run-empire-v2.js` was renamed to `sessionRouterMode` in `a0afdc81` (2026-08-12). Proven by path-limited stash at HEAD `343bb12c` (1 failed / 9 passed without the rung). Untouched.
- Rotated keys restored from the pre-merge backup and verified by real calls (Inception chat 200 ×6, Moonshot 200, OpenAI embeddings 200). Mercury index rebuilt: 9,904 chunks.

## WHAT I DID NOT DO

- Did not touch the stale `routerMode` assertion (not my mandate; sibling/Codex lane).
- Did not fabricate an entry price for Kraken spot ghosts — they hit the refusal floor by design until the broker answer carries cost basis.
- Did not cancel standing broker ORDERS — they count as not-flat and retry per tick.
- Did not restart PM2 or any running process.

## ASSUMED

- Open orders → not-flat, retry next tick (matches activation reconcile's UNSAFE definition), no failed-safe.
- Immediate post-close re-read may precede the broker reflecting the fill: first sighting keeps the boundary shut without failed-safe; the tick cadence is the grace, and the second sighting in the same wind-down is the ruled "close failed again".
- Source adapter resolved by session name, not `activeBroker` (null before first activation).
- `sizeUsd = quantity × broker entryPrice` (broker-truth notional); quantity unit by session asset class (`stocks`→shares, `crypto`→base) mirroring `OrderExecutor._orderQuantityUnit`.

## Sibling files seen in `git status`, untouched

- `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md` (untracked, sibling session)
- `data/supervisor-ledger.jsonl` (runtime data)
