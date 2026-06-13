# Consolidated Platform-Vision Verification Addendum

**Date:** 2026-05-19
**Scope:** Forward-compatibility gaps in current OGZPMLV2 codebase against platform-vision research paper principles.
**Method:** Every finding grep-verified against `OGZPMLV2-rebuild-clean-from-baseline__14_.zip` baseline. No speculation.
**Companion to:** `CODEX-ADDENDUM-LIQUIDATION-TIMING-2026-05-19.md` (calendar source and force-close timing).

This addendum covers findings #1 through #5 from the original 7-principle pass, plus items 8 through 33 from the broader Pass 1 + Pass 2 sweep.

---

## A. REAL bugs catchable tonight (Phase 1 / Phase 3 work)

### A1. Stable intent IDs / client_order_id not plumbed

**Verified at:** `brokers/AlpacaAdapter.js:218-258` (`_placeOrder`)
**Finding:** Order payload contains `symbol`, `qty`, `side`, `type`, `time_in_force`, `limit_price`, `order_class`, `stop_loss`, `take_profit`. NO `client_order_id` field. Alpaca generates its own UUID; we have no way to dedupe a retried submission or look up an order by our internal `tradeId`.

**Fix:** Add `client_order_id` field to `_placeOrder` payload, populated from `options.tradeId` (or generated stable hash if not provided). Same change needed in equivalent paths in Kraken/IBKR/other adapters when they go live.

**Why it matters:** Network blip on order submit causes retry. Without `client_order_id`, retry creates a SECOND order. Two orders fill, double position, violated risk gate. With `client_order_id`, Alpaca rejects the duplicate at the broker.

**Verified against:** Alpaca docs explicitly recommend unique `client_order_id` for distinct strategies on same account.

### A2. Broker order lifecycle states not handled

**Verified at:** `brokers/AlpacaAdapter.js:196, 251, 301-302` (status capture); zero matches for `partially_filled`, `pending_cancel`, `pending_new`, `expired`, `rejected`, `done_for_day` as branching logic anywhere in codebase.

**Finding:** AlpacaAdapter captures raw `status` string and `filled_qty`/`remainingAmount` on order responses. NO consumer branches on specific status values. A `partially_filled` order stuck in that state forever produces no escalation. A `rejected` order returns "submitted ok" upstream because we don't check status type. A `pending_cancel` order can still fill while our code treats it as canceled.

**Fix:** Build a `BrokerOrderStateMachine` that recognizes Alpaca's documented states and routes to appropriate handlers:
- `accepted` / `pending_new` → wait
- `partially_filled` → consume `filled_qty`, continue tracking remainder
- `filled` → terminal, settle position
- `done_for_day` / `expired` → terminal, no more fills
- `canceled` / `rejected` → terminal, no fill
- `pending_cancel` / `pending_replace` → in-flight, don't assume terminal
- `replaced` → swap reference to new order ID
- `liquidation` → broker-initiated close, see A3

**Why it matters:** During force-close at T-30sec, partial fills are the realistic failure mode. Without state-machine handling, the gate at T-0 sees "order exists, status not 'filled'" and aborts to FAILED when it should have seen "filled_qty = full qty, status partially_filled" and proceeded.

### A3. Broker trade_updates stream has zero consumers

**Verified at:** `brokers/AlpacaAdapter.js:436-498` (account stream + trade_updates subscription)
**Finding:** AlpacaAdapter connects to `wss://paper-api.alpaca.markets/stream`, authenticates, subscribes to `account_updates` and `trade_updates`. Receives messages, parses them, fires a callback registered on subscription key `'account'`. **Grep finds ZERO code that subscribes to `'account'` or registers any callback for these events.**

**Finding extends:** This means Alpaca-initiated liquidations, margin calls, position-size violations, partial fills, rejected orders, replaced orders, and all account-side events fire into a callback that nobody listens to. The data hits our process and gets discarded.

**Fix:** Build a `TradeUpdateHandler` that:
- Subscribes to the account stream callback
- For each event type, reconciles against StateManager:
  - `fill` / `partial_fill` → confirm StateManager order state matches
  - `canceled` / `rejected` / `expired` → mark trade closed, no fill
  - `liquidation` → THIS IS CRITICAL: mark trade as broker-initiated-closed, fire alarm
