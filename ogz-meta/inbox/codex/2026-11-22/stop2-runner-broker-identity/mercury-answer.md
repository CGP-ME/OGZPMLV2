I have traced the complete data flow. Let me compile the final answer.

## Investigation Summary

**Question:** How is broker identity preserved from the active SessionRouter callback into the runner candle scope and receipts?

### The preservation mechanism (producer → consumer chain)

**1. Wiring the runner handler into SessionRouter**
- `run-empire-v2.js:1041` — `this.sessionRouter.wire(krakenAdapter, alpacaAdapter, this.orderRouter, ohlcHandler, this);` passes the runner's `ohlcHandler` (defined at `run-empire-v2.js:865`) into the router.
- `core/SessionRouter.js:145-149` — `wire(...)` stores it as `this.onOhlcCallback = onOhlcCallback`.

**2. Resolving broker identity at session activation**
- On each session activation, `_attachActiveOhlcCallback(sessionName, adapter, transitionContext)` runs (`core/SessionRouter.js:1670, 1798, 1872, 1943`).
- It resolves the broker identity via `const brokerId = this._brokerIdFor(adapter, null);` (`core/SessionRouter.js:1223`).
- `_brokerIdFor` (`core/SessionRouter.js:1127-1135`) resolves via `getBrokerName()` first, then `.id`, then `.name`. For the actual adapters, `KrakenIBrokerAdapter.js:127` and `AlpacaAdapter.js:941` implement `getBrokerName()`; the CHANGELOG confirms these adapters "do not define that field" (`.id`), `CHANGELOG.md:41`.
- If no broker identity resolves, `_attachActiveOhlcCallback` throws (`core/SessionRouter.js:1224-1226`) — no silent null is stamped.

**3. Stamping the event inside the fence**
- `_buildOhlcFence(expected)` (`core/SessionRouter.js:1188-1210`) returns the fenced callback that is attached to the adapter: `adapter.on('ohlc', fencedCallback)` (`core/SessionRouter.js:1241`).
- The fence validates the event against the active session/broker/epoch (`_ohlcFenceRejectReason`, `core/SessionRouter.js:1169-1186`); on mismatch it rejects and drops the stale event (`core/SessionRouter.js:1190-1194`).
- On acceptance it stamps the identity onto the event: `event.sessionRouterBrokerId = expected.brokerId;` (`core/SessionRouter.js:1206`), then forwards: `return this.onOhlcCallback(event);` (`core/SessionRouter.js:1208`). This is the *only* invocation of `onOhlcCallback` in the router (grep: lines 134/145/149/1208/1213), so every candle reaching the runner passes through this stamp.

**4. Runner consumes the stamped brokerId in candle scope and receipts**
- `run-empire-v2.js:886` — `CANDLE_INGRESS` receipt uses `brokerId: eventData.sessionRouterBrokerId`.
- `run-empire-v2.js:912` — `getCandleScopeEnvelope({ brokerId: eventData.sessionRouterBrokerId, ... })`.
- Inside `getCandleScopeEnvelope` (`run-empire-v2.js:2254-2313`), `overrides.brokerId` (the stamped value) is the **primary** brokerId source (`run-empire-v2.js:2265`), and is returned in the scope envelope (`run-empire-v2.js:2304`).

### Verdict on the change
The diff replaces the prior `this.sessionRouter?.activeBroker?.id` reads (which returned `null` because the adapters do not define `.id`, per `CHANGELOG.md:41`) with the fence-stamped `eventData.sessionRouterBrokerId` and `getBrokerName()` calls. The producer (`_brokerIdFor` → `getBrokerName()`) and the new consumers (`getBrokerName()` at `run-empire-v2.js:2266, 2900`) are aligned. Broker identity is therefore preserved correctly through the call chain.

