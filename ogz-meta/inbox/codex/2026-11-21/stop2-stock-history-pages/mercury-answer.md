I now have a complete picture. Let me consolidate my findings.

**Candidate inventory (all examined):**
1. `brokers/AlpacaAdapter.js` `getCandles` (bot) — lines 663-709
2. `server/stock-data-adapter.js` `fetchStockCandles` (dashboard) — lines 62-155
3. Config: `alpacaHistorical` (sort=desc, maxLimit=10000, limitDefault=100) and `stockHistorical` (sort=desc, limitDefault=500)
4. Consumers: `run-empire-v2.js:1852,2938`; `AlpacaAdapter.js:1220`; `core/CandleProcessor.js:746`; `run-empire-v2.js:2478`; `ogzprime-ssl-server.js:2037`
5. Baseline (2f6212) of both functions
6. `CHANGELOG.md:11` (historical one-page note)

---

VERDICT: no_break_found

ADVERSARIAL_REVIEW_BLOCKING: no

**Direct answer:** Both the bot and the dashboard now correctly aggregate candle history across multiple Alpaca response pages. When Alpaca returns a `next_page_token`, each implementation re-issues the request with `page_token` and a reduced `limit` (= requested limit minus bars already collected), appends the new page's bars, and repeats until either no `next_page_token` remains or the requested limit is reached. The final arrays are sorted ascending by timestamp.

**Bot — `AlpacaAdapter.getCandles` (lines 663-709):**
- `requestedLimit = Math.min(limit, maxLimit)` with `maxLimit=10000` (line 668; config `config/internals.json:965`).
- Pagination loop at lines 681-695: `do { if (pageToken) { params.page_token = pageToken; params.limit = requestedLimit - bars.length; } ... bars.push(...(response.data.bars || [])); pageToken = response.data.next_page_token; } while (pageToken && bars.length < requestedLimit);`
- Returns `bars.map(...).sort((a,b)=>a.t-b.t)` ascending (line 704).

**Dashboard — `fetchStockCandles` (lines 62-155):**
- `limit` from caller (default 500; config `config/internals.json:1154`), not capped by maxLimit.
- Pagination loop at lines 97-118: identical pattern using `params.set('page_token', ...)` and `params.set('limit', String(limit - bars.length))`.
- Returns candles sorted ascending by time (line 141).

**Why this is correct (trace of multi-page scenarios):**
- The per-page `limit` is set to `requestedLimit - bars.length` on subsequent pages, so the total never exceeds the requested limit; the loop exits when `bars.length >= requestedLimit` so it never overshoots and `limit` never reaches 0 in a live iteration.
- `start`/`end` are fixed before the loop (line 667 and line 82), so pages are consistent across requests.
- Alpaca's `next_page_token` is cursor-based and non-overlapping; appending pages produces a contiguous set, and the final ascending sort normalizes the configured `sort=desc` wire order.

**Key nuance (bot pagination is effectively inert under current config):** `maxLimit=10000` equals Alpaca's documented per-request bar maximum (10,000). Therefore `requestedLimit ≤ 10000` always, so a single request either returns all requested bars or returns exactly `requestedLimit` bars (loop exits because `bars.length >= requestedLimit`). The bot's pagination loop never actually iterates more than once under current config — it is a defensive addition that does not change bot behavior versus the baseline single request. The dashboard's pagination genuinely activates when a client requests `limit > 10000`.

**Competing candidates rejected:**
- *Possible under-return / early-exit bug:* Rejected. The loop exits only when the requested limit is reached or no further page exists; both are correct termination conditions.
- *Possible duplicate/overlap bug:* Rejected — cursor-based pagination is non-overlapping; the code appends each page's bars without re-fetching the prior page.
- *Possible ordering bug:* Rejected. Even though `sort=desc` is configured (config lines 968, 1155), both implementations re-sort ascending by time before returning (lines 704, 141), matching chart expectations.

**Unverified behavior (named):** The actual live behavior of Alpaca's `next_page_token` (that it is non-overlapping and honors a reduced `limit` with fixed `start`/`end`) is not directly verified here — no live API calls were executed. The code's handling is internally consistent with documented Alpaca pagination, but the external API's real-world response semantics are not host-attested in this review.

**Changelog reconciliation:** `CHANGELOG.md:11` ("Stock readers still consume one provider response page… not a universal pagination guarantee") describes an earlier state predating this diff; the current tree's diff (2f6212 → 0b5459c) explicitly adds the pagination loops, so that one-page limitation no longer reflects the current source.

---

CANDIDATE SET: examined 6 of 6
AST EVIDENCE: used `find_references` (fetchStockCandles, getCandles) and `regex_grep` for config keys; `open_file`/`git_show` for exact source lines. No host-provided AST scan receipts were relied upon as authority.
INHERITED: The bot path inherits `maxLimit=10000` cap (config:965); the dashboard path inherits an uncapped `limit` from the caller (`ogzprime-ssl-server.js:2034`, `run-empire-v2.js:2476`). No swallowed errors or silent defaults in the pagination loops; both respect `next_page_token` and stop correctly.
FOURTH SHAPE CLASSIFIER: the only added control flow is the two `do...while` pagination loops (AlpacaAdapter 681-695; stock-data-adapter 97-118), each guarded by `pageToken && bars.length < limit` — correct termination, no new bot gates.
ALLEGATIONS: none of a defect; the change is a correct pagination addition.
SUBSTANTIVE RESOLUTION: none (no substantive dispute; single supported conclusion).
WHAT I DID: read both captured diffs (AlpacaAdapter 59 lines, stock-data-adapter 52 lines); read current source AlpacaAdapter 640-730 & 1200-1230, stock-data-adapter 1-180; read baseline via `git_show` for both functions; read config `internals.json` 962-985 & 1152-1175; examined consumers in run-empire-v2.js (242, 2475-2490), ogzprime-ssl-server.js (2023-2050), core/CandleProcessor.js (735-760); traced `fetchStockCandles`/`getCandles` references; read CHANGELOG 1-32.
WHAT I DID NOT DO: did not execute live Alpaca API calls (cannot verify external `next_page_token` semantics at runtime); did not read the full 1,297-line AlpacaAdapter or 270-line stock-data-adapter files beyond the cited ranges; did not run any tests.
WHAT I ASSUMED: Alpaca's per-request bar maximum is 10,000 and `next_page_token` is cursor-based non-overlapping, per documented API behavior; the final ascending sorts are the intended output ordering.
WHY THIS VERDICT: The pagination logic in both producers is internally consistent and terminates correctly at the requested limit or at the last page; no reachable control-flow defect was found in the pinned candidates or their consumers.
IF INCOMPLETE, WHY: not incomplete for the code-level question; the only gap is unverified live API behavior, which does not change the verdict.
