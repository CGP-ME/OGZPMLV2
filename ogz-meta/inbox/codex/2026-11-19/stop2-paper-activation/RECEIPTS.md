# Stop 2 paper activation receipts — 2026-11-19

Primary narrative: [CHANGELOG.md](../../../../../CHANGELOG.md), November 19
activation entry. Source commit: `2e944ce7abdc11be70338bf2dc99275acaf7c08c`, plus
the preserved inherited working-source manifest in `runtime-receipt.json`.

| Native BTC frame | Hydrated bars | Live price-candle messages | Closed bars matching direct Kraken REST |
| --- | ---: | ---: | ---: |
| 1m | 60 | 118 | 59 |
| 5m | 60 | 118 | 59 |
| 15m | 60 | 118 | 59 |
| 30m | 60 | 118 | 59 |
| 1h | 60 | 118 | 59 |
| 4h | 60 | 117 | 59 |
| 1d | 60 | 117 | 59 |
| Total | 420 | 824 | 413 |

Live socket collection: 85 seconds through the public WSS endpoint, authenticated
as a dashboard. Commands sent: `identify`, `get_settings`, and sequential
`request_historical` reads. No save-settings, trade, recovery or asset-change
command was sent. Original forming bars were excluded from the later REST
comparison because they can legitimately change between observations.

| Evidence | Receipt |
| --- | --- |
| Fresh source/position/process baseline | [preflight.json](preflight.json) |
| Authorized PM2 command, environment ownership and timing | [activation-command.json](activation-command.json) |
| Four-process status, source hashes, live configuration and decision identity | [runtime-receipt.json](runtime-receipt.json) |
| Public socket messages, frame attribution, settings and stock/crypto history | [dashboard-runtime.json](dashboard-runtime.json) |
| Exact closed-bar OHLCV comparison against Kraken's public REST response | [native-broker-comparison.json](native-broker-comparison.json) |
| Actual dashboard-size TSLA 1m history request | [stock-default-history.json](stock-default-history.json) |
| Restored position followed by its automatic paper stop-loss exit | [paper-exit-receipt.json](paper-exit-receipt.json) |
| Preservation of 620 enumerated history files and 17 trade ledgers | [history-preservation.json](history-preservation.json) |
| Hydration, log classifications and notification limitations | [startup-observation.json](startup-observation.json) |

The initial observer treated absent repeated identity on stock history bars as a
mismatch. The actual consumer scopes the envelope, so the analyzed receipt
separates absence from conflicting identity. It also normalizes both Kraken's
short OHLCV field names and stock bars' long names before hashing their values.
The unmodified first observation, raw socket samples, state, log segments and
inherited worktree diff remain in the local restricted `private/` directory and
are excluded from Git. Public receipts contain counts, market data and hashes.

This proves observed paper activation and native transport. It does not prove a
rendered chart, stock-session streaming, all indicator calculations, notification
delivery, actual venue fees or the remainder of the bot walk. Stop 2 remains open
for the named outstanding requirements in the changelog.
