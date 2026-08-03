# Directional Runtime Audit — Consolidated Findings (Fable Synthesis)

Date: 2026-08-03. Branch: codex/multi-asset-symbol-state @ 496c615e.
Sources: six independent Claude module agents (TradingLoop; OrderExecutor; StateManager+PositionTracker; exit models; backtest+recorder; journal+webhook+orchestrator/telemetry), plus the coordinating session's own sweep. Mercury adversarial pass complete but output pending release from the task file (bridge-blocked); Kimi final synthesis queued behind it.
Status: FINDINGS ONLY. No code changed. Every fix requires Trey's approval.

Doctrine tested: the runtime must be incapable of being silent. Vocabulary contract: decisions speak buy/sell/hold; open trades speak long/short; broker actions speak BUY/SELL/SELL_SHORT/COVER; lifecycle labels are positionEffect open_long/close_long/open_short/close_short/unknown_effect.

## Verdict

The direction-aware plumbing built May-Jul (positionEffect, entry identity gates, direction-aware P&L formulas, webhook action mapping) is real and mostly correct WHEN direction is present and well-formed. The audit found no wrong math in the happy path: every P&L inversion formula, the tier/break-even/trailing layer, and partial-close arithmetic are sign-correct for shorts. The failures are concentrated in one disease: what happens when direction is missing, malformed, or off-vocabulary. There the runtime guesses — and it guesses INCONSISTENTLY (short in one path, long in four others), reaching as far as real order routing. Secondary disease: config surfaces (ENABLE_SHORTS, DIRECTION_FILTER env vars) that read as safety controls and control nothing.

## TIER 1 — Reaches real orders or money math (HOT)

T1-1. OrderExecutor.js:996-997, :1002 — null direction from `_activeTradeDirection` (which correctly returns null on conflict/absence) is mapped `direction === 'short' ? 'COVER' : 'SELL'` → corrupted short gets a SELL exit plan. Consumed by `_flattenAndHaltExitDesync` (:1071-1084) which SENDS the order: the recovery path for corrupt state can double the short it exists to flatten. Also feeds startup `reconcilePersistedExitIntents`: wrong-side match at :779 → stale-intent release while the real COVER is live → duplicate exit. [2 agents]

