# Fable independent spec review — directional-fix-spec (2026-08-04)

Fresh-context Claude agent, read-only, 45 tool calls. Verdict: READY-WITH-CHANGES.

## Confirmed well-covered
Three Batch 1 doors real and correctly characterized (openPosition gate + spread
order at StateManager :839-870/:925; updateActiveTrade quantity-but-not-identity
parallel; load() reconcile-or-quarantine extension is same-pattern). Refusal
contract already returns coded {success:false} objects — no new hot-loop throw.
Entry-block and exit-halt machinery exist exactly as the spec claims; halts are
entry-side only, so the loop truly continues. Backtest windowEndPositions is not
a fourth door into state (report-only). Boot-refusal failure shape identical to
existing scope gate.

## Findings (M1-M6)
M1. TWO MORE DOORS: StateManager.set('activeTrades') :553-557 and
    updateState({activeTrades}) :737-744 run only the quantity check in
    _normalizeActiveTradesInput :1644-1668. Live caller run-empire-v2.js:1221
    (inert empty Map today). Fix: put identity issues in the shared
    issue-collector so load/updateActiveTrade/set/updateState seal in ONE edit.
M2. HALT CODE MUST BE REGISTERED: haltSymbol refuses codes outside
    AUTHORIZED_SYMBOL_HALT_CODES (:107-112) returning {success:false} (no halt,
    :3210-3218), and unknown persisted codes are silently dropped on load
    (:3160). An unregistered direction-refusal code degrades halt+alert to
    alert-only and evaporates on restart. Spec must name/register the code.
M3. RESIDUAL LIFECYCLE UNDECLARED: corrupt-direction trade has NO working stop
    (stops are synthetic, per-candle, direction-dependent) until manual close;
    re-refusal each candle re-fires haltSymbol + max ntfy (no dedupe, :3220-3238)
    = alert storm; retirement path is existing reconcileBrokerFlat (:1400).
    Spec must state all three.
M4. RESTART ESCALATION: corrupt trade persisted + Batch 1 load gate = next
    restart refuses boot for ALL symbols. ecosystem.config.js has no
    max_restarts for ogz-prime-v2 (:70-91). Same shape as existing scope gate,
    but exit policy makes the state more likely. Batch 1 needs a pre-deploy
    read-only state.json inspection receipt.
M5. BATCH 3 CLASSIFICATION RULE: boundary-backed deletions valid only for
    activeTrades-derived reads; PipelineSnapshot :147/:255 are signal telemetry
    (not trades); broker order/position objects never pass boundaries (correctly
    Batch 2). Also: get('activeTrades') returns live references — in-place
    trade.direction mutation would bypass all boundaries; grep shows zero such
    writers today; make that grep a pre-registered receipt.
M6. NO-DISPOSITION FINDINGS: T1-29 (confidence-as-direction pattern lane —
    biggest miss), T1-10 (ECM phantom contract), T1-3 (min-share promotion),
    T1-4 post-send absorption, T1-24 ($1 fallback), T1-25 (pending Mercury),
    T1-21 (backtest.sh — park under env sweep explicitly), T2-2..T2-11
    (T2-5 ntfy silent drop and T2-3 unknown_effect noise directly underpin this
    spec's own alert channel), T3-4..T3-6, D5/D6 remainders. Every one needs a
    written disposition (batch number or parked-with-reason).

## Sequencing
- Pull the two-field report.config stamp (directionFilter+enableShorts) ahead of
  validation-bearing batches — otherwise Batches 2-5 receipts can't prove which
  filter ran.
- Batch 3 before Batch 4: safe. KrakenAdapterV2 deletion: safe (imported by
  nothing).

## Assumptions flagged (not verified)
Whether checkExitsOnly scheduling compensates T1-25; PnLCalculator caller set
beyond PositionTracker.
