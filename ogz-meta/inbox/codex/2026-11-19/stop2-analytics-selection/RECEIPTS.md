# Stop 2 analytics selection receipts — 2026-11-19

Primary explanation is the matching CHANGELOG entry. The repair uses the chart's existing resolved asset switch as the V2 analytics reset owner.

| Evidence | Receipt |
| --- | --- |
| Initial dropdown defect | [baseline-browser.json](baseline-browser.json) |
| First candidate watchlist defect, independently found then reproduced | [mercury-first-answer.md](mercury-first-answer.md), [watchlist-baseline.json](watchlist-baseline.json) |
| Final browser candidate and served watchlist behavior | [watchlist-candidate.json](watchlist-candidate.json), [watchlist-served.json](watchlist-served.json) |
| Both served pages, dropdowns and attributed live CVD | [served-browser.json](served-browser.json) |
| Final independent review and source identity | [mercury-final-answer.md](mercury-final-answer.md), [review.json](review.json), [source-identity.json](source-identity.json) |
| Visual evidence | [Bitcoin CVD](edge-v2-BTC-USD.png), [TSLA unavailable CVD](edge-v2-TSLA.png) |

The captured checks send only dashboard read/display commands. They do not trade, save settings, restart services, or import trading modules. Private raw outputs and disposable candidate-response files are retained locally and excluded from Git. Unsupported analytics retain their unavailable state. This is an asset-display proof, not acceptance of the entire trading walk.
