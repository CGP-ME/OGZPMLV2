# Stop 2: legacy hero price comparison identity

The served legacy dashboard compared different assets' prices after chart selection: COIN→TSLA displayed +$278.64 (+269.40%) in the paired observation. Its inline hero mirror kept an unqualified previous number. It also returned without clearing its displayed price when the canonical chart readout became `--`, retaining the former asset's price during the selection gap.

The one-file repair associates the previous number with the selected symbol. Changing symbol or losing the available quote clears that comparison and its directional styling; an unavailable price is explicitly displayed as `--`. The first valid quote establishes the new comparison baseline. Existing same-symbol arithmetic and sub-cent display threshold remain unchanged. This is a UI state transition, not a trading gate, guessed numeric default or caught execution failure. The actual selector exists before the script (`public/unified-dashboard.html:3066`); no speculative missing-element fallback was added.

## Executed observations

[Paired real-browser results](paired-browser.json) ran independent baseline/candidate contexts against the live authenticated market connection, selecting COIN, TSLA and NVDA for ten seconds each. Only the candidate context substituted the proposed HTML.

- All three baseline first quotes carried cross-asset changes; each selection also retained a stale hero during the unavailable-price interval.
- All three candidate first quotes had no cross-asset delta. All three unavailable intervals cleared the hero and delta. Two observed subsequent same-symbol movements retained correct dollar and percentage arithmetic.
- [Actual served verification](deployed-browser.json), 17:26:43–17:27:17 UTC, repeated the result after applying the exact reviewed source without a browser override. COIN, TSLA and NVDA first quotes were correct; unavailable-display mismatches were zero; two subsequent same-symbol movements calculated correctly.
- No page exceptions or blocked write commands. Operator-session endpoints returned 401 because the observer did not carry that separate session; market-data authentication succeeded.

The observer imported no trading module, permitted only existing read/display WebSocket commands, blocked HTTP writes, and used the existing Chromium installation. It is actual served-page observation, not a Jest result. [Private source/output/screenshot hashes](private-evidence-manifest.json) preserve execution identity without publishing account displays.

## Independent review and qualifications

Mercury reviewed [tree/source identity](source-identity.json) `4c21f6cacecb68c5864cda2de4e3cd61e57ada3c` against `1adf7a92`, one neutral question about this readout's behavior, with 7,750 output tokens and no iteration ceiling. [The complete answer](mercury-answer.md) reports `no_break_found`, nonblocking; [the receipt](review.json) records run `2026-11-24T17-25-08-185Z-eb6c4b53b456`, 20 iterations, 39 successful tools and estimated cost $0.06076804. Only Mercury was selected. Coverage/whole-file/inherited-section metadata warnings and its lack of execution evidence remain explicit.

The reviewer called unavailable-price clearing a minor regression and a silent swallowed quote. The observed producer is the chart's deliberate `--` state during asset selection (`public/js/chart.js:830–840`), and the corrected hero now displays that unavailability instead of another asset's price. No broker error is caught or hidden by this change. The percentage remains a consecutive-price movement, not a claimed daily return.

The reviewer also identified a real separate producer problem: the crosshair's historical-candle branch writes OHLC into `#currentPrice` (`public/js/chart.js:441`), and the hero parser reads its first number. An initial author qualification mistakenly read only the neighboring no-candle branch; the full branch confirmed the finding, and that qualification was corrected before commit, with its prior bytes retained privately. This asset-switch repair does not fix hover ownership. The source-level hover finding is the next atomic repair; no claim of complete dashboard correctness is made here.

## Delivery

Only the inline hero behavior in the legacy HTML changes. V2's independent header shows session-equity P&L and uses a different writer. Existing static-page activation applies on reload; no PM2 restart or environment/position/journal change. The reviewed source, executed candidate and served file have matching hashes. Detailed changelog entry, scoped diff, atomic commit and push deliver this logical correction; inherited work stays separate. Stop 2's confirmed-connection-loss policy question remains pending Trey's clarification.
