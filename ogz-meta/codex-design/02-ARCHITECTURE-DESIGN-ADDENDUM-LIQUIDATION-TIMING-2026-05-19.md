# Codex Architecture Addendum — Phase 1/3 Session-Close Liquidation Timing

**Date:** 2026-05-19
**Scope:** SessionRouter Phase 1 (design) and Phase 3 (SessionTransitionCoordinator implementation)
**Operator-locked WHAT. Codex makes engineering HOW decisions within these boundaries.**

This addendum supersedes Phase 1 Session-Close Timing in `02-ARCHITECTURE-DESIGN.md`.

---

## A. Calendar source: broker, not local code

**Operator-locked requirement:** SessionRouter does not hardcode session boundaries. All session open/close times are read from the broker's authoritative calendar API at runtime.

### For stocks sessions (Alpaca)

- **`/v2/clock` endpoint** — called at session start and every 60 seconds during active session — returns `{ timestamp, is_open, next_open, next_close }`. `next_close` is the source of truth for "when does today's session end."
- **`/v2/calendar` endpoint** — called at startup and at the start of each session — returns array of `{ date, open, close }` for upcoming market days. Used for lookahead planning of future transitions.

### Why broker-sourced, not local

Verified against Alpaca official docs (github.com/alpacahq/alpaca-docs/...clock.md and ...calendar.md):

> "The Calendar API serves the full list of market days from 1970 to 2029... In addition to the dates, the response also contains the specific open and close times for the market days, taking into account early closures."

> "Clock API serves the current market timestamp, whether or not the market is currently open, as well as the times of the next market open and close."

