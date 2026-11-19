# Stop 2: crypto history broker ownership

The stock-session browser showed BTC-USD history near $28 while the Bitcoin
quote was near $63,000. The exact observation is retained in the preceding
[served browser receipt](../stop2-indicator-refresh/served-browser.json).

The runner's `this.kraken` field follows the active broker. Its historical
crypto request therefore reached Alpaca during the stock session; Alpaca's
`toBrokerSymbol` converted BTC/USD to stock ticker BTC. The response was then
labeled BTC-USD. The repair uses SessionRouter's existing dedicated Kraken
adapter. No active trading broker, connection, profile or symbol is changed.

| Evidence | Receipt |
| --- | --- |
| Baseline wrong broker/instrument, with real runner methods | [baseline.json](baseline.json) |
| Repaired source across broker states, three crypto assets and seven frames | [candidate.json](candidate.json) |
| Isolated executable probe | [broker-owner.cjs](fixtures/broker-owner.cjs) |
| Candidate/base and inherited harness identity | [source-identity.json](source-identity.json) |
| One neutral review question | [review-command.json](review-command.json) |
| Complete independent answer | [mercury-answer.md](mercury-answer.md) |
| Outcome, cost and explicit review limitations | [review.json](review.json) |

All 105 isolated scenarios use the actual request method and symbol normalizer;
only broker transport and socket boundaries are synthetic. A configured Kraken
owner serves crypto regardless of the active session. When no Kraken owner
exists, the response contains the requested symbol/frame, no candles, and an
explicit error. No stock broker is substituted.

Mercury reviewed routing, not network execution. Its observation that scheduled
boot normally supplies a Kraken adapter is conditional on successful configured
boot; missing-owner behavior is separately exercised by the fixture. The Kraken
REST call does not require the stock session's WebSocket subscription, but actual
success through the running bot still requires separate activation and live
receipts. No PM2 restart or fresh RAG rebuild is claimed.