### Named gaps / caveats (non-blocking)
- The runner's *fallback* chain inside `getCandleScopeEnvelope` (`run-empire-v2.js:2266`) and `isStockFeed` (`run-empire-v2.js:2900`) now use only `getBrokerName()`, whereas the SessionRouter producer `_brokerIdFor` also falls back to `.id`/`.name`. For the actual Kraken/Alpaca adapters this is moot (they implement `getBrokerName()` and lack `.id`), but a hypothetical `.id`-only adapter would be stamped by the router yet missed by the runner's fallback. This does not affect the candle path because the candle path uses the stamped `overrides.brokerId` directly.
- Other `getCandleScopeEnvelope` call sites (`run-empire-v2.js:1666, 2390, 3343`) do not pass the stamped value and rely on the fallback chain; they are outside the "active SessionRouter callback" path this question asks about.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 3 of 3 known producer/consumer sites for `sessionRouterBrokerId` (producer `core/SessionRouter.js:1206`; consumers `run-empire-v2.js:886` and `:912`), plus the full fence/wire chain (`core/SessionRouter.js:145-149, 1127-1135, 1188-1210, 1212-1243`) and the scope consumer (`run-empire-v2.js:2254-2313`). The diff's other brokerId edits (lines 2266, 2900, 2327-2330, 3844) were reviewed as supporting changes.

AST EVIDENCE: Structure claims (single `onOhlcCallback` invocation, single `adapter.on('ohlc', ...)` attachment, no direct `on('ohlc')` in the runner) are backed by repo-wide literal grep (`onOhlcCallback` → 5 hits, only call at `core/SessionRouter.js:1208`; `sessionRouterBrokerId` → 3 hits total; `on('ohlc'` in runner → 0 hits) plus `open_file` reads of each cited region. I did not run the serena AST tools this session; the claims here are literal-identifier data-flow traces, not caller/dead-code assertions.

INHERITED: The `_brokerIdFor` fallback to `.id`/`.name` (core/SessionRouter.js:1132-1133) is an inherited silent-default path; it is unreachable for Kraken/Alpaca (both implement `getBrokerName()`). The runner's fallback chain (`run-empire-v2.js:2266-2268`) inherits the `_brokerIdForSession` and non-router `config.brokerId` defaults; these only engage when `overrides.brokerId` is absent, which does not occur on the candle path.

ALLEGATIONS: None of a defect. The change is a correctness fix: the prior `.id` reads were broken (adapters lack `.id`), and the new stamped value preserves identity.

SUBSTANTIVE RESOLUTION: none

WHAT I DID: Read the full diff (git_diff + captured receipt lines 1-58); traced `sessionRouterBrokerId` producer (`core/SessionRouter.js:1206`) and both consumers (`run-empire-v2.js:886, 912`) via repo-wide grep; read `wire` (145-149), `_brokerIdFor` (1127-1135), `_buildOhlcFence` (1188-1210), `_attachActiveOhlcCallback` (1212-1243), and `getCandleScopeEnvelope` (2254-2313); confirmed adapter `getBrokerName()` implementations and the CHANGELOG correction note.

WHAT I DID NOT DO: Did not execute any code or tests; did not inspect the actual adapter `getBrokerName()` return values at runtime (relied on source `KrakenIBrokerAdapter.js:127`, `AlpacaAdapter.js:941` and CHANGELOG testimony); did not run serena AST tools.

WHAT I ASSUMED: That the adapters in the active session are Kraken/Alpaca (per `_attachActiveOhlcCallback` call sites at lines 1670/1798/1872/1943), and that their `getBrokerName()` returns stable non-empty strings.

WHY THIS VERDICT: Broker identity is preserved end-to-end: the SessionRouter fence resolves identity via `_brokerIdFor` → `getBrokerName()`, stamps it as `event.sessionRouterBrokerId` on every accepted candle, and the runner reads that exact value for both the `CANDLE_INGRESS` receipt and the candle scope envelope. The single call path (`onOhlcCallback` at `core/SessionRouter.js:1208`) guarantees no unstamped candle reaches the runner. No break found.

IF INCOMPLETE, WHY: Not incomplete for the specific question. The only unread areas are the `.id`-only fallback consistency and non-candle `getCandleScopeEnvelope` call sites, which are outside this question's path and explicitly named as non-blocking notes.
