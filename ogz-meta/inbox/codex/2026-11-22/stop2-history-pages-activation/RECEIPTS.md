# Stop 2 native history pagination: paper activation

Repair `7bc037073eb06a0bc4bd4c8082b0f9eefddb4f9c` is loaded in the approved bot and WebSocket processes. The authenticated public dashboard returned **500 TSLA hourly candles**. Every timestamp and OHLCV field matches the three captured native Alpaca pages, with ascending unique times and no missing bars.

| Receipt | Evidence |
| --- | --- |
| [Preflight](preflight.json) | Source/remote identity, 54 source hashes, paper profile and saved-state counts |
| [Activation command](activation-command.json) | Exact two-process command, canonical environment source and completion time |
| [Final process check](final-process-check.json) | Both targets restarted once; supervisor and Stripe retained their PIDs and restart counts |
| [Native stock comparison](stock-native-comparison.json) | Live 500-bar result compared to actual provider pages of 216, 203 and 81 bars |
| [Dashboard observation](wire-observation.json) | Native histories, 59 live BTC updates on each of seven frames, configuration response and explicit failed history requests |
| [Separate history recheck](history-recheck.json) | Four initially unavailable BTC histories each returned 60 bars when the observer spaced its requests five seconds apart |
| [Bot runtime](runtime-receipt.json), [candle rows](live-candle-receipts.json) | 574 incoming/normalized/processed candle traces, seven frames, zero field/timestamp mismatches |
| [Configuration](config-sources.json) | Settings 24 / internals 15 hashes match disk; 1,397 editable fields have canonical settings ownership |
| [History preservation](history-preservation.json), [startup observation](startup-observation.json) | Saved BTC short restored, prior closed records and append-only journal bytes retained |

The first observation received Kraken `EGeneral:Too many requests` errors for BTC 30m, 1h, 4h and 1d REST history. The dashboard exposed unavailable history; live native updates continued across all seven frames. The later spaced recheck is evidence of recovery, **not a production pacing repair**. The original failure receipt is retained. `kraken_adapter_simple.js:333-342` sends OHLC requests directly, without applying the existing rate limiter. [Kraken's public REST guidance](https://support.kraken.com/gb/articles/206548367-what-are-the-api-rate-limits-) documents a different public-data limit from private account calls. Further producer investigation is the next Stop 2 action.

The 1,277 pre-existing journal files remain present. All 42 append-only files retain their prior bytes; 1,276 total files retain their old byte prefixes. One trade replay JSON snapshot was rewritten while collecting post-exit candles through `core/TradeReplayCapture.js:344-365`; no claim of byte identity is made for that snapshot. All 928 prior closed-trade rows and the saved position's compared immutable fields remain unchanged.

The stock market is closed. These are native historical and live crypto receipts, not live stock-session, rendered-browser, full recovery, complete order/session-fencing or strategy-handoff acceptance. No full Stop 2 closure, sizing repair, new broker order, fresh RAG index or all-role live fingerprint is claimed. Production review belongs to the linked [source repair](../../2026-11-21/stop2-stock-history-pages/RECEIPTS.md); this activation changes no production source.

The detailed narrative is in the accompanying CHANGELOG entry. Raw account state, tokens, log fragments and observer scripts are retained privately and are excluded from this delivery.