This means Alpaca's API automatically handles:
- Regular days (`next_close` = 16:00 ET)
- Half-day closes (`next_close` = 13:00 ET on day before Independence Day, Black Friday, Christmas Eve)
- Holidays (`is_open` = false, no need to fire SessionRouter)
- Emergency early closures (presidential funerals, weather, technical outages — NYSE has done all of these historically; Alpaca's calendar updates accordingly)
- New holidays (Juneteenth added 2021 — Alpaca's calendar reflected the addition automatically)
- Observed-day rules (Jan 1 on Sunday → observed Monday)

### Why this matters

Current `foundation/MarketCalendar.js` is a hardcoded local calculator that:
- Hardcodes session times (`regular: { start: 9*60+30, end: 16*60 }` at line 47)
- Hardcodes half-day close at 13:00 (line 51)
- Algorithmically computes holidays (3rd Monday of January, last Monday of May, etc.)
- Algorithmically computes half-days (day before July 4 if weekday, Black Friday, Christmas Eve if weekday)

That file has every failure mode of a hardcoded calendar: emergency closures invisible, new holidays require manual code update, algorithmic computation has edge cases, drift from reality. Verified by reading `foundation/MarketCalendar.js:38-198`.

### Disposition of `foundation/MarketCalendar.js`

Two acceptable engineering paths (Codex picks one per quant-firm standard):

**Path A — Repurpose as fallback cache:** MarketCalendar.js stays but becomes ONLY a fallback used when Alpaca API is unreachable. Broker is authoritative when available. SessionRouter always tries broker first, falls back to local cache only on broker failure, logs degraded state, fires watchdog alert.

**Path B — Delete:** MarketCalendar.js removed entirely. SessionRouter requires broker calendar to operate. If broker unreachable, SessionRouter enters SAFE_MODE (no trading, no transitions) until broker recovers.

Path A is more operationally resilient. Path B is cleaner architecturally. Codex picks one.

### AlpacaAdapter implementation

Current AlpacaAdapter (`brokers/AlpacaAdapter.js`) does NOT have `getClock()` or `getCalendar()` methods. Verified by grep — adapter exposes connect, disconnect, getBalance, getPositions, getOpenOrders, place orders, cancel, modify, status, liquidateAllPositions, getTicker, getCandles, getOrderBook, getSupportedSymbols — but no clock/calendar.

Add to AlpacaAdapter as part of Phase 1:

```javascript
async getClock() {
  const response = await axios.get(`${this.baseUrl}/v2/clock`, {
    headers: this._authHeaders()
  });
  return response.data; // { timestamp, is_open, next_open, next_close }
}

async getCalendar(start, end) {
  const params = {};
  if (start) params.start = start;
  if (end) params.end = end;
  const response = await axios.get(`${this.baseUrl}/v2/calendar`, {
    headers: this._authHeaders(),
    params
  });
  return response.data; // [{ date, open, close }, ...]
}
```

Add these to `foundation/IBrokerAdapter.js` interface as optional methods so other broker adapters (Kraken, etc.) can implement equivalents where applicable.

### For crypto sessions

Crypto markets are 24/7. There is no native "session boundary" from a crypto exchange. The bot's crypto session is defined as "active when stocks session is closed."

This means crypto session boundaries are STILL anchored against Alpaca's stocks calendar:

- Crypto session activates at stocks `next_close` + transition completion
- Crypto session deactivates at next stocks `next_open` - 30 minutes (per the 30-min block-new-entries timing in Codex's Phase 1)

No separate crypto calendar source needed. One authoritative calendar (Alpaca) drives both session boundaries.

---

## B. Liquidation timing sequence

All times below are **relative to `next_close` from Alpaca clock API**, not hardcoded clock times.

On a regular day where `next_close` = 16:00 ET, the sequence resolves to 15:49 / 15:54 / 15:59 / 15:59:30. On a half-day where `next_close` = 13:00 ET, the sequence resolves to 12:49 / 12:54 / 12:59 / 12:59:30. On a holiday where `is_open` = false, SessionRouter does not arm — no liquidation sequence fires.

| Time | Phase | Action |
|---|---|---|
| **next_close - 11 min** | **LIQUIDATE_ALL** | Issue normal market sell order on every source-session open position. On regular days this fires ONE MINUTE before NYSE Closing Imbalance Period begins (3:50 PM ET), placing initial fills against the regular continuous trading book with full market-maker participation. |
| **next_close - 6 min** | **WARN_NOT_FLAT** | Check open positions count. If any source-session positions still open, fire warning alert (Discord/dashboard). Liquidation may still be in flight legitimately. This is escalation visibility, not a corrective action. |
| **next_close - 1 min** | **LAST_WARNING** | Final warning fires if any source-session positions still open. Last automated notification before force close. |
| **next_close - 30 sec** | **FORCE_CLOSE** | For any source-session position still open: cancel any pending orders for that position, submit fresh MARKET SELL order with NO slippage limit. Accept any fill the book provides. See section C for rationale. |
| **next_close** | **FINAL_CHECK** | Gate: open source-session positions count == 0. If yes, proceed to SNAPSHOT_SOURCE → UNLOAD_SOURCE → LOAD_TARGET phases. If no, swap aborts to FAILED state. Operator alarm escalates to SMS. |

---

## C. Slippage policy at FORCE_CLOSE: unlimited

**Operator-locked:** at the T-30sec FORCE_CLOSE step, market sell orders are submitted with NO slippage cap, NO retry escalation, NO abort-on-bad-fill. Accept any fill the broker provides.

### Why unlimited

The bot is intraday-only by design. There is no support for carrying positions past session close:

- Exit contracts require an active candle stream to evaluate; candle stream stops at close
- Stop-loss logic requires the trading loop to be running; trading loop stops at close
- After-hours session has no exit logic at all — position would be unmanaged exposure
- Carrying any position into after-hours is the worst possible outcome for an intraday TTP-eval bot

The cost of bad slippage on a TSLA market sell at 3:59:30 PM is bounded — typically a few cents per share even in degraded liquidity. The cost of carrying a position into after-hours is unbounded.

T-30sec FORCE_CLOSE is **the last line of defense.** The bot MUST sell. Slippage is not negotiable, fill must happen at any price the book provides.

### What this looks like in code

```javascript
// At T-30sec FORCE_CLOSE for each still-open position:
await alpacaAdapter.cancelOrder(positionPendingOrderId);  // clear any stale order
await alpacaAdapter.placeSellOrder(
  symbol,
  qty,
  null,           // no limit price = market order
  { 
    type: 'market',
    time_in_force: 'day',
    // NO slippage check, NO max_price, NO retry escalation
  }
);
```

The bot does NOT inspect the fill price after submission. The bot does NOT abort if fill is bad. The bot fires the order and trusts the market.

### Hard caveat

This applies ONLY to T-30sec FORCE_CLOSE during session-end transition. Normal liquidation at T-11min (LIQUIDATE_ALL) uses standard market orders without retry escalation — if those fail, the warnings at T-6min and T-1min escalate visibility, and T-30sec is the hammer. Slippage policy at T-11min/T-6min/T-1min is "normal market order behavior" — Alpaca's standard market order semantics apply. Only T-30sec is the no-questions-asked sell.

---

## D. Open positions == 0 invariant

Already locked in Codex's State Erasure section:

> "Refuse to activate if any source-session trade remains open."

This addendum reinforces: the gate at `next_close` (T-0) checks that source-session positions count == 0. If FORCE_CLOSE at T-30sec did not complete (broker fully down, network partition, etc.), the swap aborts to FAILED state and operator alarm escalates to SMS. Target session does not activate. Bot enters SAFE_MODE.

This is the structural enforcement of the intraday-flat invariant operator has specified throughout the project.

---

## E. Engineering HOW decisions Codex still owns

These are Codex's calls per quant-firm standard, not operator decisions:

- **Polling cadence for `/v2/clock`:** how often during active session does SessionRouter refresh `next_close`. Recommend 60 seconds, but Codex picks.
- **Caching strategy:** `/v2/calendar` lookahead window (1 day, 1 week, 1 month). Codex picks.
- **Retry logic on broker API failure for clock/calendar:** exponential backoff, max retries, when to enter SAFE_MODE. Codex picks.
- **Fallback path on broker calendar unreachable:** Path A vs Path B in section A above.
- **Timer mechanism for liquidation steps:** event-driven scheduler vs polling loop vs cron-style. Codex picks.
- **Concurrency on liquidation orders:** parallel vs sequential. Recommend parallel — each position has its own context, no shared lock needed for sells. Codex picks.
- **Race handling when T-30sec FORCE_CLOSE is in flight at T-0 gate check:** treat as still-open until terminal confirmation from broker. Codex confirms.
- **Alert format details:** Discord webhook payload structure, dashboard banner content, SMS text body. Codex picks.
- **Whether to delete or repurpose `foundation/MarketCalendar.js`:** Path A or B from section A.

---

## F. Verification tests required for Phase 3 implementation

When Codex implements this sequence:

- `grep -n "16:00\|9:30\|hardcoded.*close\|13:00.*half" core/SessionRouter.js` → expect ZERO matches (no hardcoded session times in SessionRouter)
- `grep -n "alpacaAdapter.getClock\|alpacaAdapter.getCalendar" core/SessionRouter.js` → expect non-zero matches
- Paper-mode test: transition stocks → crypto at scheduled close. T-11min sell fires. T-6min/T-1min warnings fire on simulated stuck orders. T-30sec force market sell fires. T-0 gate passes only when positions count == 0.
- Half-day simulation: mock Alpaca clock to return `next_close` = 13:00 ET. Verify liquidation sequence fires at 12:49 / 12:54 / 12:59 / 12:59:30, not at 15:49.
- Holiday simulation: mock Alpaca clock to return `is_open` = false for the target day. Verify SessionRouter does not arm, no liquidation sequence fires.
- Broker API failure simulation: drop `/v2/clock` responses. Verify SessionRouter enters SAFE_MODE (Path B) or falls back to cache (Path A) per Codex's section-A choice, fires watchdog alert.
- Failure-injection: simulate broker reject on T-11min market order. Verify warnings still fire at T-6min and T-1min. Verify T-30sec FORCE_CLOSE attempts fresh order with no slippage check.
- Boundary test: simulate one position still open at T-0. Verify swap aborts to FAILED state. Verify SMS alarm fires.

---

## G. How this addendum lands

Codex updates these locations in the existing design docs:

1. **`02-ARCHITECTURE-DESIGN.md` Session-Close Timing section:** Replace entirely with sections A through D above.
2. **`03-IMPLEMENTATION-SEQUENCE.md` Phase 1 work list:** Add "Add `getClock()` and `getCalendar()` methods to AlpacaAdapter" as Phase 1 work item (not Phase 3). The methods are needed before Phase 3 SessionTransitionCoordinator can be wired.
3. **`03-IMPLEMENTATION-SEQUENCE.md` Phase 3 work list:** Add "Implement broker-calendar-anchored T-11min/T-6min/T-1min/T-30sec escalating liquidation sequence per operator-locked timing in addendum 2026-05-19" as Phase 3 work item.
4. **`03-IMPLEMENTATION-SEQUENCE.md` Phase 3 (or earlier):** Add "Disposition `foundation/MarketCalendar.js` per chosen path (A: fallback cache, B: deletion)" as work item.

Both updates apply as documentation edits, not source-code changes for the design docs themselves. The actual code adds (AlpacaAdapter clock/calendar methods, SessionRouter rewrite) happen during Phase 1 and Phase 3 implementation respectively.

Phase 3 implementation of this sequence happens when Codex reaches Phase 3 in the implementation campaign (post-Apex per current roadmap). The AlpacaAdapter additions in Phase 1 are pre-Apex-safe because they only ADD methods; they don't change existing behavior.

---

## What this addendum corrects from the prior version

The prior version of this addendum (deleted) had two errors:

1. **Slippage policy was buried as "open question for operator" instead of asked in chat.** Now locked: unlimited at T-30sec.
2. **Half-day / holiday handling was punted as "revisit when bot begins trading on early-close calendar days."** That was wrong — bot must handle these from day one regardless of TTP eval window. Now Phase 1 requirement: broker-sourced calendar, no hardcoded close times anywhere.

The timing sequence (T-11min / T-6min / T-1min / T-30sec) is unchanged from operator's locked spec.
