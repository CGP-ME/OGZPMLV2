# Stop 2: native chart consumer receipts

Source base `092008aad66d3b9a39abb54b1cf82b8b7829a19d`; review candidate tree
`813e1309caa89703a4c652e7d7e122d18011c090`. Authorized continuation of the native seven-frame
Stop 2 repair. Existing five entry triggers and trading decisions are unchanged by
this browser change. Source implementation is prepared outside served files, with
exact candidate bytes replayed in the required isolation launcher before delivery.

## Behavior evidence

The [native fixture](fixtures/native-client.cjs) runs the actual socket message
handler, actual core dispatchers and complete history/update functions from both
served chart modules. It feeds BTC-USD and TSLA across all seven frames, then a
current quote, new native candle, latest-candle revision, older zero-volume
correction, other-symbol/frame messages, old quote and retired delta message.
The [before receipt](before-receipt.json) records the old behavior; the
[candidate receipt](candidate-receipt.json) records all 28 corrected combinations.
Both commands and isolation stderr are in before-run.json and candidate-run.json.
After applying the reviewed bytes to the served files, the [working-tree capture](working-tree-receipt.json)
also exited 0, with matching source hashes and all 28 combinations verified.

| Check | Before mismatches / 28 | Candidate mismatches / 28 |
| --- | ---: | ---: |
| historyMatches | 21 | 0 |
| quoteLeavesCandles | 7 | 0 |
| nativeMatches | 28 | 0 |
| zeroVolumesPreserved | 28 | 0 |
| correctionLeavesQuote | 28 | 0 |
| latestIndicatorVolume | 28 | 0 |
| otherScopesIgnored | 28 | 0 |
| oldQuoteAndDeltaIgnored | 28 | 0 |

The capture uses a 05:00 UTC native start so a one-day candle cannot pass by being
rebucketed to UTC midnight. Candle prices and zero volume must survive exactly.
Older revisions must use setData rather than the library's forward-only update
API; the captured series enforces that constraint. A revision's candle volume is
independent from the latest-frame indicator-volume readout.

Each actual authentication callback plus panel bootstrap now sends exactly one
initial history request (the panel previously sent two). Each actual timeframe
change callback sends one request_historical with both asset and timeframe,
without an additional timeframe_change request. Explicit empty/error history
produces a visible unavailable message. Malformed volume cannot turn into zero;
its history is rejected visibly. Supplied native gaps are retained, and switching
assets clears stored candles, quote presentation and indicator readouts.

## Implementation and removed paths

- Core filters native candles and history against the selected symbol/timeframe
  before chart and indicator mutations. Current-price state is written only by
  matching, timestamped quotes; an older quote cannot rewind it.
- Both charts retain native starts and OHLCV. Quotes paint the current-price HUD,
  while native corrections replace their actual timestamp without local OHLC
  construction or rebucketing. Zero volume survives revisions.
- Removed browser Kraken fetching, price-ratio source substitution, the guessed
  spacing heuristic, local bucket helpers, retired delta state writers, duplicate
  initial request and duplicate timeframe request. Server native identity is the
  source of frame ownership; gaps between broker candles are not grounds to
  relabel or replace them. The now-unused exported spacing helper and its two
  source-string Jest cases demanding the retired behavior are removed. No Jest
  test was added or run.
- Fixed the older dashboard's full-envelope consumer and lexical-this issue.
  Edited history catches report visible rendering failure instead of swallowing
  it. Existing unrelated UI catches are not represented as audited or repaired.
- Both served HTML pages request versioned copies of the changed scripts.
  Authentication and token issuance are untouched.

## Limits and activation

This is actual JavaScript execution with a synthetic DOM, transport and captured
chart-series interface, not a connected browser or canvas screenshot. Oscillator
and overlay mathematics, full-page lifecycle and real broker responses remain
outside this capture. The earlier canonical-display producer receipts cover the
bot's native source and indicator identities separately; this is not a claim of
a single live bot-to-browser trace.

Static assets become available on the next HTTP request when applied, while the
bot and server remain on their existing PM2 start. The seven-frame live backend
requires separately approved activation; Stop 2 remains open until that and a
live browser/broker observation are recorded. No PM2 restart, environment reload,
state deletion, broker order or RAG rebuild occurred during this repair.

The server's stock-history failure path still logs an empty result instead of
replying with the explicit error consumed here. That remaining producer issue is
recorded for the next focused repair. The previous entry records the separate CVD
update-volume issue. Unserved reference/design artifacts are preserved, rather
than deleted as part of the two supported page changes.

## Independent review

Mercury returned `no_break_found` on the scoped OHLCV correction question after
53 successful tool calls, with no failed calls and no execution of its own.
The [complete answer](mercury-answer.md), [review receipt](mercury-receipt.json),
[source identity](review-identity.json) and [manifest](review-manifest.json) are
retained. Estimated run cost was $0.186012. Only Mercury was selected; this is not
a multi-model consensus. No follow-up was spent on metadata wording.

The reviewer named the centralized core routing dependency; current AST/grep
caller checks and the actual core/socket replay exercise that caller. It also
noted stale legacy overlays versus V2 oscillator refresh. These are existing
indicator-display limitations, not repaired or certified by the OHLCV capture.
Whole-file/coverage/inherited-section warnings and an unsupported-reference flag
remain explicit. The answer's 8-of-8 count lists more names than eight, and its
statement that these routing filters are pre-existing is inaccurate: the core
scope filter is new; it selects a chart view and does not control bot entries.
No production throw was added. The independent behavior capture, not the review
verdict, establishes the reported chart results.

The reviewer did not see test artifacts in its pinned source view, which excluded
untracked evidence; the fixture receipts do exist separately and their four
JavaScript hashes match the staged candidate and Mercury source manifest. The
broader live runtime, full renderer and fetch-internals gaps are not called closed.
