# Stop 2: configured stock history and native-value comparison

The authenticated public dashboard returned all **35 configured symbol/timeframe pairs**, with **60 candles each, 2,100 total**. All **2,087 candles already closed at their dashboard observation** match a later direct Alpaca response exactly on timestamp, open, high, low, close and volume. This establishes the observed historical delivery and closed-bar values; it does not close active stock-session acceptance.

The configured symbols are TSLA, NVDA, COIN, MARA and RIOT. Each was requested at 1m, 5m, 15m, 30m, 1h, 4h and 1d through the existing `request_historical` dashboard interface. The [180-second observation](wire-observation.json) has no unavailable responses, observer errors or pending requests. [Validation](history-validation.json) confirms ordered, unique integer timestamps, finite OHLCV, valid OHLC bounds and nonnegative volume for every returned bar.

The running source route is `ogzprime-ssl-server.js:2026-2052` -> `server/stock-data-adapter.js:62-149`. Its provider interval names are `server/dashboard-stock-stream-config.js:3-10`; the adapter requests native Alpaca bars and maps their fields into the dashboard response. [Source hashes](runtime-status.json) for these three files and both canonical config files match the earlier activation manifest. No source or config was changed for this observation.

## Independent provider comparison

The direct observation made one successful Alpaca historical-bars GET for each of the 35 pairs, selecting the same configured IEX feed and split adjustment. Credentials were read privately from `.env`; no credential was printed or published. The observer imports filesystem, hashing, dotenv and network primitives, not trading modules. Original provider responses and exact command/script hashes are identified in the [private evidence manifest](private-evidence-manifest.json).

The [raw comparison](native-comparison.json) is preserved with exit code 1 and `complete: false`: 28 complete response sets matched exactly, while seven sets had 19 field differences. It would be wrong to erase that result or label all 2,100 bars an exact simultaneous match.

[Timestamp classification](comparison-interpretation.json) resolves the difference in what was measured: provider GETs ran at 13:55:59–13:56:00 UTC, after the dashboard requests began at 13:52:44 UTC. There were 13 still-forming bars at their original observation; all 19 differing fields belong to the latest, still-forming bar in seven TSLA/NVDA frame sets. No already-closed candle differed. This is consistent with native bars changing between observations. The evidence does not establish exact contemporaneous identity for forming bars, and no production repair was made from this time-separated comparison.

The comparison uses the dashboard's configured `services.dashboard.stockData.adjustment: split`. The bot's historical adapter separately uses `broker.alpacaHistorical.adjustment: raw` from internals. This receipt does not establish equality of those two historical series across corporate actions; no split-related failure was demonstrated here and neither setting was changed.

## Runtime state and remaining acceptance

During this window the active session remained crypto. The same observer received 154 native candle updates for each of the seven BTC frames. Settings reported paper mode, 1,397 fields, no unavailable inputs and no noncanonical returned sources; its revisions/fingerprint match the earlier activation. All four canonical PM2 processes remained online with unchanged PIDs/restart counts. The 20 inherited tracked modifications were preserved. No restart, forced session switch, trade command, position mutation, Jest work, new Mercury dispatch or RAG rebuild occurred.

Outstanding: active Alpaca stock-session feed/hydration and correlated bot/dashboard receipts at the scheduled regular-hours switch. No active stock-feed outage, recovery or browser rendering was exercised here. Historical stock envelopes expose symbol/timeframe without inventing an account/broker scope while the active bot is in crypto. Stop 2 remains open. The separate prompt experiment and strategy warning are recorded in [the preceding experiment](../mercury-prompt-benefit/RECEIPTS.md).

Only bounded public summaries and this documentation are committed. The full wire capture contains private state messages and remains on the VPS with original provider replies and observer scripts. Documentation-only delivery requires no new paid review.
