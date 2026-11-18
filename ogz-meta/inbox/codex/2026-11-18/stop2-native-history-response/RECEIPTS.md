# Stop 2: native history responses and retired request path

Base `aec1391bd18a2aeb8bdf7269cd51068abf685777`; reviewed tree `4f929a7506e46a3437ec59a5749835965b361ce5`.
This is the producer follow-up to the native chart consumer repair, not a trading
policy change. All four PM2 services remain on their previous start.

## Cause and changed behavior

`server/stock-data-adapter.js:isStock` previously used credential/config readiness
to decide symbol membership. A configured stock stopped being classified as a
stock when credentials were unavailable. The server relayed it onward, and the
bot's unsupported-equity guard then refused it rather than answering. Separately,
completed stock-history requests returning null/empty data produced only logs at
both server and bot consumers. The fixed membership check uses configured symbols;
the existing fetch boundary checks credentials and reports its actual diagnostic.
Both consumers now send the native history envelope with the original symbol and
timeframe, empty candles and an explicit error when fetching returns no data.
The server also answers a rejected fetch promise while its connection is open.
No candle substitution, local aggregation, new bot halt, throw, default key or
credential read was added. The retired timeframe_change handler/relay is removed;
request_historical is the single supported request message for both pages.

## Executed evidence

The [native fixture](fixtures/native-history.cjs) runs actual stock fetching,
configuration resolution, market-scope functions, server request branch, runner
history methods and bot request handlers in the mandatory isolation launcher.
Only HTTP replies, WS connections and credentials are synthetic. It captures
success, empty provider bars, HTTP 503, network rejection and missing credentials
for all seven frames on both server and runner routes: 70 scenarios.

| Observation | Before | Working tree and staged candidate |
| --- | ---: | ---: |
| Failures without a history response | 56 | 0 |
| Configured stock misclassified when credentials missing | 14 | 0 |
| Successful native OHLCV and zero volume retained | 14 | 14 |
| Canonical request triggers one crypto relay/fetch | yes | yes |
| Retired timeframe_change triggers a relay/fetch | yes | no |

The [before receipt](before-receipt.json), [working-tree receipt](working-tree-receipt.json)
and [candidate receipt](candidate-receipt.json) retain all replies and request
identities. Changed production files and the listed unchanged dependencies
were replaced by their staged source inside the candidate helper; every source
hash matched the pinned tree. The inherited working checkout was exercised
separately. These are executed module/handler captures, not a live broker or full
server-process rehearsal. No Jest was added or run.

## Independent review and qualifications

Mercury returned `no_break_found` for the single neutral question about a
configured stock whose native history cannot be obtained. Read the
[complete answer](mercury-answer.md), [receipt](mercury-receipt.json),
[source identity](review-identity.json), and [manifest](review-manifest.json).
Only Mercury was selected. There was no review execution or multi-model consensus;
our native capture provides the independent execution evidence.

The answer's 'always answered' wording is qualified: these observations cover
completed/rejected requests and an open client connection. An unresolved transport
request, a disconnected client and malformed/unconfigured request inputs are not
claimed verified. No new transport deadline was introduced in this response fix.
The generic rejection catch was inspected; the real HTTP/network/config rejection
paths were executed through the adapter. Server/bot live configuration identity
remains an activation observation, not proven by a shared resolver alone.

The reviewer cited the old `public/unified-dashboard-legacy.html` file as a
possible timeframe_change sender. The server explicitly serves the V2 template
for that URL; the two supported pages import the modules repaired in aec1391b.
Their actual selector callbacks emit one request_historical, proven by the chart
fixture. Reference/design copies remain preserved and are not claimed deleted.
Review coverage warnings/unread areas remain visible, without another paid run
for wording alone.

## Delivery and activation

The diff is four production files: the stock classifier, both response consumers,
and the removed bot request branch. Only the owned server hunk is staged;
its inherited bot-authentication edit remains untouched. One detailed CHANGELOG
entry and supporting receipts accompany the atomic commit/push. No PM2 restart,
environment reload, journal change, broker order or RAG rebuild occurred.
The already-pushed frontend scripts were also fetched read-only from the public
hostname and matched all four source hashes (see served-assets.json).

Stop 2 remains open for activation and real native-frame/browser receipts. Existing
CVD update-volume and indicator-overlay refresh findings remain separate open
items; neither the response capture nor Mercury's verdict certifies them.

## Preflight scope

[Activation preflight](activation-preflight.json) records four unchanged process
identities, paper posture, absence of archived env overrides, and comparison with
the last successful activation. [Config receipt](config-activation-receipt.json)
proves the pre-MTF settings hash equals the last live hash and both new lists come
from settings.json. No PM2 operation has been executed. A restart must still be
approved under ogz-meta/AGENTS.md:79, and position/config/native-frame proof must
be collected afterward.
