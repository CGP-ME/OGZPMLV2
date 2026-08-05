# Directional Fix Spec — Route to Existing Machinery

Date: 2026-08-04. Approved by Trey in-session ("alright focus lets do it") after
correcting the first draft's throw-everywhere framing. Source findings:
ogz-meta/inbox/fable/2026-08-03/directional-audit-consolidated-findings.md.

## The rule (the whole spec in three lines)

A trade that does not know its direction never trades, never computes, and
never renders on a guess. Every guess-site is deleted and wired into machinery
that already exists. The process never dies because of a bad trade record.

## What "wired into existing machinery" means per path class

- ENTRY paths: unresolved direction -> the existing entry-block path
  (blockReason + decision autopsy + DECISION_SKIP trace + ntfy). Same treatment
  a direction_filter block gets today. Loop continues.
- EXIT / ORDER-SENDING paths: never send a guessed order (a guessed exit
  DOUBLES a short - audit T1-1). Keep the exit intent, halt the symbol via the
  existing halt machinery, fire max-priority ntfy so a human closes it. Loop
  continues managing everything else.
- STATE RESTORE (load): extend the EXISTING refusal gate (scope + quantity
  already refuse with "reconcile or quarantine state.json manually") to also
  refuse direction/action-invalid trades. Same message style, same behavior
  Trey already operates under.
- ACCOUNTING/DISPLAY (equity, snapshots, narrator, dashboard): once the three
  write boundaries below are sealed, no direction-less trade can exist in
  activeTrades; remaining read-site guesses are deleted and replaced with the
  boundary invariant. No new checks scattered through math code.

## The three write boundaries (Batch 1 - this commit)

All in core/StateManager.js. openPosition already validates identity
(action in {BUY,SELL_SHORT}, direction in {long,short}, cross-match) - the
other two doors get the SAME check, plus openPosition's own check is made
un-defeatable:

1. load(): add direction/action/mismatch to the existing invalid-trade
   collection loop; refuse boot with the same reconcile-or-quarantine error the
   scope gate uses. (Closes audit T1-7.)
2. updateActiveTrade(): validate the trade record's identity the same way the
   quantity invariant is validated two lines up. Zero live callers today
   (PositionTracker unwired; OrderExecutor call is inside `if (false)`;
   KrakenAdapterV2 is imported by nothing) - pure boundary hardening.
   (Closes T1-9.)
3. openPosition(): move the four validated identity fields (id, action, type,
   direction) AFTER the `...stateContext` spread so the enum-checked values
   win over raw caller input. Caller-intended overrides (entryTime from market
   timestamp, etc.) keep working - only identity becomes un-clobberable.
   (Closes T1-8.)

Receipt pre-registered for every later batch: a direction-less or
direction-corrupt trade is REFUSED at the boundary it touches, with a coded
reason, while the process stays alive. Verified by focused tests added to the
existing StateManager test file (not a new suite).

## Later batches (each its own commit through the normal loop)

- Batch 2 - order-sending guesses: OrderExecutor:997 null->SELL,
  SessionRouter:161 else-SELL, OrderExecutor:753 unmatchable side,
  exitFraction coercion :2112, rethrow whitelist :4916, broker-flat :685.
- Batch 3 - math/read guess deletion: StateManager 4 sites, ECM 8 isShort
  sites, PatternBasedExitModel:105, PipelineSnapshot, TradeNarrator,
  dashboard :3784.
- Batch 4 - contract repairs: ECM invalidation switch condition contract
  (7 configured conditions with no case), direction-aware ema_cross_reversal,
  COVER teardown nonexistent-API fix, TPO override ternary, exit-only
  no-price visibility, opposite-position corrupt-trade absorption.
- Batch 5 - dead code excise: DynamicTrailingStop, TrailingStopChecker
  (+.backup), KrakenAdapterV2, `if (false)` block, BreakEvenManager dead
  branches, unreachable coalesces, dead ECM cases.
- Batch 6 - backtest honesty: stamp directionFilter/enableShorts into
  report.config, per-direction metric split, windowEndPositions through the
  same trade contracts.

## Parked policy calls (Trey's, not batched until he rules)

- enableShorts: enforce or delete (currently decoration).
- Journal write failure: halt new entries vs alert-only.
- PositionTracker: wire or excise.

## Explicitly rejected

- New uncaught throws in the hot loop. A crash bomb is not an alarm
  (298 PM2 restarts already on the health gate). Throws are acceptable only
  where an existing caught-throw contract already operates (load()'s boot
  refusal, updateActiveTrade's quantity invariant).
- Any new flag, gate system, or config knob. Zero new machinery.