- Maintains a join key between our `tradeId` and Alpaca's `order_id` for the reconciliation lookup (depends on A1 above)

**Why it matters:** Apex's risk engine OR Alpaca's margin engine OR a position-size violation can fire a liquidation that closes our position WITHOUT going through our code. Without trade_updates consumer, StateManager still thinks we own a position that's gone. Subsequent code paths reference a ghost position.

### A4. ExchangeReconciler is Kraken-only

**Verified at:** `core/ExchangeReconciler.js:14-41` (constructor accepts `krakenAdapter`, `setKrakenAdapter` method, all Kraken-named)
**Finding:** Reconciler exists with good architecture — periodic REST poll, drift threshold detection, pause-trading-on-drift. But scoped to Kraken adapter only. **For Alpaca (TTP-eval target), no reconciliation exists between StateManager and Alpaca REST position truth.**

**Additional finding:** Drift thresholds set to `positionPause: 10.0 BTC` and `balancePause: $50,000` with comments "DISABLED THE E-BRAKE!" — operationally these thresholds will never trip in practice.

**Fix:** Generalize ExchangeReconciler:
- Accept any `IBrokerAdapter` instance (not just Kraken-named)
- SessionRouter starts a reconciler instance per active broker adapter
- Per-broker drift thresholds (Alpaca needs USD/share thresholds, Kraken needs crypto thresholds)
- Reset the "E-BRAKE DISABLED" thresholds to sane values before live trading

**Why it matters:** Without Alpaca reconciliation, if StateManager drifts from Alpaca's actual positions (latency, dropped websocket message, side effect from manual trade), we won't detect it until either an order fails or the T-0 gate gates on zero positions that aren't really zero.

### A5. emergencyReset wipes activeTrades with no snapshot

**Verified at:** `core/StateManager.js:861-880` (emergencyReset implementation)
**Finding:** `emergencyReset()` does `activeTrades: new Map()` — REPLACES the Map with a fresh empty one. `updateState({ action: 'EMERGENCY_RESET' })` logs the action but NOT the contents of what was wiped. Previous trade records are dropped from memory entirely.

**Fix:** Before zeroing `activeTrades`, snapshot the current Map contents to disk:
```
/data/state-snapshots/emergency-reset-{timestamp}-{sessionId}.json
```
File contains: full activeTrades Map serialized, balance state, drawdown state, kill switch state, reason for reset, operator action source. Append-only — never overwrite an existing snapshot file.

**Why it matters:** For audit, forensic analysis after a reset, and matching the platform-vision principle "State erasure means active-context erasure, not deleting audit history." Codex's State Erasure section already specifies this ("Snapshot and flush source session state") — current `emergencyReset` violates it.

### A6. KillSwitch is built but unwired

**Verified at:** `core/KillSwitch.js` (1-200) exists and is fully implemented. Grep across ALL of `core/`, `brokers/`, `run-empire-v2.js` for `killSwitch` (case-insensitive) outside `KillSwitch.js` itself returns ZERO matches.

**Finding:** Kill switch module has activate/deactivate/check methods, file-based persistence, reason tracking, timestamps. Zero consumers. Activating the kill switch via any mechanism does nothing — trading continues normally because no code path checks `isKillSwitchOn()`.

**Fix:** Wire `KillSwitch.isKillSwitchOn()` check into:
- `OrderExecutor.executeBuyOrder` and `executeSellOrder` (entry gates)
- `OrderExecutor.exitTrade` paths (CRITICAL: kill switch must NOT block exits — only entries)
- `TradingLoop.analyzeAndTrade` (early-return if kill switch on)
- `StrategyOrchestrator.evaluateSignals` (skip evaluation if kill switch on)

Also: kill switch ACTIVATION should fire force-flat on all open positions, NOT just block new entries (otherwise positions sit unmanaged).

**Why it matters:** This is the safety system that exists specifically for cases where everything else fails. Operator emergency button does nothing right now. Apex margin warning + operator hitting kill switch = trading continues, position grows, Apex liquidates.

### A7. Graceful shutdown does not force-flat positions

