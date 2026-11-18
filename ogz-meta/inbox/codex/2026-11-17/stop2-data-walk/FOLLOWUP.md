# Stop 2 follow-up: stock intake, MTF decision inputs and chart producers

Observed November 18, 2026 UTC, continuing the November 17 walk session. Source HEAD `15ca9a6f9ef8379f9511098ef3fc9ee3229bca4b` plus preserved inherited edits, branch `codex/archive-legacy-env`.

Trey answered **“Keep investigating before editing”** to the proposed seven-frame repair. This follow-up changes only investigation records and an isolated fixture. No production repair, configuration edit or runtime activation is authorized by this receipt. The [opening receipt](RECEIPTS.md) remains the record of the earlier findings; this supplement extends its evidence and does not close Stop 2.

## What the running paper bot records

Read finite prefixes of the existing November 17/18 UTC decision-autopsy files, selecting paper MTF snapshots at or after the recorded bot activation, `2026-11-17T05:42:55.130Z`. The [sanitized paper receipt](paper-mtf-receipt.json) records source byte counts/hashes, selection, configuration fingerprints, trace IDs and latest observations. Raw account identifiers and full journal rows are excluded.

| Symbol | Broker | Recorded snapshots | Ready frames in every selected snapshot |
| --- | --- | ---: | --- |
| BTC-USD | Kraken | 1,264 | 1m, 5m, 15m, 1h, 4h |
| NVDA | Alpaca | 466 | 1m, 5m, 15m, 1h, 4h |
| MARA | Alpaca | 417 | 1m, 5m, 15m, 1h, 4h |
| RIOT | Alpaca | 467 | 1m, 5m, 15m, 1h, 4h |
| TSLA | Alpaca | 464 | 1m, 5m, 15m, 1h, 4h |
| COIN | Alpaca | 357 | 1m, 5m, 15m, 1h, 4h |

These 3,435 snapshots all report `available: true` and `totalTimeframes: 5`. The latest sampled BTC record is `2026-11-18T05:11:00.367Z`; latest stock records are from the November 17 stock session, not a simultaneous observation of currently streaming stocks. This proves persisted MTF metadata for both brokers. It does not independently verify indicator arithmetic, a strategy winner, an order or a rendered chart. `shouldTrade: false` is a reported signal outcome, not itself a data failure.

The writer is `core/TradingLoop.js:595-608`, through `DecisionAutopsyLogger` into the configured `logs/decisions` directory. Looking at a similarly named unused ledger path would not establish missing receipts.

## One five-frame setting controls several different jobs

`config/settings.json:3580-3586` defines the five frames. The current consumer chain is:

1. `run-empire-v2.js:692-704` reads that set as `evaluationTimeframes` and chooses the smallest frame as the MTF base.
2. Stock subscriptions in `core/SessionRouter.js:1646-1652` and `:1925-1931` iterate that set. Runner hydration at `run-empire-v2.js:1858` uses its union with the primary frame, which is already included.
3. CandleProcessor admission at `run-empire-v2.js:987-1027` uses that set. The earlier replay showed that Kraken's 30m/1d bars had already reached runner storage but do not reach this consumer.
4. `core/CandleProcessor.js:496` and `:550` deliver admitted candles to the orchestrator's MTF service. `core/StrategyOrchestrator.js:925-933` also configures that service with the same five frames.
5. The decision capture at `core/TradingLoop.js:1038` takes the symbol's MTF snapshot. The paper evidence above confirms the five-frame result in operation.

The paper profile already supplies weights for all seven frames under `launchProfiles.paper.confluence.mtfService.weights`. `foundation/ConfigLoader.js:1131-1149` maps that profile-owned configuration to the orchestrator service/booster/strategy consumers and records its canonical source. A configured 30m/1d weight alone does not put those frames into the service. The isolated real ConfigLoader receipt records both the seven weights and five active frames.

Changing only broker subscriptions would leave downstream admission and service storage unchanged. Changing the shared evaluation setting would also change entry-evaluation eligibility. An intake/display repair therefore needs explicit producer/consumer separation of observation frames, confirmation inputs and strategy entry frames; it must not silently make seven entry frames out of five. No new configuration file or trading policy was introduced here.

## What is already working in the bounded MTF path

The [native fixture](fixtures/mtf-decision-input.cjs) uses the real isolated paper ConfigLoader, actual orchestrator ownership/ingest/snapshot methods and actual `MultiTimeframeAdapter`. It feeds two synthetic symbols, each with 64 closed bars and one still-forming bar on each of the five configured frames.

The [result](mtf-decision-input-receipt.json) confirms separate MTF instances per symbol, 64 retained closed bars per frame in the decision snapshot, correct symbol identity, and indicator input ending at the last closed bar rather than the newer forming bar. The source cutoff and account/broker/mode matching are at `modules/MultiTimeframeAdapter.js:270-287`; per-symbol ownership is at `core/StrategyOrchestrator.js:936-993`. The fixture exercises valid matching scopes; it does not claim a complete session-fence audit or isolation of every other indicator module.

