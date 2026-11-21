I now have a complete picture. Let me compile my findings.

## Direct Answer

When a candle-history request occurs while the market is closed, **both the bot and the dashboard can retrieve up to the full requested `limit` count of the most-recent candles**, because the `start` parameter is now pinned to a fixed early date rather than a computed elapsed-time window. The retrievable history is bounded by two things: the `limit` parameter (bot capped at `maxLimit=10000`, dashboard default 500), and Alpaca's provider-side data retention back to `2016-01-01` (external, unverified in-repo).

### Evidence for the mechanism

**Bot path — `brokers/AlpacaAdapter.js` `getCandles` (lines 663–698):**
- `start: ConfigLoader.getInternalsFileValue('broker.alpacaHistorical.historyStart')` (line 675) — fixed value, no longer `now - lookback`.
- `end: new Date().toISOString()` (line 676), `limit: Math.min(limit, maxLimit=10000)` (line 678), `sort: "desc"` (line 681) → returns most-recent bars; code re-sorts ascending by time (line 693).
- The removed `_historicalLookbackMs` (old lines 1002–1026) computed a bounded elapsed-time window; it is gone.

**Dashboard path — `server/stock-data-adapter.js` `fetchStockCandles` (lines 62–148):**
- `start: ConfigLoader.getInternalsFileValue('broker.alpacaHistorical.historyStart')` (line 85), `end: now.toISOString()` (line 86), `limit: String(limit)` (line 88), `sort: "desc"` (line 91). Returns up to `limit` bars, sorted ascending (line 134).

**Config — `config/internals.json` line 970:** `"historyStart": "2016-01-01T00:00:00.000Z"` under `broker.alpacaHistorical`.

**Consumers (all now receive full counts regardless of closure):**
- Bot streaming refresh: `AlpacaAdapter.js:1209` calls `getCandles(symbol, timeframe, fetchCount)` with `fetchCount = requestedBarFetchCount = 2` (line 1208).
- Bot gap recovery: `core/CandleProcessor.js:746` calls `broker.getCandles(symbol, timeframe, fetchCount)` where `fetchCount = missingCount + buffer` (line 742).
- Bot boot hydration: `run-empire-v2.js:1852` calls `broker.getCandles(symbol, timeframe, hydrationLimit)` (line 1833).
- Dashboard: `run-empire-v2.js:2478` and `ogzprime-ssl-server.js:2037` both call `fetchStockCandles(..., limit, ...)`.

### Why this answers the market-closed question

The old code derived `start` from `now - (intervalMs × limit × multiplier)` (old `stock-data-adapter.js` lines 80–81; old `AlpacaAdapter.js` `_historicalLookbackMs`). Because that window was measured in **elapsed time**, a market closure (weekend/holiday/halt) produced fewer bars than `limit` inside the window — the count was implicitly tied to elapsed time. The fix pins `start` to 2016-01-01, so the API always returns up to `limit` most-recent native bars regardless of how long the market has been closed, as long as the provider retains that history. The code comments state this intent directly: "Market closures do not bound the number of native bars" (`AlpacaAdapter.js:674`) and "Candle count does not determine elapsed time across market closures" (`stock-data-adapter.js:81`).

---

## VERDICT: no_break_found

## ADVERSARIAL_REVIEW_BLOCKING: no

## CANDIDATE SET: examined 6 of 6

1. `brokers/AlpacaAdapter.js` — read current source 640–730, 1190–1220; diff artifact read (48 lines); confirmed start→historyStart at line 675, `_historicalLookbackMs` removed.
2. `server/stock-data-adapter.js` — read full current source 1–262; diff artifact read (22 lines); confirmed start→historyStart at line 85.
3. `config/internals.json` — read 955–990, 1140–1170; diff artifact read (31 lines); confirmed historyStart at line 970, removed lookbackMultiplier/minimumIntradayDays.
4. `core/CandleProcessor.js` — read 680–800; confirmed bot gap-recovery consumer at line 746.
5. `run-empire-v2.js` — read 1820–1865, 2450–2520; confirmed hydration consumer (line 1852) and dashboard consumer (line 2478).
6. `ogzprime-ssl-server.js` — read 2020–2060; confirmed dashboard consumer (line 2037).