**Verified at:** `run-empire-v2.js:1914-1970` (shutdown implementation)
**Finding:** SIGINT/SIGTERM are wired, `bot.shutdown()` clears intervals, removes listeners, closes websockets, saves pattern memory, shuts down TRAI. **Does NOT call `OrderExecutor.liquidateAllPositions()` or any equivalent.** Operator Ctrl+C mid-session exits cleanly leaving Alpaca positions open with no exit logic running.

**Fix:** Add to `shutdown()` BEFORE clearing intervals and websockets:
```
if (this.stateManager && this.orderExecutor) {
  const openTrades = this.stateManager.getActiveTrades();
  if (openTrades.size > 0) {
    console.log(`Shutdown: force-flatting ${openTrades.size} open positions before exit`);
    await this.orderExecutor.liquidateAllPositions('shutdown');
  }
}
```
Position must equal 0 before shutdown proceeds, same invariant as SessionRouter T-0 gate. Add timeout to liquidate (e.g., 30 sec) — if positions can't flatten in time, log emergency state to disk and exit anyway.

**Why it matters:** Same intraday-invariant violation as Codex's session-close design addresses. Operator killing the bot mid-day is the same logical event as scheduled session close: bot must be flat before going dark.

### A8. Bracket order children may not cancel at FORCE_CLOSE

**Verified at:** `brokers/AlpacaAdapter.js:234` (bracket order_class) — AlpacaAdapter supports bracket orders (entry + SL + TP atomically). FORCE_CLOSE design at T-30sec submits market SELL on open positions but does not explicitly cancel bracket children first.

**Finding:** Per Alpaca's documented behavior, a market close on a position protected by bracket children can either: (a) leave children active until one fills, (b) cancel children automatically when the underlying position closes, depending on the bracket's configuration. Without explicit cancel, behavior is undefined for our use case.

**Fix:** At T-30sec FORCE_CLOSE for each position:
1. Query open orders for the symbol
2. Cancel any pending bracket children (stop_loss, take_profit) for the position
3. THEN submit market SELL
4. Verify all child orders are in terminal state before T-0 gate check

**Why it matters:** If we submit market SELL and a stop_loss child also fires concurrently, we may close the position twice (one as a real sell, one as a SHORT). Apex would interpret the inadvertent short as a rule violation.

### A9. FORCE_CLOSE must use position remainingSize, not original size

**Verified at:** `core/MaxProfitManager.js:110-186` (tiered exit logic with `remainingSize`)
**Finding:** MaxProfitManager already implements tiered exits — a position may have hit tier1 (30%) and tier2 (30%) exits, leaving 40% remaining. FORCE_CLOSE at T-30sec must liquidate the REMAINING size, not the original entry size.

**Fix:** Verify `OrderExecutor.liquidateAllPositions` (or equivalent SessionRouter call path) reads `currentPosition.remainingSize` from MaxProfitManager state, not the original `entrySize`.

**Why it matters:** Submitting a market SELL for 100% of entry when only 40% remains creates a SHORT position equal to 60% of original. Same rule-violation risk as A8.

### A10. CandleProcessor uses local MarketCalendar (carries calendar addendum forward)

**Verified at:** `core/CandleProcessor.js:42-46` (`getMarketCalendar()` usage)
**Finding:** CandleProcessor uses the same hardcoded `foundation/MarketCalendar.js` that SessionRouter does. When Codex migrates calendar source to broker-provided (per `CODEX-ADDENDUM-LIQUIDATION-TIMING-2026-05-19.md`), CandleProcessor's `_isExpectedMarketClose` consumer needs to come along.

**Fix:** Either (a) MarketCalendar.js becomes a fallback cache fed by broker-provided times (Path A from calendar addendum), in which case CandleProcessor consumes the cache transparently, or (b) CandleProcessor takes a `MarketCalendarProvider` dependency injection and SessionRouter wires in the broker-backed implementation.

**Why it matters:** Gap detection skips overnight/weekend/holiday gaps using calendar awareness. If calendar diverges from broker reality (half-days, emergency closures), CandleProcessor will treat real market-open candles as gaps OR treat real gaps as expected closures. Either is a data integrity bug.

---

## B. PARTIAL — Real concerns, smaller scope, lower priority

### B1. Single-writer principle not enforced

