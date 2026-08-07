# Directional Fix Spec — Route to Existing Machinery (v2)

Date: 2026-08-06. STATUS: SPINE APPROVED v2 — law for Codex implementation.
v1 approved by Trey in-session 2026-08-04 ("alright focus lets do it") after
correcting the throw-everywhere framing. v2 integrates: Mercury-1 (stale-index,
5 angles), Mercury-2 (fresh-index, 12 sites, zero new angles), the Fable
independent review (M1-M6), and a full receipts pass. PROVENANCE RULE: every
file:line citation in this document was read at head c938697 during the
2026-08-06 receipts pass, except items explicitly tagged [audit-cite] or
[verify-first]. Source findings: ogz-meta/inbox/fable/2026-08-03/
directional-audit-consolidated-findings.md (T1-1..29, T2-1..11, T3-1..8,
D1-D8). Every finding has a disposition in the ledger below. Kimi: FIVE PAID RUNS,
ZERO answers (run 1 temperature 400; runs 2-5 cap-starved at 4096,
finish_reason:length; final curl timeout 280s). Partial findings honestly
harvested from reasoning_content (labeled, no verdict) are folded in below.
Any further Kimi spend is TREY'S CALL ONLY, after the fixed script (>=16K
budget, receipts) is verified — per the no-paid-runs-without-verified-fix
rule. Alternative on record: drop Kimi; its salvaged angles are already
integrated here.

## The rule (the whole spec in three lines — unchanged from v1)

A trade that does not know its direction never trades, never computes, and
never renders on a guess. Every guess-site is deleted and wired into machinery
that already exists. The process never dies because of a bad trade record.

## Path classes (v1 + the M5 classification rule)

- ENTRY paths: unresolved direction -> existing entry-block path (blockReason
  + decision autopsy + DECISION_SKIP trace + ntfy). Loop continues. The
  in-repo template: OrderExecutor.js:2630-2634 (HALT log + ORDER_BLOCKED
  trace + blockedReturn).
- EXIT / ORDER-SENDING paths: never send a guessed order (a guessed exit
  DOUBLES a short — T1-1). Keep the exit intent, halt the symbol via existing
  halt machinery under a REGISTERED code, fire max-priority ntfy so a human
  closes it. Loop continues managing everything else. (Max-priority ntfy is
  the honest path today; normal-priority silently drops on missing
  positionEffect — T2-5, verified NtfyTraceNotifier.js:39/:57/:67 — fixed in
  Batch 4.)
- STATE RESTORE (load): extend the existing refusal gate to also refuse
  direction/action-invalid trades.
- ACCOUNTING/DISPLAY: once the write boundaries are sealed, no direction-less
  trade can exist in activeTrades; read-site guesses are deleted.
- CLASSIFICATION RULE (M5): boundary-backed guess-deletion applies ONLY to
  activeTrades-derived reads. Signal telemetry (PipelineSnapshot.js
  :147/:255/:268/:281 '|| neutral' family) is NOT a trade read — parked to
  the signal-vocabulary pass. Broker order/position objects never pass our
  boundaries — their handling is Batch 2 order-path work, not Batch 3
  deletion.

## Batch 0 — pre-flight receipts + report stamp (NEW; lands before all others)

0a. report.config stamp: write directionFilter + enableShorts (as configured,
    noting enableShorts is currently unenforced per T1-20) into report.config.
    Pulled forward from v1 Batch 6 per Fable sequencing: without it, Batches
    2-5 receipts cannot prove which filter governed a validation run (T1-23).
0b. Read-only state.json inspection receipt (M4): enumerate activeTrades in
    data/state.json; report per-record direction/action validity BEFORE first
    boot under Batch 1. Prevents the restart-escalation surprise: a persisted
    corrupt trade + the new load gate = boot refusal for ALL symbols.
    Receipt held: ecosystem.config.js defines autorestart/max_restarts ONLY
    for ogz-supervisor (:232-233); the ogz-prime-v2 app block (:70+) has
    neither — full-file grep, this pass.