T1-2. OrderExecutor.js:2112-2114 — exitFraction outside (0,1) silently coerced to 1 (full close). Absolute USD (the Feb-23 4-layer bug's exact signature), NaN, string, negative — all full-close with no throw. The historical bug's landing pad, rebuilt.

T1-3. OrderExecutor.js:2125-2129 with :446-455 — allowMinimumShare promotes floor(fraction×remaining)=0 to 1 share; a 25% partial on a 1-share position executes as 100% close, stateExitFraction recomputed to 1.0, zero warning.

T1-4. OrderExecutor.js:4916 — fail-loud rethrow whitelist regex omits EXECUTION/WEBHOOK/ENTRY prefixes; `[EXECUTION-FILL]` identity throws (:1763-1780) and `[WEBHOOK-ORDER]` throws (:536,:551) are absorbed into `blockedReturn('order_exception')`. :3134/:3161 — broker over-fill throw AFTER successful sendOrder is caught and reported as "Trade blocked": broker holds a live position state never recorded. :3184 unprefixed throw same absorption.

T1-5. OrderExecutor.js:685-691 → :699 → :1189 — unparseable broker position size returns 0 → filtered out → `brokerFlatVerified: true` while the position is open at the venue.

T1-6. StateManager.js — inconsistent direction defaults on the same degenerate trade:
  - :592-601 getEquity: else-branch = SHORT math
  - :1236-1237 closePosition, :1489 reducePosition, :2666-2670 applyFill: `=== 'short'` fails = LONG math
  One direction-less trade gets opposite signs in unrealized vs realized paths; equity and realizedPnL permanently diverge; applyFill writes the wrong sign into the decision ledger itself.

T1-7. StateManager.js:3463-3508 load() — restore gate validates scope + quantity invariants (throws) but never direction/action. Legacy/corrupt state.json boots a direction-less live position straight into T1-6. Root enabler; cross-confirmed by 3 agents (narrator, snapshot, and dashboard-projection findings all ride this).

T1-8. StateManager.js:912-925 — `...stateContext` spread AFTER the validated fields: raw caller direction/action overwrite the trimmed enum-checked values. `' short '` passes validation, stores padded, fails every strict `=== 'short'` downstream. Defeats the :857-870 identity gate.

T1-9. StateManager.js:1998-2073 updateActiveTrade — quantity invariants throw, direction/action unchecked; non-PositionTracker writers get a warn ("BYPASS DETECTED") and proceed. Runtime path to recreate T1-7 without a restart.

T1-10. ExitContractManager.js:328-331 — phantom exit contract at exit time: trade missing exitContract silently receives getDefaultContract AND has it written back. Same class 6f08c82e removed at entry. Entry-side guards verified intact (OrderExecutor.js:2630-2639); the class regrew one layer down.

T1-11. ExitContractManager.js:411-511 — invalidation switch has no default case and silently no-ops unknown conditions. ConfigLoader ships SEVEN condition names with no case (liquidity_absorbed :2562, break_retest_invalidated :2584, sr_break :2640, pattern_invalidated :2663, fvg_filled/or_break_reversal :2727, sweep_absorbed :2748) — those strategies' invalidation exits can never fire, silently. Six ECM cases have no producer (dead both directions).

T1-12. ExitContractManager.js:446-452 — ema_cross_reversal (LIVE for EMASMACrossover) detects only bullish→bearish. A short entered on a death cross is never invalidated by the golden cross that kills its thesis; rides to hard SL.

T1-13. ExitContractManager.js:497 — `trade.direction === 'buy'` inside sweep invalidation: trades carry long/short, never matches; no short-side sweep invalidation exists at all. (Case also unproducible per T1-11 — double-dead.)

T1-14. ExitContractManager default-to-long shape — `=== 'short' || === 'SELL_SHORT'` at :312, :418, :436, :538, :574, :615, :681, :762. Any other spelling of short gets LONG math: winning short reads as pnl<=SL (false instant stop-out) or bleeding short reads as profit (no stop fires). ProfitExitPlanner.js:32-44 (throws on unsupported direction) is the in-repo correct pattern one layer away.

T1-15. OrderExecutor.js:4811-4812 — COVER teardown calls `patternExitModel.isTracking`/`endTracking` — neither exists (real API: activePosition/stopTracking, used correctly by the SELL path :4320). Guard permanently false: short-specific silent no-op; model keeps tracking the dead short.

T1-16. TradingLoop.js:1308 — TPO override `action === 'BUY' ? 'buy' : 'sell'`: any non-'BUY' (lowercase 'buy', 'HOLD', garbage) becomes a short entry. No trace of the override itself.

T1-17. TradingLoop.js:967-973 — exit-only path with no price: `_diag` only (dead unless STRATEGY_DIAG=true). Sub-candle stop-loss protection silently skips during a feed gap. Entry path's equivalent (:1170-1194) traces + autopsies — asymmetric.

T1-18. TradingLoop.js:1513-1517 (dup at :430) — opposite-position check: trade missing BOTH direction and action counts as not-opposite → simultaneous long+short. Contrast :768-774 `_isClosingShort` which throws on the same corruption.

T1-19. TradingLoop.js:771-772 — `_isClosingShort` precedence: contradictory record (direction long + action SELL_SHORT) resolves short → COVER against a long. No consistency cross-check.

T1-20. TradingLoop.js F1 + backtest agent H1 (cross-confirmed) — features.enableShorts is consulted by ZERO lines of enforcement logic repo-wide; echoed into every gate result, autopsy, proof snapshot, and startup log. DIRECTION_FILTER/ENABLE_SHORTS env vars are equally dead: runtime reads only launchProfiles.<PROFILE> via ConfigLoader (:1041, :1045). The two-knob directional config has one live knob, and the knob everyone reads about in .env isn't it.

T1-21. tools/backtest-worker-env.js:342-345,:431 + backtest.sh:123-129 — worker env builder normalizes DIRECTION_FILTER into an env nothing consumes (9bbdad48 fixed normalization of a dead var); backtest.sh exports both vars inertly and prints a banner claiming they took effect; no PROFILE export → paper profile (long_only) actually governs. `./backtest.sh --shorts` runs long-only while saying "Shorts: true". Sweep manifests can record long_only while the worker trades both (profile backtest-all: directionFilter 'both', trading.config.json:415).

T1-22. BacktestRunner.js:231, :248 — window-end force-close: ternary defaults corrupt direction to LONG; :242-272 windowEndPositions carry no positionEffect and bypass closedTradeDirectionOrNull + assertScopedReportTrades — the one trade population outside every contract.

T1-23. BacktestRecorder/Runner — metrics blend directions (getSummary :566-682 has no per-direction split) and the report records NEITHER directionFilter nor enableShorts (report.config :413-429). Two runs under different filters are indistinguishable. A shorts-enabled validation run cannot show shorts losing.

T1-24. BacktestRecorder.js:187-189 — `trade.size || trade.sizeUsd || 1`: missing size records $1 notional, silently flattening a real result.

T1-25. TradingLoop.js:1313-1356 — direction-gate block returns BEFORE the exit-check step: on a gate-blocked decision candle, that cycle's exit evaluation may be skipped for open positions (long_only + sell decision + open long = skipped stop check that candle). FLAGGED NOT CONFIRMED — assigned to Mercury; do not treat as established until attacked.

T1-26. PositionTracker (unwired "Sole Writer" — instantiated run-empire-v2.js:651, zero production call sites):
  - :136 `side = 'long'` destructuring default defeats its own :153 required-check
  - :412 `trade.side || 'long'` immediately before PnLCalculator.calculateNetPnL — production trades carry direction, never side, so the moment this module is wired every short closed through it books sign-inverted P&L while StateManager books the correct sign two lines later
  - ContractValidator.js:143 expects side ∈ {buy,sell}; PositionTracker writes side ∈ {long,short} — the two "sole authority" modules disagree on the same field's vocabulary
  Decision needed: wire it properly (with fixes) or excise it.

T1-27. PnLCalculator.js:49,:73,:92,:140 — `side = 'long'` defaults in all four math primitives; 'SHORT'/'sell'/'SELL_SHORT'/undefined all get long math. :50-53 invalid entryPrice → warn + return 0 (fabricated flat P&L). The amplifier under T1-26.

T1-28. SessionRouter.js:161 — force-close action guess (`else SELL`) for unrecognized trades; mitigated by downstream flat-check throw (:173-176) but routes the wrong action first.

T1-29. UnifiedPatternMemory.js:1119-1120 + StrategyOrchestrator.js:1796,:2216 + TradingLoop.js:1870 — pattern lane derives direction from CONFIDENCE MAGNITUDE (>=0.6 buy, <=0.4 sell, else 'hold'): a well-learned bearish pattern reads 'buy'; the orchestrator's neutral filter passes 'hold' through; a mid-band pattern can win the slot and the loop silently converts the candle to HOLD with zero telemetry (dead signal candle, mute).

## TIER 2 — Silent tolerance / audit-trail corruption

T2-1. TradeJournal.js:272-274,:395-397 — refuse-and-return-null (logged-and-continue). Bridge records a visibility failure and trading continues (TradeJournalBridge.js:1116 "alert only, trading not paused"; :1036 "non-critical"). Journal/state drift accumulates with no halt. Policy decision: is journal completeness halt-worthy?

T2-2. TradeJournalBridge.js:342-345 — exitActionOrNull vocabulary hole: 'sell' is valid short vocab at TradeJournal.js:124 but maps to null here (not COVER); direction-less exits store action:null in visibility-failure audit records.

T2-3. TradingLoop.js:624-628 — 'hold' → UNKNOWN_POSITION_EFFECT stamped into STRATEGY_DECISION/DECISION_SKIP traces every hold candle. The alarm label fires thousands of times a day as noise; an alarm that always rings is no alarm. 'hold' needs its own honest label (or no stamp), reserving unknown_effect for genuine corruption.

T2-4. PositionEffect.js:25,:32 — the mapper absorbs garbage into unknown_effect with no throw; isPositionEffect exported but called by nothing in runtime. [4 agents flagged independently]

T2-5. NtfyTraceNotifier.js:39,:57,:67 — payload missing positionEffect: high-priority prints visible 'unknown_effect' (honest) but normal-priority open/close phone notifications are silently DROPPED (fails both startsWith gates → null).

T2-6. OrderExecutor.js:4458-4459,:4690-4691 — COVER partial closes hardcoded isPartialClose:false/partialFraction:null in recorder + proof logger (comment at :4662 provably stale); SELL path records correctly (:3879). Short partial-close analytics lie.

T2-7. OrderExecutor.js:2079-2083 — _findExitTrade tradeId miss falls back to trades[0] silently at plan level (warn only later, COVER warn further gated).

T2-8. OrderExecutor.js:1253-1259 — null-strategy trades silently excluded from same-strategy concurrency caps → extra entries permitted.

T2-9. OrderExecutor.js:2120 — remainingOrderQuantityUnit fallback chain makes the :2121 unit-mismatch throw vacuous on persisted trades missing both stored units.

T2-10. StateManager.js:329 — unknown exit reasons collapse to 'manual_close' in the decision ledger (vocabulary laundering in the audit record).

T2-11. BacktestRecorder.js:263 vs OrderExecutor.js:3845/:4426 — caller-passed positionEffect ignored, re-derived; a mismatch would be silently discarded (no cross-check scream).

## TIER 3 — Operator-facing lies (cosmetic surface, doctrine violations)

T3-1. StateManager.js:3784 — dashboard projection `direction || (action==='SELL_SHORT' ? 'short' : 'long')` → direction-less short shows long-sign unrealized P&L (a bleeding short renders as a growing win). Reachable via T1-7. [2 agents]
T3-2. PipelineSnapshot.js:306,:315 — `t.direction || 'long'`; :147,:255,:268,:281 — `|| 'neutral'` on signal telemetry.
T3-3. TradeNarrator.js:668 — `|| 'long'` REACHABLE via T1-7: narrator announces "LONG" closing a short, riding the same undefined as the hot math error. :577 — fabricated-LONG in entered-payload (unreachable today, lie-by-construction). :427 — 'hold' decision vocab into signal slot.
T3-4. TradingLoop.js:2243 — dashboard renders a FIRED strategy with broken direction as 'hold' (bug camouflage). :1074,:1104,:1483 — exit confidence `|| 100` records phantom certainty.
T3-5. OrderExecutor.js:3434/:3656 — Telegram `asset: config.symbol || 'BTC'` (TSLA fill announced as BTC); :3433/:3655 direction fields carrying action vocab; :3449/:3671 patternExitModel fed decision vocab ('buy'/'sell') for position direction — becomes HOT if shadow mode is ever off (model compares === 'buy').
T3-6. `direction: 'close'` fifth vocabulary — TradingLoop.js:868,:1073,:1481; OrderExecutor.js:2142 (+ TradingLoop :1686 renders '|| none' as a sixth). [2 agents]
T3-7. EnhancedPatternRecognition.js:201,:241 — reads 'buy'/'sell' from trade records that carry 'long'/'short' → position-context feature always 0; doubly dead (caller never passes lastTrade) — the learner silently never gets the feature.
T3-8. StrategyOrchestrator.js:202 + NoWickImbalance.js:368 — stacked `||` on direction in exit-geometry input (latent); :1130 confluence `|| 'neutral'` snapshot lie (booster immune, recomputes).

## Dead code to excise (doctrine: no dead branches)

D1. core/exit/DynamicTrailingStop.js — entire module unwired; its trail logic is direction-blind (widens on adverse trends). Superseded by ECM:681-693.
D2. core/exit/TrailingStopChecker.js — unwired; plus stray TrailingStopChecker.js.backup file.
D3. BreakEvenManager.js:111-112 — wrong-sign long-only BE helper, zero callers (live short-aware version at ECM:762-763); :84 contradicts its own evaluate().
D4. OrderExecutor.js:3239 — `if (false && ...)` disabled block in hot path; :3786/:4368/:3794/:4376/:4012-4014/:3088-3090 unreachable coalesces (one would book FULL size into P&L if ever reached).
D5. PatternBasedExitModel.evaluateExit + direction machinery — zero hot-path callers (only startTracking/stopTracking used); line 105 `|| 'buy'` is latent until someone wires evaluateExit.
D6. StateManager.js:992 long-only position>0 warn; :1270-1278 unreachable pre-tradeId clear-all branch.
D7. ECM switch cases with no producer: sr_level_broken, pattern_negated, sweep_invalidated, mtf_divergence, rsi2_exit_long, tsm_return_flip.
D8. PositionTracker — wire-or-excise decision (see T1-26).

## Cross-confirmed CLEAN (multiple agents, line-verified)

- All P&L inversion formulas when direction present: StateManager :1244-1253, :1491-1493, :2668-2670, :597-601; fees direction-agnostic.
- Tier/BE/trailing layer sign-correct for shorts: ECM :311-315, :418-424, :428-443, :538-540, :574-605, :615-616, :681-733, :762-771. ProfitExitPlanner exemplary (throws on unsupported direction :32-44).
- Entry identity gate at birth: StateManager :839-870 (modulo T1-8 spread); OrderExecutor entry paths symmetric with hard fails (:2615-2643); 6f08c82e entry guards intact.
- No gate copy-drift: backtest drives the same _directionGateStatus; gate throws on bad filter/direction (:602-607).
- Webhook action mapping correct + throw-guarded (:535-554); executeTrade SUPPORTED_ACTIONS throw (:2361-2365); no order leaves executeTrade with unknown_effect.
- _findExitTrade strict pairing (SELL↔BUY, COVER↔SELL_SHORT) — a SELL structurally cannot close a short (:2074).
- _ledgerDirection proper normalizer with throws (TradingLoop :147-153); _isClosingShort throws on missing side (:768-774).
- recordTrade throws on unresolvable direction (BacktestRecorder :172-175); candle normalization free of direction defaults.
- Strategy modules all emit clean buy/sell/neutral at the boundary (10/10 verified).
- KILL-5 loud in both directions; unknown-direction same-symbol entries fail closed (OrderExecutor :1225-1236).
- TTP webhook outbound-only; no inbound injection surface exists.

## The fix shape ("make the runtime incapable of being silent")

One disease, one cure, applied per site after Trey approves each:
1. Single throwing resolver — `requireTradeDirection(trade)` returning exactly 'long'|'short' or throwing with a coded error — replacing every `=== 'short'` else-long, `|| 'long'`, `|| 'buy'`, ternary-guess site (T1-1, T1-6, T1-14, T1-16, T1-19, T1-22, T1-26/27, T3-1..3).
2. load()/updateActiveTrade validate direction+action with the same gate as openPosition (kills the root enabler T1-7/T1-9); fix the spread order (T1-8).
3. exitFraction: throw outside (0,1] instead of coercing (T1-2); explicit operator-visible trace when minimum-share promotes a partial to full (T1-3).
4. Fix the :4916 prefix whitelist (add EXECUTION|WEBHOOK|ENTRY or match `\[[A-Z-]+-\]` shape); rethrow post-sendOrder over-fill (T1-4).
5. Broker position parse failure → throw, never flat (T1-5).
6. ECM invalidation switch: default case throws unknown-condition; reconcile the config/case contract both directions (T1-11); direction-aware ema_cross_reversal + sweep cases (T1-12/13); contract-missing throw instead of phantom default (T1-10).
7. positionEffectFromAction throws on unknown action; 'hold' gets an honest label distinct from unknown_effect (T2-3/T2-4); ntfy drops become loud (T2-5).
8. enableShorts: enforce it in the gate (false blocks 'sell' entries, non-boolean throws) OR delete the flag everywhere — one or the other, no decoration (T1-20). Feeds env-var sweep.
9. Backtest reports: stamp directionFilter+enableShorts into report.config; per-direction winRate/PF/expectancy split; windowEndPositions through the same contracts (T1-22/23).
10. Kill dead code list D1-D8.
11. Vocabulary: eliminate 'close'/'none' direction tokens; positionEffect already owns close semantics (T3-6).

## Follow-ups queued

- ENV VAR SWEEP (Trey directive 2026-08-03, in his journal): repo-wide round 2 of AUDIT-2026-04-07-ENV-VAR-THEATER — dead/doubled/reversed declarations; .env vs launchProfiles conflicts; scripts exporting vars targets ignore. AFTER directional fixes are buttoned up.
- Mercury adversarial result: pending release from task output file; attack anchors included T1-25 (gate-block exit skip) which needs its confirm/refute.
- Kimi final synthesis (Moonshot API, temperature 0.6) once Mercury's report is in the packet.