**Verified earlier in session.** OrderExecutor + BacktestRunner + SessionRouter all write directly to `StateManager.activeTrades`. StateManager has a queue-based mutex (`acquireLock`/`releaseLock`) but direct Map mutations bypass it.

**Status:** Codex's Phase 2 SessionAccountContext design needs single-writer-per-session enforcement, not just per-session partitioning. Send to Codex as a Phase 2 design refinement.

### B2. PID controller has zero output consumers

**Verified at:** `core/OrderExecutor.js:996, 1350` (PID input wired); zero output consumers grepped.

**Status:** Same pattern as KillSwitch — built but unwired. Less critical because PID is adaptive optimization, not a safety system. Adds to "post-eval cleanup" pile.

### B3. 86 direct process.env reads in core/

**Verified by grep.** Operator memory said 12; actual count is 86. Existing Fix 20 and Fix 21 in pending queue address this — Codex should verify scope of Fix 20/21 covers all 86, not just a subset.

### B4. Stuck-order detection missing for normal trading

**Finding:** No setTimeout-based detection for orders pending >30 sec during regular session. Partially addressed by SessionRouter T-6min/T-1min warnings for session-end specifically. **For TTP-eval-only acceptable; for larger position sizes or prop-firm work becomes important.**

### B5. Apex-specific trailing drawdown calculation

**Finding:** `core/DrawdownTracker.js` uses standard peak-from-entry drawdown. Apex's specific trailing-drawdown rules (trails upward by net P&L, never below initial balance) may need an Apex-specific tracker subclass. **Verification needed against Apex docs before TTP eval, not tonight code work.**

---

## C. VERIFIED HOLDING — Already handled, no fix needed

### C1. SingletonLock process-level enforcement
`core/SingletonLock.js` is wired in `run-empire-v2.js:316-320`. PID-based, stale-lock cleanup, file-based persistence. Process-level singleton enforcement works.

### C2. Atomic state writes
`core/StateManager.js:1152` uses `writeJsonAtomic` from `core/AtomicWrite.js` (tmp+rename pattern). State persistence is crash-safe.

### C3. CandleProcessor gap detection
`core/CandleProcessor.js:42-46` has RTH-aware gap detection per `CC-SPEC-RTH-GAP-DETECTION.md`. Distinguishes legitimate closures from real data gaps. Backfill via REST on real gaps.

### C4. Audit infrastructure modules
`DecisionLedgerLogger.js`, `TradeJournal.js`, `TradeJournalBridge.js` all exist. Provide structured logging for decisions and trades.

### C5. Dead config absoluteCapPercent
**Was dead per operator memory; verified now WIRED at `core/OrderExecutor.js:103-106`.** Cap is enforced. No fix needed.

### C6. Tiered exits / scale-out
`core/MaxProfitManager.js` has full tiered-exit logic with configurable fractions. Used in active exit paths.

### C7. Hardcoded secrets
Zero hardcoded credentials in source. All from `process.env`. Good practice.

