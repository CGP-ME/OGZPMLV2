# Stop 2: historical hover and current-quote ownership

Both active chart implementations wrote historical OHLC text into `#currentPrice` during crosshair hover. On legacy, the hero parsed the first number as current price, producing a false live price and comparison; the asset card also mirrored that historical text. V2's current-price element had the same mixed ownership, although its independent account-P&L header did not use it.

The source repair removes the historical writes from the two crosshair callbacks in `public/js/chart.js` and `public/js/panels/chart-panel.js`. Existing live-quote and selection-clearing paths remain the current-price writers. The existing floating tooltip retains the hovered candle's timestamp, OHLC and cursor price. Both HTML entry points request the new script versions; the legacy mirror comment no longer describes historical OHLC as a current-price input. No new wrapper, cache, listener, guard, throw, numeric substitute or trading mechanism is added.

## Executed browser proof

[Paired observations](paired-browser.json) loaded the actual served legacy and v2 dashboards in independent baseline/candidate Chromium contexts. Candidate substitution was limited to the exact four proposed files. All contexts authenticated to the live market connection, selected NVDA, obtained 500 native bars and moved the real browser pointer across six historical candles.

- Baseline: all six legacy and all six v2 hovers replaced current-price text with historical OHLC. Legacy hero also showed the historical opening price in all six observations.
- Candidate: all twelve current-price observations retained the actual selected live quote; all six legacy hero values matched the live quote rounded to its existing display precision.
- All twelve candidate tooltips remained visible and matched the selected historical bar's actual OHLC. The source repair preserves historical inspection while correcting the current-price producer.
- No page exception or blocked write command. Operator-session HTTP 401s remain expected observer limitations, distinct from successful market-data authentication.

Observers imported no trading module, blocked HTTP writes and non-read/display WebSocket commands, and used the installed Chromium runtime. No Jest or fabricated broker response was used. Raw scripts, outputs and screenshots remain private with hashes in the evidence manifest. The numerical candle comparison reuses the already verified native chart source; this repair does not recalculate bars or change subscriptions, strategies or order behavior.

## Review and activation

The candidate is pinned in [source-identity.json](source-identity.json), with the inherited Mercury harness identified separately. A single neutral Mercury question covers current-price identity during historical hover across both implementations; it uses 7,750 output tokens and no iteration ceiling. The full [answer](mercury-answer.md) reports `no_break_found`, nonblocking; [review.json](review.json) records run `2026-11-24T17-33-10-690Z-0bddbbac0564`, 19 iterations/52 successful tools and $0.06771865 estimated cost. Only Mercury was selected. It reports 15/16 examined candidates and retains coverage/whole-file/inherited-section metadata warnings. Its incomplete quote-dispatch trace is separately checked by the author at `public/js/core.js:188–204` and by execution of both actual served paths. No inference that every candle source freezes with quote interruption is adopted.

Static frontend activation applies on a fresh page load; existing pages need reload. No PM2 restart or environment change is required. The previously delivered selected-label and cross-asset comparison fixes remain separate atomic changes. Stop 2's confirmed-connection-loss definition is still pending the operator's answer; hover correctness is not evidence that the entire stop or later trading stages are complete.

**Actual served activation:** after applying the exact reviewed files, the observer loaded both public pages without substitution at 2026-11-24T17:34:32.070Z through 2026-11-24T17:34:46.108Z. [The receipt](deployed-browser.json) contains six historical hovers per page: zero current-quote mismatches, zero legacy-hero mismatches and zero tooltip-OHLC mismatches. No page exceptions or blocked writes; the same operator-session HTTP 401 limitation remains. Source/candidate/review hashes match.