A bounded direct-delivery check also demonstrates why simply forwarding the two omitted frames is insufficient: the current MTF service rejects 30m and 1d as unconfigured at `modules/MultiTimeframeAdapter.js:153-155`. This deliberately bypasses the runner's current admission branch. It is a counterfactual configuration check, **not a reported live crash**, and no throw was added or removed.

The native receipt is emitted after all assertions. Its log and fixture hashes and exact isolated command are in [followup-verification.json](followup-verification.json). The launcher exit code was not retained in this receipt; completion is evidenced by the final receipt marker and its equality to the saved JSON. No Jest was added or run.

## Stock higher frames come from broker REST

`brokers/AlpacaAdapter.js:1164-1199` receives the native one-minute bar and triggers the requested-frame consumers. For other requested frames, `:1202-1243` calls `getCandles(symbol, frameState.timeframe, ...)`, ignores already emitted starts, excludes bars whose calculated end is beyond the triggering native bar, and emits the returned broker candle. This path does not construct a higher-frame OHLC from accumulated one-minute prices.

That is source evidence for the current broker-REST route, not a new live response-equality or reconnect test. Its requested frame set still comes from the five-frame subscription configuration. Historical dashboard availability for seven frames is a separate path and does not fill the missing continuing bot intake.

## Chart fabrication has real price-only producers

The earlier native chart replay reproduced local candle construction from a price-only message and acceptance of a one-minute bar in a selected daily slot. The new trace identifies actual price-only producers:

- Stock ticker conversion at `ogzprime-ssl-server.js:1433-1466`, called at `:1498`, emits `type: price`, `timeframe: null`, `candle: null` and a nested price payload.
- The active public crypto feed at `ogzprime-ssl-server.js:2293-2348` emits the same price-only shape through the price route, alongside a separate `ticker_price` message.
- The bot's candle-derived price messages are also relayed by the server. Both routes reach the frontend price dispatcher previously exercised at `public/js/core.js:175-214`.

The [bounded server-log observation](followup-runtime-observation.json) records 32,954 bot `Relayed price` markers and 110 direct `CryptoFeed TICK` markers in a 1,500,000-byte sample. This establishes activity on both routes; it is not a captured payload comparison or rendered-browser proof. Repairing only the bot's candle envelope would leave the server's price-only route feeding the existing chart construction branch. Prices should remain available to their price displays without being treated as native OHLC bars.

The old `krakenSocket` at `ogzprime-ssl-server.js:2252-2257` is a no-op stub, so its later callbacks are not evidence of another active connection. Nearby “relay only” / “bot sends nothing” comments conflict with the current feed and relay evidence. Removing the real crypto feed wholesale would also affect depth/CVD/whale/internals consumers; that is outside the proposed candle repair.

## Dashboard selection is shared at the bot

`core/WebSocketManager.js:302-308` writes a dashboard request into the shared runner's `dashboardTimeframe`. CandleProcessor reads that same context to label outgoing envelopes at `core/CandleProcessor.js:1125-1170`; the original candle still retains its incoming frame. One client's selection therefore influences the shared producer's labeling by source construction. Multiple connected clients were not exercised, so no observed multi-client incident is claimed. Native candle identity should come from the candle, while each client selects which frame to display.

## Remaining investigation and acceptance boundaries

The named strategy HTF consumers examined in `core/StrategyOrchestrator.js:1346-1487` use 1h/4h inputs: EMASMACrossover records context, while MADynamicSR, RSI and OGZTPO have configured confidence contributors. That establishes current call sites, not the correctness of ranking, multipliers or resulting entries. Those belong in the adjoining Stop 3 trace. The current RSI regime filter uses its trading frame; this investigation found no basis to claim it currently requires daily input.

An existing source-level error-handling lead remains explicit: `modules/MultiTimeframeAdapter.js:220-224` catches indicator recalculation errors and only increments `stats.errors`. The decision snapshot separately recomputes its closed-bar indicators at `:278-279`. No recalculation fault was injected and no stale decision caused by this catch was demonstrated. It is not a repaired or verified-safe path.

Still open: native broker-to-browser OHLC equality and actual rendering, full disconnect/recovery behavior, complete session fencing/order/duplicate handling, and seven-frame historical/live coverage after an authorized repair. Shared indicator-state findings from the opening walk are not resolved by the per-symbol MTF fixture. The original boundary table remains open rather than being converted into a complete Stop 2 certificate.

## Preservation and delivery

All 21 previously recorded production/config/frontend source hashes matched after this investigation. Four additional read-only source files are fingerprinted in the 25-file follow-up manifest. All four PM2 names retain the same PIDs, start times and restart counts as the opening observation; the bot remains paper. This comparison does not certify trading correctness.

Only this supplement, one isolated fixture, sanitized evidence, verification/preservation metadata and a scoped changelog entry are delivered. All inherited working changes and the original changelog suffix are preserved. Author review checked source references, exact receipt correspondence and scope limits. No Mercury charge, external panel review, RAG rebuild, production edit, setting change, new live probing client or restart occurred. The production proposal remains unapproved following Trey's latest instruction.
