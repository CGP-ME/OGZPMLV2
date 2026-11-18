I now have a comprehensive picture of the configuration producer and runtime consumers. Let me compile the final answer.

## Direct Answer

What determines whether a received broker OHLC timeframe is **ingested and considered by MTF confirmation** versus **dispatching an entry decision** is decided in the per-candle broker data handler in `run-empire-v2.js` (lines 949–1051), driven by **two separate config-derived sets** that were split in this change:

- **Observation set** = `orchestrator.mtfTimeframes` → gates ingestion + MTF confirmation.
- **Entry/evaluation set** = `orchestrator.entryTimeframes` → gates entry-dispatch.

The single received OHLC payload is evaluated against both sets and routed accordingly.

---

## Configuration Producer

`config/settings.json` defines the two sets:

- `orchestrator.mtfTimeframes` (lines 3596–3604) = `["1m","5m","15m","30m","1h","4h","1d"]` → **observation** frames.
- `orchestrator.entryTimeframes` (lines 3605–3611) = `["1m","5m","15m","1h","4h"]` → **entry/evaluation** frames. Note `30m` and `1d` are intentionally **observation-only**.

These are loaded at boot via `ConfigLoader.get` (`run-empire-v2.js:697-698`):
- `this.observationTimeframes = ConfigLoader.get('orchestrator.mtfTimeframes')`
- `this.evaluationTimeframes = ConfigLoader.get('orchestrator.entryTimeframes')`

`ConfigLoader.get` traverses the merged config object path-wise, returning `missingValue` (undefined) if a key is absent (`foundation/ConfigLoader.js:2545-2554`).

## Runtime Consumers

**1. The per-candle handler (the decision point)** — `run-empire-v2.js:949-1051`:
- Line 953: `const observationFrame = this.observationTimeframes.includes(tf);`
- Line 954: `const evaluationFrame = this.evaluationTimeframes.includes(tf);`
- Lines 988–989: the candle is **always stored** (`storeTimeframeCandle`, `storeSymbolTimeframeCandle`) regardless of either gate.
- Line 990: `if (observationFrame)` → only then is the candle processed for MTF confirmation (`handleMarketData` at line 1007 → `candleProcessor.handleMarketData`) and closed-candle analysis.
- Line 991: `const closedCandle = evaluationFrame ? confirmedClosedCandleAtBoundary({...}) : null;` → boundary analysis runs **only** for entry frames.
- Line 1014: `if (closedCandle)` → dispatches the **entry decision** via `runTradingCycle` (lines 1019–1023).
- Line 1024: `else if (!evaluationFrame)` → emits `CANDLE_OBSERVATION_ONLY` (observation but not entry).
- Line 1040: `else` (not an observation frame) → dropped as `UNCONFIGURED_TIMEFRAME_DROPPED`.

**2. Broker subscription set** — `core/SessionRouter.js:1646` and `1925`: the router subscribes to `new Set([timeframe, ...this.ctx.observationTimeframes])`. `ctx.observationTimeframes` is the bot's `observationTimeframes`, injected via `SessionRouter.wire(...)` at `run-empire-v2.js:1054` (`ctx = this`; see `SessionRouter.js:145-151`).

**3. MTF confirmation adapter** — `core/StrategyOrchestrator.js:928`: `activeTimeframes: ConfigLoader.get('orchestrator.mtfTimeframes')`; the `MultiTimeframeAdapter` filters these to rank ≥ base (`modules/MultiTimeframeAdapter.js:80-87`). So MTF confirmation considers the full observation set, including `30m`/`1d`.

**4. Hydration/recovery** — `run-empire-v2.js:1870` (boot REST hydration) and `3288` (recovery) iterate `new Set([this.candleTimeframe, ...this.observationTimeframes])`.

## Consistency Findings

**Consistent — entry ⊆ observation.** `entryTimeframes` is a strict subset of `mtfTimeframes` (excludes `30m`, `1d`). Therefore every evaluation frame is also an observation frame and is never dropped by the line-990 gate; the split is internally coherent.

**Inconsistency/divergence #1 — leftover `evaluationTimeframes` consumer.** `core/SessionRouter.js:1398` (inside `_paperStartupRestoreCheck`) still reads `this.ctx.evaluationTimeframes` while the other two subscription sites (1646, 1925) were migrated to `observationTimeframes`. This is a paper-restore *trade-scope* validation, not an OHLC ingestion path, and since entries are only dispatched on evaluation frames, checking trades against the entry set is semantically consistent with how trades are created. It is not a functional break in the OHLC flow, but it is a divergence from the migration pattern and means a persisted trade on a now-observation-only timeframe (e.g., `30m` from pre-split history) would fail restore eligibility.