0c. Pre-registered greps, attached to this spec's receipt package:
    - In-place trade-direction writers: full grep this pass returned exactly
      3 hits, NONE on trade records (FibonacciDetector.js:107/:117 mutate a
      fib-levels object; TRAIPatternIntegration.js:152 mutates a dims
      object). The standing guard test (Batch 3) must therefore scope to
      trade objects / activeTrades references, not the bare `.direction =`
      pattern, or it false-positives on day one.
    - PnLCalculator caller census beyond PositionTracker (Fable-flagged
      assumption; governs whether T1-27 dies by fix or by excision).

## Batch 1 — StateManager write boundaries: FIVE doors (was three)

All in core/StateManager.js. openPosition already validates identity at
:840-869 — cleanIdentityText on action and direction, then three coded
refusals (unsupported action, unsupported direction, action/direction
mismatch). Every other door gets the SAME validation through the shared
issues-function pattern so the seal is one edit, not four copies (M1). The
shared primitive exists: _activeTradeQuantityIssuesForTrade is already
consumed by the normalizer (:1656-1664, `issues` collector + coded throw)
and by updateActiveTrade directly (:2061-2064). The edit adds a sibling
identity-issues function into the same collector paths:

1a. load() (:3463-3508): the existing per-trade collection loop validates
    scope (invalidScopeTrades) and quantity; it contains ZERO direction or
    action checks — verified by pattern-absence this pass (T1-7, root
    enabler). Add direction/action/mismatch to the same loop; refuse boot
    with the same reconcile-or-quarantine error shape.
1b. updateActiveTrade() (:1998-2073): quantity invariant throws (:2062-2064),
    container invariant throws (:2039), frozenExitPolicy throws (:2049) —
    identity is never checked, only the BYPASS warn fires (:2014). Same
    identity-issues call the quantity check uses. Callers today: zero live —
    full untruncated grep this pass: OrderExecutor.js:3242 sits inside
    `if (false && decision.action === 'BUY')` (:3239, verified);
    KrakenAdapterV2.js:152 is imported by nothing (verified); the only other
    hit is a string in ogz-meta/pipeline-audit.js. Pure boundary hardening.
    (T1-9.)
1c. openPosition() (:912-925): the trade object literal declares the four
    validated identity fields (id, action, type, direction) FIRST and
    spreads `...stateContext` LAST (:925) — raw caller direction/action
    clobber the enum-checked values. Move identity fields AFTER the spread;
    caller-intended overrides (entryTime etc.) keep working. Kills the
    padded-' short ' defeat. (T1-8.)
1d. set('activeTrades') (:553-557): routes through _normalizeActiveTradesInput
    — identity issues join the collector there. (M1 door 4.)
1e. updateState({activeTrades}) (:737-744): same normalizer, same seal.
    Live caller run-empire-v2.js:1221 passes a fresh empty Map at INIT
    (verified) — zero migration risk. (M1 door 5.)

