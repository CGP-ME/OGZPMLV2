# Stop 2: active-stock intake, browser and recovery observations

These observations replace the prior acceptance gap that no active stock session had been observed after the native-feed repairs. They do not declare the whole stop complete. The observation began at source `b9df401b`; the separately reviewed card-label repair was then delivered as `254e3a16`. The paper process was not restarted.

## What ran and what it proved

| Observation | Actual result | Limit |
| --- | --- | --- |
| Active Alpaca producer/consumer trace | 940 native events across all five stocks and six frames, from 1m through 4h; zero compared broker/execution identity, symbol/frame, price, candle-end or source-observation mismatches. All source observations classified on time. | No new daily candle event occurred in this window. This is trace correlation, not a new numerical strategy or order audit. |
| Native dashboard history | All 35 stock/frame combinations returned 60 ordered, unique, finite, OHLC-valid bars: 2,100 bars, no validation errors. | Daily history is verified; a new daily close is not claimed. Direct provider comparison of 2,087 closed bars remains the separately recorded November 23 evidence. |
| Authenticated dashboard stream | In 180 seconds, 19 native candle packets across 1m and 5m retained matching envelope/nested/candle identities and values. | The short window cannot establish a fresh update for every higher frame. |
| Both actually served chart implementations | TSLA on v2 and NVDA on legacy each rendered 500 matching native bars for all seven frames: 7,000 compared OHLC rows, zero differences; EMA series advanced during the live window. | Compared with the actual received history/native updates, not a second simultaneous broker fetch. No operator dashboard session was supplied; three 401 console errors per page concern session access. No page exceptions or blocked writes. |
| Natural stock recovery | Recorded 24 coverage-confirmed gap completions, including five replay events totaling nine recovered native candles; sparse ranges also legitimately completed with zero candles. | Counts come from actual production traces. No live fault was deliberately injected. |
| Natural session transitions | November 23 stocks→crypto and November 24 crypto→stocks reached target activation with broker reconciliation, complete hydration and no unavailable/pending pairs. Stock hydration was 35×60; crypto hydration 7×60. Current entries remain unfrozen. | Successful observed transitions do not certify every failure branch or late-callback race; existing isolated ownership receipts cover those controlled cases. |

Machine-readable evidence: [stock trace/recovery summary](stock-runtime-summary.json), [wire validation](wire-validation.json), [wire/config summary](wire-summary.json), [served-browser comparisons](served-browser-summary.json), [source/process/config identity](provenance-and-runtime.json), and [private capture hashes](private-evidence-manifest.json). Raw wire/state/log captures and screenshots remain private.

## Honest timing and observer corrections

The initial log comparison incorrectly required the historical bar's price timestamp to equal the later REST-refresh trigger timestamp. Four observations exposed that mistake. Current producers intentionally retain both clocks: `run-empire-v2.js:937–955,994–995` and `brokers/AlpacaAdapter.js:1245–1271`. The corrected observer compares candle end with candle end, and matches the refresh trigger to its actual same-symbol minute-candle producer. The same fixed byte window then has zero mismatches. [All four observations and matching producer IDs](timestamp-comparison-qualification.json) retain the distinction. The original observer/output is preserved privately; no production timestamp code was changed for this correction.

The first adapted browser observer had a closing-parenthesis syntax error. Its source and error were retained, the observation script was corrected, and the successful run above used the corrected observer. This was not a production defect.

## Silence, reconnect and trading holds

[The reconnect timeline](reconnect-timeline.json) brackets untimestamped transport messages with actual candle trace times; it does not invent exact message timestamps. November 23's reconnect/authentication/replay occurred around scheduled stock retirement. November 24's reconnect authenticated and replayed five subscriptions before the accepted stock-candle sequence above. Fresh delivered bars, rather than authentication alone, establish observed recovery.

The source trace distinguishes three mechanisms:

- `foundation/ResilientWebSocket.js:328,522–528` measures time since any incoming message, emits a stale notification and reconnects. A roughly one-minute silence warning alone does not prove a persistently dead broker connection.
- `core/OrderRouter.js:382–414` relays `brokerTruthUnavailable` without pausing or flattening; no production subscriber was located in the searched runner/router paths. That notification is not evidence of a latched trading hold. Whether a confirmed connection loss reaches the required symbol-scoped fault action remains a focused acceptance question, not authorization to flatten on a heartbeat blip.
- `core/SessionRouter.js:1443–1507` has a separate reconciliation-failure route to latched failed-safe state. No such failure was observed in these successful transitions. Its policy/lifecycle is a source lead, not a newly reproduced outage incident. An opened-but-never-authenticated socket is also an unexercised source lead, not an observed incident.

The original walk explicitly separates a confirmed dead connection from a heartbeat blip (`ogz-meta/inbox/trey/2026-09-03/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:143`). These observations do not erase that remaining acceptance requirement or expand a silence warning into a new global control.

## Display findings and remaining work

The legacy asset card's unfiltered label was a demonstrated defect. Its independent repair, complete review disagreement record, and 300-sample before/after execution are [recorded separately](../stop2-asset-card-identity/RECEIPTS.md). Fresh served-page verification after push retained the selected label and correct mirrored price in all 300 samples, and the 5m control still worked. Existing tabs require reload; no PM2 restart is required for static frontend changes.

The served screenshot then exposed a separate reproducible defect: after COIN→TSLA selection, the legacy hero percentage compared TSLA's $381.76 with COIN's $103.66, reporting +$278.10 (+268.28%). Its inline `lastNum` survives asset changes at `public/unified-dashboard.html:3405–3448`. This is a current display correctness issue, retained for the next atomic repair. It is not an order calculation. V2's separate header shows session-equity P&L and does not share this writer.

Prior verified contracts remain useful: seven native observation frames with five entry-trigger frames, completed-candle decisions, revision replacement, per-symbol/frame storage, native chart rendering, and fixed-range/owner-scoped gap recovery. Reuse their receipts where the source hashes are unchanged instead of rerunning every prior check. The existing split-adjusted dashboard history versus raw bot-history policy remains explicitly distinct; no corporate-action failure was reproduced here. Strategy warnings and order/exit correctness remain later walk work, not certified by chart evidence.

## Preservation and delivery

All four canonical PM2 processes retain their PIDs and restart counts. The 58-file activation manifest differs only in the two deliberately versioned HTML entry points from `254e3a16`; the third card script is separately hashed. All 20 inherited tracked edits remain byte-preserved after excluding this session's own changelog prefixes. Returned configuration stays paper, with 1,397 fields, no unavailable/noncanonical returned owners and matching previously verified configuration identity. This is no new complete credential audit.

Read-only helpers extracted existing receipts and source references; the root agent performed the live observations, checked source claims and authored the sole production repair. No Jest, new broker integration, PM2 restart, environment change, forced transition, trade command or fresh RAG claim. These observation records are documentation-only delivery and need no additional paid review. Stop 2 remains open for the actual remaining price-display and confirmed-loss acceptance questions.