**Verification gap #2 — active timeframe not guaranteed in the observation set.** `execution.candleTimeframe` = `"15m"` (`config/settings.json:180`) is always added to the subscription set (`SessionRouter.js:1646`), but at runtime it is gated by the line-990 observation check. Currently `"15m"` is in both sets, so no inconsistency is active; if it were ever configured to a value not in `mtfTimeframes`, that timeframe would be streamed by the broker yet dropped/never dispatched.

**Robustness gap #3 — no ConfigLoader defaults.** `ConfigLoader.get` returns `undefined` for a missing key (`foundation/ConfigLoader.js:2550`), which would make `.includes(tf)` throw. The keys exist in `settings.json`, so no active break.

**Note #4 — storage before gate.** Lines 988–989 store every candle, including frames that are subsequently dropped at line 1040; a minor inefficiency, not a correctness defect.

## Candidate Set

Examined: config producer (`settings.json` orchestrator block, `ConfigLoader.get`); runtime consumers (`run-empire-v2.js` boot load, per-candle handler, hydration, recovery, `mtfBaseTimeframe`; `core/SessionRouter.js` subscription sites 1646/1925 and leftover 1398; `core/StrategyOrchestrator.js:928`; `modules/MultiTimeframeAdapter.js` activeTimeframes); CHANGELOG semantics; the three captured diffs. Not fully read: the `candleProcessor.handleMarketData` → strategy-orchestrator → MTF-adapter ingestion wiring (I verified the MTF adapter's *config* but not the complete candle-delivery path), and `tools/backtest-matrix.py:427` (a backtest tool, not runtime).

## VERDICT: no_break_found

The ingestion-vs-dispatch determination is coherent and correctly wired: **observation set (`mtfTimeframes`) gates ingestion + MTF confirmation; entry set (`entryTimeframes`) gates entry dispatch**, and because entry ⊆ observation, no evaluation frame is dropped by the observation gate. The identified items are divergences/robustness gaps, not functional breaks in the OHLC flow.

## ADVERSARIAL_REVIEW_BLOCKING: no

The core mechanism is internally consistent and matches the config split. The line-1398 leftover and the active-timeframe config hazard are documented as verification gaps but do not break the current OHLC ingestion/dispatch behavior given the current `settings.json`.

---

WHAT I DID: Read the three captured diff receipts; read `config/settings.json:3580-3630` and `:180`; `run-empire-v2.js:685-715, 860-920, 920-1065, 1860-1890, 2487-2560`; `core/SessionRouter.js:130-170, 1335-1420, 1630-1670`; `foundation/ConfigLoader.js:2530-2570`; `core/StrategyOrchestrator.js:900-960`; `modules/MultiTimeframeAdapter.js:40-130, 345-365`; `CHANGELOG.md:6250-6280`. Ran grep for `observationTimeframes`, `entryTimeframes`, `mtfTimeframes`, `evaluationTimeframes`, `evaluationFrame`, `observationFrame`, `ctx.evaluationTimeframes`, `activeTimeframes`, `candleTimeframe`; `find_definition` for ConfigLoader and handleMarketData; `find_references` for `new SessionRouter`.

WHAT I DID NOT DO: Did not read the full `candleProcessor.handleMarketData` → orchestrator → MTF-adapter delivery wiring (only the MTF adapter's config). Did not execute the code; all findings are source-derived. Did not read `tools/backtest-matrix.py` usage in depth.

WHAT I ASSUMED: That `ctx` in SessionRouter equals the bot instance (supported by `SessionRouter.js:145-151` and `run-empire-v2.js:1054`); that the config values in `settings.json` are the effective runtime values (no env/profile override of these keys was found).

WHY THIS VERDICT: The two-set split is consistently threaded from config → boot load → per-candle gates → subscription → MTF adapter, and entry ⊆ observation guarantees no evaluation frame is dropped. The only deviations (SessionRouter:1398, active-timeframe membership, missing defaults) do not break the current OHLC flow given current settings.

IF INCOMPLETE, WHY: The complete candle-delivery path from `candleProcessor` into the MTF adapter was not fully traced; that is the one named unread region relevant to "considered by MTF confirmation."
