# Stop 2 opening: native timeframe intake and display

Observed 2026-11-18 UTC, continuing the November 17 walk session on `codex/archive-legacy-env`, source HEAD `d276cb5e7cfeedd1ae51f7a50d2a74881c80bf20` plus preserved inherited edits. This is an investigation receipt, **not Stop 2 acceptance or a completed repair**.

## Authority and current walk scope

Trey parked Codex remote-control troubleshooting and resumed the bot walk. Hermes remains read-only; no additional agent was spawned. Trey clarified that receiving and displaying every applicable timeframe is an MTF requirement and local aggregation must be gone. After comparing broker capabilities, Trey asked what is reasonable and proposed an upper bound of one day. The concrete repair proposed for approval uses the existing seven frames: **1m, 5m, 15m, 30m, 1h, 4h, 1d**. It does not silently extend strategy eligibility or add weekly/monthly strategies.

The November 18 walk update follows the entire trade and adjacent state/recording paths. Each station needs source evidence, paper behavior and Trey's intended rules. It retains one position per asset, strategy-owned entry/exit policy, confidence ranking with confluence/upside tie-breaks, auditable reasons, dynamic sizing with the later 5%/7.5%/25% ruling, truthful broker/state/fee records, session transition requirements, production-module backtests, isolated pattern banks, TRAI and dashboard trace. These are walk requirements, not claims that this investigation verified those behaviors. No generic exit style or earlier 20% sizing proposal was implemented.

There is no blanket deferral of Stops 9/10. The later verbatim record in `ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md:160-164` contains the no-deferral instruction. That supersedes reliance on early Fable synthesis as authority to omit those stops. Existing behavior will be traced before any rebuild is proposed.

The previously delivered [Stop 1 receipt](../stop1-closeout/RECEIPTS.md) closes its four configuration requirements. It explicitly leaves the timeframe mismatch, indicator-state isolation and later walk requirements open. Its native helper results are not a rendered-dashboard or complete stock-session certificate.

## Counted evidence coverage

Eight incoming-data boundaries are tracked below. Two native replay fixtures exercise bounded portions of five boundaries: normalization/storage, the initial forming-candle closure case, payload construction, client dispatch, and chart updates. The crypto subscription boundary also has a bounded live-log observation. No complete boundary, full-file or full-station audit is claimed.

| Boundary | Evidence here | Remaining proof |
| --- | --- | --- |
| Broker subscriptions | Current Kraken/Alpaca and SessionRouter source; live Kraken ingress on seven frames | Stock-session capture, broker payload equality, recovery behavior |
| REST hydration | Current runner frame selection and existing Stop 1 five-frame receipt | Seven-frame history receipt for each configured symbol |
| Normalization and symbol/frame storage | Actual runner handler, normalizer and storage methods replayed for two symbols x seven frames | Broker edge cases, backfill/order guarantees and complete session fencing |
| Candle closure and strategy handoff | Existing closed-candle selector participates in the initial-forming-bar replay; source traced | Complete close/duplicate/order behavior and strategy-specific HTF consumers |
| Dashboard producer | Actual CandleProcessor payload declarations executed with synthetic input | Full live producer capture and accounting/indicator context correctness |
| WebSocket relay/dispatch | Current relay source; actual frontend price dispatcher in replay | Connected browser delivery and concurrent client selection |
| Chart consumer | Both complete chart update functions and timeframe/asset helpers replayed | Rendered browser and native broker value comparison after repair |
| Disconnect/recovery | No new fault injection | Reconnect/heartbeat exhaustion, affected-symbol containment and recovery receipts |

## Confirmed findings

1. **Configured intake is not consistent across brokers.** `config/internals.json:1086-1094` supplies seven Kraken intervals. `config/settings.json:3580-3586` supplies only five evaluation frames, omitting 30m and 1d. Stock subscription loops at `core/SessionRouter.js:1646-1652` and `:1925-1931` use that evaluation set. The stock historical chart supports all seven (`server/dashboard-stock-stream-config.js:3-11`), but on-demand historical availability does not prove continuing bot intake.

2. **The runner retains data it reports as dropped.** `run-empire-v2.js:983-986` writes shared and symbol-scoped histories before `:1028-1038` emits `NON_ACTIVE_TIMEFRAME_DROPPED`. In the replay, all 14 symbol/frame combinations retained their original prices and timestamp conversion; 10 reached the CandleProcessor seam and four (30m/1d for each symbol) did not. Last-price updates were attempted for all 14. The seam deliberately does not certify StateManager's freshness decision. Existing live-report code consumes the misleading event at `public/js/panels/live-report.js:74`.