### C8. Graceful shutdown signal handling
SIGINT/SIGTERM wired. `bot.shutdown()` exists. (Note: shutdown is C8 here but A7 above flags it doesn't force-flat positions — the signal handler works, the cleanup is incomplete.)

---

## D. POST-EVAL PILE — Real but not tonight

### D1. BreakAndRetest hardwired return null
**Operator memory was outdated.** Verified `modules/BreakAndRetest.js:186` returns real signal, not hardcoded null. Update operator memory.

### D2. FairValueGap not registered
**Verified:** `modules/FairValueGapDetector.js` exists; not in StrategyOrchestrator. **Question for operator: intentional or oversight?**

### D3. HTF confirmation
Not built, on operator roadmap.

### D4. Determinism / version tagging on decisions
Zero version/seed/feature-schema tagging on TRAI/orchestrator decisions. Required when promoting backtest patterns to live or selling signal feeds. Roadmap.

### D5. Business-key correlation in logs
Zero scope_key / mode_epoch / intent_id structured logging. Codex's Phase 2 SessionAccountContext naturally introduces this. Roadmap.

### D6. Backtest/live data source parity
Polygon (consolidated tape) vs Alpaca/IEX (single venue). Documented in operator memory as root cause of volume profile mismatches. Roadmap, not a code bug.

### D7. Pattern bank Fort-Knox-grade isolation
Current isolation is per-mode/per-asset-class. Fort-Knox design adds per-(session,symbol,timeframe). Codex Phase 1 shadow + Phase 7 source-of-truth covers it.

### D8. Apex daily loss limit configuration (2.5%)
Code supports daily loss limits; default alert is 3%. Set `DAILY_LOSS_LIMIT=2.5` env before TTP eval. Operator action.

### D9. Clock drift monitoring (FINRA 50ms)
Not implemented. Applies only when YOU are reporting to NYSE. Not in current scope.

### D10. Order modify (cancel-replace) consumers
`modifyOrder` exists in both AlpacaAdapter and KrakenAdapterV2. Zero consumers. Not currently needed (Codex's force-close uses cancel+new-submit, not modify). Future option.

---

## E. How this addendum lands

Codex addresses items A1 through A10 as Phase 1 / Phase 3 work alongside the calendar addendum and the existing pre-eval Fix queue. Sequence recommendation:

**Phase 1 additions (pre-Apex-safe, can land anytime):**
- A1 (client_order_id), A6 (KillSwitch wiring), A7 (shutdown force-flat), A10 (CandleProcessor calendar source)

**Phase 3 additions (with SessionRouter completion):**
- A2 (order state machine), A3 (trade_updates consumer), A4 (broker-agnostic reconciler), A5 (emergencyReset snapshot), A8 (bracket cancel before FORCE_CLOSE), A9 (remainingSize at FORCE_CLOSE)

Items in B section are smaller refinements Codex can address opportunistically during Phase 1-3 work.

Items in C section are verified holding — no work needed but worth Codex confirming nothing in their Phase 1-3 work breaks them.

Items in D section are out of scope for this addendum and tracked separately by operator.

---

## WHAT I DID DO

- Grep-verified every finding against `OGZPMLV2-rebuild-clean-from-baseline__14_.zip` (uploaded 2026-05-19).
- For each finding: cited specific file:line evidence in the bug description.
- For "ALREADY HANDLED" items: verified by grepping the wiring path, not by assumption.
- Read source content for each affected method when finding hinged on behavior (not just naming).
- Cross-referenced operator memory against actual code, finding 1 outdated entry (D1 BreakAndRetest) and 1 verified entry (B2 PID wiring).
- Verified external claims against Alpaca docs (trade_updates event types), NYSE microstructure (closing imbalance period), Akka core docs (single-writer principle).

## WHAT I DID NOT DO

- Did not run any code. All findings are static-grep based.
- Did not verify behavior under live conditions (websocket dropouts, network partitions, broker rate limits).
- Did not enumerate every catch-block in StrategyOrchestrator (8+ exist) to classify which are legitimate vs Fix 7 area; existing Fix 7 in pending queue covers the broken ones.
- Did not audit every config value for live-tradingn applicability (Apex thresholds, daily loss percent values, etc.) — operator action.
- Did not address dozens of cosmetic / minor issues outside the platform-vision principle scope (file naming, dead imports, TODO comments, etc.).
- Did not verify Codex's parallel research-paper extraction. Operator will compare both outputs and adjudicate disagreements.
- Did not write code patches. Every fix in this addendum is described conceptually; Codex implements per quant-firm-standard engineering HOW.

## WHAT I ASSUMED

- Operator's pre-eval Fix queue (Fix 7, 8, 9, 18, 20, 21, 25) will land regardless of this addendum. This addendum does not duplicate or override those Fixes.
- Codex retains engineering HOW for implementation choices (timer mechanisms, retry policies, alert payload formats, polling cadences).
- "Catchable tonight" means Codex can incorporate these findings into Phase 1 / Phase 3 design before implementation begins. It does NOT mean all of these implementations land tonight.
- The new zip baseline is representative of the live VPS code state. If VPS has diverged (uncommitted changes, recent commits not in zip), findings may have shifted. Codex grep-verifies against live VPS, not the zip, before implementing.
- Items in section D (post-eval pile) are tracked separately and don't need a separate addendum tonight.
- Codex's parallel platform-vision extraction will surface overlapping findings. Disagreements between Codex's list and this list require adjudication — operator decides which interpretation is correct or runs additional grep-verification.