## AST EVIDENCE

Tools actually used this run: `read_review_receipt` (3 diff artifacts), `open_file` (current source), `find_references` (fetchStockCandles, getCandles, historyStart), `grep` (lookbackMultiplier, minimumIntradayDays, _historicalLookbackMs), `git_diff` (stock-data-adapter.js). I did not use `serena_blast_radius`/`serena_method_callers` in this run; my caller claims are grounded in `find_references` hits plus direct `open_file` reads of each call site.

## INHERITED

- `server/stock-data-adapter.js` swallows fetch errors and returns `null` (line 146), which the two dashboard consumers convert to an empty-candles error envelope (`run-empire-v2.js:2494-2498`, `ogzprime-ssl-server.js:2050-2060`). This is unchanged by the fix.
- `AlpacaAdapter.getCandles` re-throws on error (line 696); gap-recovery and hydration catch/propagate accordingly.
- The `historyStart` value is shared by both producers via the same `broker.alpacaHistorical.historyStart` key; the dashboard reads it from the broker section rather than `dashboard.stockHistorical` (which no longer carries it). This is a working cross-section read, not a defect.

## FOURTH SHAPE CLASSIFIER: classified 0 of 0

This change adds no new `throw`, guard, gate, or fallback. It replaces a computed `start` value with a config constant. No new bot gates introduced.

## ALLEGATIONS

- **No defect found.** The change achieves its stated goal: decoupling candle count from elapsed time so market closures do not reduce the number of bars returned. I found no repo-internal path where the new code retrieves fewer bars than the old code for a normally-trading symbol.
- **Minor robustness note (not a break, not market-closure related):** the removed `_historicalLookbackMs` normalized a non-numeric/invalid `limit` to `limitDefault` (old lines 1006–1010); the new code applies `Math.min(limit, maxLimit)` (line 678) without that normalization. All current callers pass numeric limits (`requestedBarFetchCount=2`; `missingCount+buffer`; `hydrationLimit` from `dataFeed.bootRestHydrationLimit`), so this is latent, not triggered by any current path.

## SUBSTANTIVE RESOLUTION: none

No substantive dispute; this is an independent first-pass review with no prior reviewer findings in the collection round.

## WHAT I DID

Read all three diff artifacts; read current source for all three changed files (AlpacaAdapter 640–730 & 1190–1220; stock-data-adapter 1–262; internals.json 955–990 & 1140–1170); traced all consumers of `fetchStockCandles` (2 sites) and `AlpacaAdapter.getCandles` (3 sites: streaming refresh, gap recovery, boot hydration); verified removed config keys (`lookbackMultiplier`, `minimumIntradayDays`) and removed method (`_historicalLookbackMs`) have zero remaining references; confirmed the git diff for `stock-data-adapter.js` matches the captured diff.

## WHAT I DID NOT DO

Could not verify Alpaca's actual server-side data retention back to `2016-01-01` or its handling of very old `start` timestamps for each timeframe/feed — this is external behavior with no repo attestation. I did not execute any API call or run tests.

## WHAT I ASSUMED

That Alpaca's `/bars` API honors the `start`/`end`/`limit`/`sort` contract as documented (returns up to `limit` most-recent bars in the range, clamping `start` to the earliest retained bar). This is the standard Alpaca contract but is not proven by repo evidence.

## WHY THIS VERDICT

The repository evidence shows an internally consistent change: a fixed early `start` (internals.json:970) substituted for a bounded elapsed-time window in both producers, with a clean removal of the old lookback logic and config keys (zero residual references), and all consumers passing numeric limits. There is no repo-internal break for the market-closed retrieval scenario; the only unverified factor is Alpaca's external data retention, which is a data-availability question, not a code defect. Therefore `no_break_found`.

## IF INCOMPLETE, WHY

Not incomplete for the repo-internal question. The residual gap is external: Alpaca's actual retention/behavior for a 2016 start date is unverified and would require a live API call or provider documentation, which is outside the read-only repo review.