3. **Backend envelope and contained candle can name different frames.** `core/CandleProcessor.js:1125-1150` sets the envelope frame from dashboard selection while the contained candle retains its incoming frame. The same mismatch is repeated in the nested `data` object at `:1159-1170`. The joined replay executes those exact declarations, then the actual price dispatcher at `public/js/core.js:175-214`.

4. **Both served chart implementations reshape the incoming candle.** `public/js/chart.js:873-923` and `public/js/panels/chart-panel.js:2127-2169` align incoming time to the selected chart bucket. A one-minute candle is accepted into a daily slot; the incoming OHLC is presented there without a daily broker candle. A separate synthetic price-only envelope causes local open/high/low construction. These are reachable chart functions: the original dashboard loads `public/js/chart.js`; dashboard v2 loads `public/js/panels/chart-panel.js`. The replay captures series writes, not pixels from an attached browser.

5. **The observation path is coupled to evaluation.** Runner `handleMarketData` admission is inside the evaluation-frame branch (`run-empire-v2.js:987-1004`). The live price broadcast is inside CandleProcessor (`core/CandleProcessor.js:1097-1180`). Retaining a 30m/1d candle in runner history therefore does not establish that the same frame reaches the chart's live producer.

The presence of `CandleAggregator` is not by itself proof of backend aggregation. Current runner references use `getIntervalMs`; `StrategyOrchestrator` imports timeframe constants from `TimeframeEngine`. No execution of either backend candle-construction method was demonstrated by these probes. Dormant implementation removal needs a caller inventory; this receipt authorizes no broad deletion. The confirmed local candle construction above is in the chart consumer.

## Receipts and reproduction

- [Source baseline](baseline.json): branch, HEAD, 20 inherited tracked modifications, empty initial index and 17 source/config hashes. All 17 hashes were unchanged at the post-probe comparison.
- [Runner behavior](frame-routing-receipt.json): 14 rows, actual handler/storage/normalizer/closure selector, named seams and limits. Fixture: [frame-routing.cjs](fixtures/frame-routing.cjs).
- [Producer and chart behavior](chart-routing-receipt.json): two chart implementations x three scenarios (matching daily broker bar, one-minute bar on a daily selection, price-only input), actual producer declarations and price handler, source hashes and captured series writes. Fixture: [chart-frame-routing.cjs](fixtures/chart-frame-routing.cjs).
- [Bounded live ingress](live-ingress-receipt.json): 2,000,000-byte sample, source offsets and SHA-256, 1,125 crypto ingress events across seven frames and 322 misleading drop events. Account identifiers are excluded. The counts are a sample, not a loss/ordering certificate.
- [Runtime observation](runtime-observation.json): all four named processes online with the same Stop 1 activation PIDs; bot profile paper. Online status does not certify trading or rendering correctness.
- [Verification command record](verification.json): exact commands, completion status and log identities.

Both fixtures run only through `python3 scripts/test-isolated.py --fixture <fixture> -- node <fixture>`. They use synthetic inputs inside disposable isolation and do not import trading modules on the host, call a real broker, or change production state. These assertions reproduce current defects; successful fixture execution does not mean the defective behavior is acceptable. No Jest tests were added or run.

The first joined producer replay lacked the frontend dispatcher's `isNumericValue` helper and stopped with a fixture ReferenceError. The fixture was corrected to extract the actual helper, and the complete rerun finished. This was a probe setup failure, not a bot failure or a repaired production defect. Earlier local logs are retained; the delivered receipt is the complete producer/consumer replay.

## Concrete proposed repair and acceptance

The requested approval covers one intake-to-display contract: all seven broker-native frames reach their own symbol/frame storage and dashboard messages with original OHLC and timestamps. Repair the subscription/hydration producers and remove the chart's frame relabeling, time rebucketing and price-only candle construction. A ticker price can update a price readout without becoming a fabricated candle. Use existing configuration ownership; do not add another config file, synthetic fallback, blanket halt, new trading gate or unrelated refactor. Preserve the existing strategy decision policy until its actual frame/HTF consumers are reconciled in the walk.

Acceptance requires before/after native replay, independent focused Mercury evidence for the production candidate, atomic delivery, and separately authorized activation with live paper and browser receipts. Full Stop 2 acceptance additionally needs the remaining boundaries in the table. No Mercury call, production edit, config write, PM2 restart, deployment, RAG rebuild, learned-bank mutation or completed MTF repair occurred during this investigation.

## Broker reference check

Kraken's [native OHLC subscription reference](https://docs.kraken.com/exchange/api-reference/spot-websocket-v1/ohlc) lists nine intervals including 1-week and 15-day bars. Alpaca's [historical bars reference](https://docs.alpaca.markets/us/reference/stockbars) supports minute/hour multiples and daily/weekly/monthly bars. This verified why “every interval available” needed clarification; it does not justify adding unused trading horizons or constructing candles locally.