Boundary tests are table-driven over the malformed-vocabulary space: missing
direction, missing action, missing both (T1-18's absorb case), cross-mismatch
long+SELL_SHORT (T1-19's precedence case), padded ' short ', wrong-case,
'buy'/'sell' in direction slot, 'close'/'none' tokens (T3-6). T1-18 and T1-19
die HERE — a contradictory or double-missing record can no longer exist in
activeTrades; their sites keep defense-in-depth but the disease is sealed at
birth.

## Batch 2 — order-sending guesses (all refusals route to existing machinery)

- OrderExecutor.js:996-1002 — _activeTradeDirection null maps to
  `'COVER' : 'SELL'` else-SELL (verified verbatim); the plan is SENT by
  _flattenAndHaltExitDesync via orderRouter.sendOrder (:1071-1078, verified).
  Refusal = keep exit intent, haltSymbol, max ntfy. (T1-1 core.)
- The open-order matcher complex (T1-1's reconcile half, resolved this
  pass): _openOrderSide (:753-760) returns null on unmatchable side
  vocabulary; its ONLY consumer is the matcher at :778-779 —
  `(!targetSide || side === targetSide)` — so a null side silently fails
  the match and a corrupted-plan targetSide can wrong-side-match. Both
  halves refuse loudly: unmatchable side on a claimed-open order is a
  reconciliation refusal, never a silent drop-from-open-set.
- SessionRouter.js:161-162 else-SELL (verified verbatim); downstream
  flat-check throw :173-176 noted as existing mitigation — the guess still
  dies. (T1-28.)
- Broker-flat parse chain: _brokerPositionSize returns 0 on unparseable
  (:685-691, verified), position filtered at :699 (`> 1e-9`), terminal
  `{ brokerFlatVerified: true }` at :1189 (verified). Parse failure must
  refuse, never report flat. (T1-5.)
- exitFraction coercion :2112-2114 — verified verbatim: anything outside
  (0,1) becomes 1. Refuse outside (0,1]. The unit fallback at :2120 that
  makes the :2121 mismatch check vacuous on persisted trades missing both
  stored units (T2-9) dies in the same edit.
- Min-share promotion :2125-2129 with :446-455 (allowMinimumShare): the
  promotion to full close gets an operator-visible trace — no more silent
  25%->100% (T1-3; cure per audit fix-shape #3).
- Rethrow whitelist :4916 — verified: the regex prefix list is
  CRIT|HIGH|MED|RUN|EXIT|MOD|TRAI|PNLC|RISK|BTR|SESSION|DPS|PS|ORDER.
  EXECUTION and WEBHOOK are absent, so [EXECUTION-FILL] identity throws
  (:1763, verified) and [WEBHOOK-ORDER] throws (:536/:551, verified) are
  absorbed. Also absorbed: the UNPREFIXED post-send throw
  `successful_trade_result_missing_order_id` (:3184, verified verbatim).
  Fix: match the `\[[A-Z-]+-\]` shape or add the missing prefixes AND
  prefix :3184. Post-sendOrder over-fill throws in the :3134-region are
  caught at :3161 and reported as blocked — re-raise + record an
  unreconciled incident. LANDING PAD (Kimi harvest + Fable, named so the
  unrecorded-position problem does not just move up one layer): the re-raise
  surfaces through the existing fail-loud propagation; the incident routes
  to the SAME halt machinery as every other Batch 2 refusal (symbol halted
  under the registered code, max ntfy), and the live-but-unrecorded broker
  position is absorbed by the existing startup broker reconciliation. B2's
  receipt includes a fault-injection probe proving all three. (T1-4, both
  halves, landing named.)
- _findExitTrade tradeId-miss falls back to `trades[0]` (:2079-2083,
  verified verbatim): refuse the exit intent — no matching trade = no
  order, trace loudly. (T2-7.)
- HALT CODE (M2): register `direction_integrity_exit_refusal` in
  AUTHORIZED_SYMBOL_HALT_CODES (:107-112, four codes today — verified) in
  the SAME COMMIT that first uses it. Unregistered codes are refused by
  haltSymbol with `unauthorized_symbol_halt` (:3210-3218, verified verbatim)
  and silently skipped on load (:3160, verified verbatim): without
  registration the halt degrades to alert-only and evaporates on restart.
- RE-FIRE DISCIPLINE (M3): haltSymbol writes the halt unconditionally
  (:3222-3236, verified — no already-halted check). Re-refusal on
  subsequent candles checks the existing halt registry FIRST — halt already
  standing for (symbol, code) => trace-level log only, no repeat haltSymbol,
  no repeat max ntfy. The standing halt IS the signal. No new dedupe system.

## Batch 3 — math/read guess deletion (activeTrades-derived only, per M5)

- StateManager.js four inconsistent-default sites — all verified verbatim:
  getEquity :592-601 (else-branch = SHORT math), closePosition :1236-1237
  and reducePosition :1489 and applyFill :2666-2668 (`=== 'short'` fails =
  LONG math). One degenerate trade, opposite signs across paths. (T1-6.)
- StateManager.js:3784 dashboard projection guess — verified verbatim.
  (T3-1.)
- core/ExitContractManager.js eight `=== 'short' || === 'SELL_SHORT'`
  else-long sites: :312 (verified verbatim), :418, :436, :538, :574, :615,
  :681, :762 [audit-cite for the seven; same file, same pattern]. (T1-14.)
  ProfitExitPlanner :32-44 is the in-repo correct pattern [audit-cite].
- core/BacktestRunner.js:231 and :248 direction-default ternaries —
  verified verbatim; EXPLICIT here (tri-confirmed by Mercury-1, Mercury-2,
  Fable; the load gate does not seal the backtest force-close path).
  Contract routing of windowEndPositions stays in Batch 6. (T1-22 split.)
- core/PipelineSnapshot.js:306/:315 `|| 'long'` — verified verbatim (T3-2
  trade half only).
- core/TradeNarrator.js:668 `|| 'long'` — verified verbatim (T3-3 reachable
  half).
- core/TradingLoop.js:2243 fired-strategy-renders-as-'hold' camouflage —
  verified verbatim; exit confidence `|| 100` phantom certainty
  :1074/:1104/:1483 — verified verbatim — record honest null. (T3-4.)
- Telegram/display: `config.symbol || 'BTC'` :3434/:3656 (verified);
  direction fields carrying action vocab 'BUY'/'SELL_SHORT' :3433/:3655
  (verified). (T3-5 display half.)
- Replacement shape at every site: the boundary invariant ("cannot exist in
  activeTrades without valid direction") plus, where a value is still
  syntactically required, an honest coded refusal — never a default.
- STANDING GUARD TEST: trade-object-scoped in-place-writer scan (from 0c,
  with the Fibonacci/TRAI exclusion rationale recorded in the test) lands
  in the suite here.

## Batch 4 — contract repairs

- core/ExitContractManager.js invalidation switch
  (checkInvalidationConditions, :411+): 9 cases, ZERO default — verified by
  count this pass. Default case refuses unknown-condition loudly; reconcile
  the config/case contract BOTH directions — seven configured conditions
  with no case, all verified verbatim at foundation/ConfigLoader.js:
  liquidity_absorbed :2562, break_retest_invalidated :2584, sr_break :2640,
  pattern_invalidated :2663, fvg_filled + or_break_reversal :2727,
  sweep_absorbed :2748 — each gains a live case or leaves the config.
  PRE-STEP (Kimi harvest): a per-condition disposition table — implement vs
  delete for each of the 7 producer-less conditions AND the 6 case-less
  configs — approved by Trey BEFORE the reconcile commit; a literal
  two-directional reconcile without the table either builds duplicates or
  deletes intended targets. Note the fork Kimi named: T1-13's `=== 'buy'`
  vocabulary bug at :497 dies automatically only under DELETE — if the
  sweep path is IMPLEMENTED instead, the vocabulary must be fixed in the
  same commit. (T1-11; T1-13 folds into this reconciliation.)
- ema_cross_reversal direction-aware (:446-452, verified: detects only
  ema9>ema20 -> ema9<ema20): a golden cross must invalidate a short.
  (T1-12.)
- COVER teardown :4811-4812 — verified verbatim: calls
  patternExitModel.isTracking/endTracking, neither of which is the real
  API; the SELL path's startTracking usage (:3668-3674) and :4320 region
  are the template. (T1-15.)
- TPO override core/TradingLoop.js:1308 — verified verbatim
  (`=== 'BUY' ? 'buy' : 'sell'`): non-'BUY' refuses via entry-block with a
  trace of the override itself — never silently becomes a short. (T1-16.)
- Exit-only no-price :967-970 — verified: _diag-only ('EXIT_ONLY_NO_PRICE');
  the entry path :1170-1194 carries 3 trace/autopsy calls (counted this
  pass). Same trace+autopsy treatment on the exit side. (T1-17.)
- Opposite-position check :1513-1517 (verified verbatim; dup telemetry at
  :430): missing-both falls through to `return false` = not-opposite.
  Backstopped by Batch 1 seal; the check itself stops absorbing. (T1-18
  defense-in-depth.)
- T1-10 exit-time phantom contract — core/ExitContractManager.js:328-331,
  verified verbatim including the writeback
  (`if (!trade.exitContract) trade.exitContract = contract`). [POLICY WORD
  REQUIRED, Parked #4]. Spec'd default: LOUD ADOPT — the default contract
  may be used but the adoption is traced, max-ntfy'd, and stamped on the
  trade record; the silent writeback dies either way. (Refuse-and-halt
  leaves a live position with no exit protection — worse than a loud
  default.)
- T1-29 pattern-lane confidence-as-direction — verified verbatim at
  core/UnifiedPatternMemory.js:1119-1120 (`>= 0.6 ? 'buy' : <= 0.4 ?
  'sell' : 'hold'`); the orchestrator filters only null/neutral (:1796,
  :2216 — verified), so 'hold' passes; core/TradingLoop.js:1870 converts
  unmapped to `{action:'HOLD', confidence:0}` (verified) with zero
  telemetry. [POLICY WORD REQUIRED, Parked #5]. Spec'd default: pattern
  records must carry explicit direction; until they do, the lane's entries
  route to the entry-block path with honest label (lane effectively
  read-only). Mid-band 'hold' gets telemetry — no more mute dead-signal
  candles.
- positionEffect contract: core/PositionEffect.js:25/:32 absorb unknown
  actions into UNKNOWN_POSITION_EFFECT (verified); TradingLoop
  _entryPositionEffect :624-628 stamps UNKNOWN for every 'hold' (verified).
  Unknown action refuses through the existing skip/block machinery with
  honest label; 'hold' gets its own label distinct from unknown_effect so
  the alarm can mean something. (T2-3, T2-4.)
- ntfy: default-to-'unknown_effect' at NtfyTraceNotifier.js:39 fails both
  startsWith gates (:57 open_, :67 close_) — verified — so normal-priority
  open/close notifications silently drop. Becomes loud. (T2-5 — this
  spec's own alert channel depends on it.)
- Bridge vocabulary hole — core/TradeJournalBridge.js:342-345, verified
  verbatim: plain 'sell' (valid short vocab at TradeJournal.js:124,
  verified) maps to null, not COVER. Fix the map. Exit-reason laundering to
  'manual_close' (StateManager.js:329, verified) dies — unknown reasons
  refuse or carry an honest 'unmapped:<raw>' token. (T2-2, T2-10.)
- Null-strategy trades — _activeTradeStrategy fallback chain :1253-1256
  (verified) — no longer bypass same-strategy concurrency caps: refuse
  entry via existing block path. (T2-8.)
- COVER partial-close recorder/proof-logger honesty :4458-4459/:4690-4691 —
  verified verbatim (isPartialClose:false / partialFraction:null hardcoded);
  the SELL path records statePartialClose (:3879, verified). Record real
  values. (T2-6.)
- PEM shadow-feed vocabulary: startTracking fed direction:'buy' (:3449,
  verified) and direction:'sell' (:3670, verified — corrected from the
  audit's :3671) — decision vocab in a position-direction slot; becomes HOT
  the day shadow mode lifts. Fix to direction vocab. (T3-5 contract half.)
- Vocabulary elimination: 'close' direction token at TradingLoop
  :868/:1073/:1481 + OrderExecutor :2142 (all verified verbatim), `|| 'none'`
  render :1686 (verified) — positionEffect owns close semantics. (T3-6.)

## Batch 5 — dead code excise

- core/exit/DynamicTrailingStop.js (D1), core/exit/TrailingStopChecker.js
  + its .backup (D2), core/exit/BreakEvenManager.js dead branches —
  long-only BE formula :111-112 and the :84 riskAmount contradiction, both
  verified — (D3).
- OrderExecutor `if (false && ...)` :3239 (verified) + the coalesce family:
  :3786/:4368 (`?? this._resolveStoredSizeUsd`), :3794/:4376 (`?? 1`
  stateExitFraction — the full-size booker if ever reached), :4012-4014,
  :3088-3090 — all verified present (D4).
- StateManager :992 long-only position>0 warn (verified) and :1270-1278
  clear-all branch (anchor verified) (D6).
- core/ExitContractManager.js producer-less cases remaining AFTER the Batch
  4 contract reconciliation (D7).
- core/PatternBasedExitModel.js evaluateExit + direction machinery incl.
  :105 `|| 'buy'` (verified verbatim) — the guess dies by excision (D5).
- core/TradeNarrator.js:577 fabricated-LONG entered-payload (verified
  verbatim; unreachable lie-by-construction) (T3-3 dead half).
- core/KrakenAdapterV2.js — imported by nothing (verified this pass; safe
  delete).
- Excision receipts: import-grep zero references per deleted module; suite
  green minus intentionally-removed tests. Score drops are allowed; nobody
  softens anything to protect a number.

## Batch 6 — backtest + recorder honesty

- Per-direction metric split in BacktestRecorder getSummary (:566+; no
  split today [audit-cite for the absence]) (T1-23; the config stamp itself
  moved to Batch 0).
- windowEndPositions :242-251 (verified: plain object push — no
  positionEffect field, no contract call) through
  closedTradeDirectionOrNull + assertScopedReportTrades — no trade
  population outside the contracts (T1-22 contract half).
- Recorder size honesty: `(trade.size || trade.sizeUsd || 1)` :187-189 —
  verified verbatim — refuses via recordTrade's existing throw pattern
  (:172-175, verified: the closedTradeDirectionOrNull refusal is the
  in-file precedent) (T1-24).
- Caller-passed positionEffect is re-derived (:263, verified) — cross-check
  against the caller's value; mismatch screams instead of silently
  discarding (T2-11).

## Residual lifecycle of a refused live trade (M3 — stated so nobody is surprised)

A corrupt-direction trade that reaches the Batch 2 refusal path is ALIVE at
the broker with NO working stop (stops are synthetic, per-candle,
direction-dependent) until a human closes it. The standing symbol halt plus
one max-priority ntfy is the entire protection story — which is why the halt
code MUST be registered (M2) and why re-fires are suppressed while the halt
stands (the signal is the halt, not the storm). Retirement path: manual close
at the broker, then the existing reconcileBrokerFlat (:1400, verified)
absorbs the flat. Pre-deploy inspection (0b) exists so this lifecycle starts
from zero known-corrupt records.

## Disposition ledger — every audit finding has exactly one home

T1-1 B2 (incl. the :753/:778-779 matcher complex) | T1-2 B2 | T1-3 B2 |
T1-4 B2 (incl. :3184) | T1-5 B2 | T1-6 B3 | T1-7 B1a | T1-8 B1c | T1-9 B1b |
T1-10 B4[policy#4] | T1-11 B4 | T1-12 B4 | T1-13 B4 (folds into T1-11) |
T1-14 B3 | T1-15 B4 | T1-16 B4 | T1-17 B4 | T1-18 B1(seal)+B4(defense) |
T1-19 B1 (cross-match test case; unbatched in v1 and unflagged by all three
reviews — closed here) | T1-20 PARKED#1 (enableShorts word; stamp-as-
configured lands in B0 regardless) | T1-21 PARKED->ENV-VAR SWEEP (explicit,
per audit follow-up queue; backtest.sh:123-129 exports verified) | T1-22
B3(:231/:248)+B6(contracts) | T1-23 B0(stamp)+B6(split) | T1-24 B6 | T1-25
[verify-first] — flagged-not-confirmed; Mercury-2's category-error pass did
NOT attack it; needs a targeted dispatch before any batch touches it | T1-26
PARKED#3 (PositionTracker word; receipts: instantiated run-empire-v2.js:651,
zero updateActiveTrade calls — both verified; :136 destructuring default,
:153 required-check, :412 `|| 'long'` before PnL — all verified verbatim;
ContractValidator.js:143 side-vocab conflict verified) | T1-27 conditional
on #3: wire=>fix here, excise=>dies with D8; either way the four
`side = 'long'` defaults (:49/:73/:92/:140, verified) and the
invalid-entryPrice `return 0` (:50-53, verified) die; caller census in 0c |
T1-28 B2 | T1-29 B4[policy#5]

T2-1 PARKED#2 (journal word; TradeJournal :272-274/:395-397 refuse-and-null
verified; Bridge :1036 "non-critical" + :1116 "alert only, trading not
paused" verified verbatim) | T2-2 B4 | T2-3 B4 | T2-4 B4 | T2-5 B4 | T2-6 B4
| T2-7 B2 | T2-8 B4 | T2-9 B2 | T2-10 B4 | T2-11 B6

T3-1 B3 | T3-2 B3 (trade sites :306/:315) + PARKED->signal-vocabulary pass
(neutral telemetry :147/:255/:268/:281; :147 verified) | T3-3 B3 (:668) +
B5 (:577) + signal-vocab pass (:427 `|| 'hold'`, verified) | T3-4 B3 |
T3-5 B3 (display) + B4 (PEM feed contract, :3449/:3670) | T3-6 B4 | T3-7
PARKED->learner-repair follow-up (EnhancedPatternRecognition :201/:241
'buy'/'sell' reads verified; doubly dead today, zero runtime effect) | T3-8
B3 (trade-derived :202, verified) + signal-vocab pass (:1130 `|| 'neutral'`
snapshot, verified; booster immune)

D1 B5 | D2 B5 | D3 B5 | D4 B5 | D5 B5 | D6 B5 | D7 B4(reconcile)+B5(excise
remainder) | D8 PARKED#3

## Parked policy calls — Trey's words, nothing lands without them

1. enableShorts: enforce (false blocks 'sell' entries, non-boolean refuses)
   or delete everywhere. Currently decoration echoed into every gate result
   and log (T1-20).
2. Journal write failure: halt new entries or alert-only (T2-1; today the
   bridge says "alert only, trading not paused" — verified verbatim).
3. PositionTracker: wire (with T1-26/T1-27 fixes) or excise (with D8).
   Receipts above, plus session-doc verification: ZERO method calls
   anywhere — excise cost is 2 lines + the module.
4. NEW — T1-10 exit-time missing contract: LOUD-ADOPT default (spec'd) vs
   refuse-and-halt. Loud-adopt keeps exit protection on a live position;
   refuse leaves it naked. The word decides.
5. NEW — T1-29 pattern lane: refuse-until-directional (spec'd; lane
   effectively read-only until pattern records carry direction) vs park the
   lane outright.

## Explicitly rejected (unchanged + two additions)

- New uncaught throws in the hot loop. A crash bomb is not an alarm (298 PM2
  restarts already on the health gate). Throws only where an existing
  caught-throw contract already operates.
- Any new flag, gate system, or config knob. Zero new machinery.
- NEW: any dedupe/aggregation SYSTEM for refusal alerts — the existing halt
  registry check IS the dedupe (Batch 2 re-fire discipline).
- NEW: promoting model reasoning_content or any agent scratchpad into a
  review answer. An empty answer with a receipt is a failed run, never a
  review.

## Receipts pre-registered (the wave is judged by these, per batch)

- B0: stamp visible in a fresh report.config; inspection output attached to
  the Batch 1 PR; both greps' results recorded with command lines and the
  trade-object scoping rationale.
- B1: table-driven identity tests over the full malformed-vocabulary space
  pass at ALL FIVE doors; a direction-less/corrupt record is REFUSED at
  every boundary with a coded reason while the process stays alive; boot
  refusal message is shape-parity with the existing scope refusal; the
  padded ' short ' case and the long+SELL_SHORT cross-match case (T1-19)
  fail loudly at the door.
- B2: a direction-corrupt trade produces ZERO outbound orders; symbol halts
  under the REGISTERED code; the halt survives a restart (the :3160 skip
  never fires for it); exactly ONE max ntfy per (symbol, code) episode;
  exitFraction garbage refuses with the exit intent preserved; the :4916
  whitelist passes a shape test covering EXECUTION-FILL, WEBHOOK-ORDER, and
  the prefixed :3184; post-send over-fill re-raises AND an unreconciled
  incident record exists; broker parse failure can never produce
  brokerFlatVerified; an unmatchable open-order side refuses reconciliation
  loudly; fault-injection immediately post-sendOrder proves the T1-4
  landing pad: process alive, symbol halted under the registered code,
  unreconciled-incident record present, startup reconciliation absorbs the
  live position.
- B3: grep-zero for the named guess patterns at every listed site; per-site
  tests assert honest-refusal/honest-null, never a default; the
  trade-object-scoped no-in-place-writers guard test is green.
- B4: each of the seven ConfigLoader conditions has a live case or is gone
  from config — proven both directions; a golden cross invalidates a test
  short; COVER teardown calls the real PEM API (test asserts the call
  lands); loud-adopt trace present on any default-contract adoption; 'hold'
  label distinct from unknown_effect in traces; normal-priority ntfy with
  missing positionEffect is LOUD; plain-'sell' exits map to COVER in the
  bridge.
- B5: import-grep zero for every excised module; `if (false` grep-zero in
  core/.
- B6: two backtests differing only in direction filter produce
  DISTINGUISHABLE reports; per-direction metrics present; windowEndPositions
  pass the same contracts as every other trade; missing size refuses.

## v1 -> v2 change log (review provenance)

- BacktestRunner :231/:248 named explicitly in B3 [Mercury-1 angle 3;
  re-confirmed Mercury-2; re-confirmed Fable] — the only edit all three
  reviews independently demanded.
- Two additional write doors (set/updateState) folded into B1 via the
  shared issues-function pattern [Fable M1; mechanism verified this pass].
- Halt-code registration made atomic with first use; re-fire discipline via
  existing halt registry [Fable M2, M3; refusal/skip/write sites verified].
- Pre-deploy state.json inspection + restart-escalation note [Fable M4;
  ecosystem receipt now first-hand].
- Classification rule for B3; trade-object-scoped writer guard [Fable M5;
  grep run this pass — 3 hits, none trade records].
- Full disposition ledger — every T/D finding homed, including T1-19 which
  v1 and all three reviews left unbatched [receipts session].
- Config stamp pulled from B6 to B0 [Fable sequencing].
- T1-4 completed: :3134-region/:3161 catch named AND the unprefixed :3184
  throw added to the whitelist fix [receipts pass].
- T1-25 quarantined to [verify-first] — Mercury-2's category-error pass did
  not attack it [receipts session].
- Two new policy words surfaced (#4 T1-10, #5 T1-29) so no batch smuggles a
  policy decision past Trey [Fable M6 + audit].
- KIMI HARVEST INTEGRATED (2026-08-07): its four salvaged findings
  cross-checked — T1-3 and T1-10 were already homed in this v2 (they were
  MISSING only against v1); T1-4's rethrow landing pad is now NAMED with a
  fault-injection receipt; T1-11/T1-13 gained the Trey-approved
  per-condition disposition table pre-step and the :497 delete-vs-implement
  fork. Kimi run history and spend rule recorded in the header.
- RECEIPTS PASS 2026-08-06 corrections over the first v2 draft: real module
  paths everywhere (ExitContractManager, PatternBasedExitModel,
  PositionEffect, EnhancedPatternRecognition at core/; NoWickImbalance at
  modules/; ConfigLoader at foundation/; only D1-D3 live in core/exit/);
  the v1 ":753 unmatchable side" resolved first-hand to _openOrderSide ->
  :778-779 matcher and merged into T1-1's complex; PEM sell-side feed
  corrected :3671 -> :3670; every previously review-sourced receipt
  re-verified first-hand or tagged [audit-cite]; T1-3 cure aligned to the
  audit's operator-visible trace.
