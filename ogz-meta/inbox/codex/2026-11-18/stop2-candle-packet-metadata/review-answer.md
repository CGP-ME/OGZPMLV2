# Mercury focused review: candle timestamp and volume

Verbatim final answer. Author qualifications and harness warnings are in
`RECEIPTS.md` and `review-receipt.json`; this is not a whole-dashboard certificate.

I now have complete evidence. Let me compile the final review.

---

**INDEPENDENT REVIEW — SERIALIZED DASHBOARD PRICE MESSAGE FOR A LATE-CORRECTION CANDLE**

**Direct answer.** For a candle update whose timestamp precedes the latest stored candle (a "late correction"), the serialized dashboard price message carries the **incoming candle's own timestamp** (`candle.t`) and the **incoming candle's volume** (`dashboardCandle.volume = parseFloat(volume)`, which equals `candle.v`), both sourced from the same incoming candle whose OHLC values fill the message. The message is internally consistent: OHLC, timestamp, and volume all describe the corrected (older) candle.

**Producer path (current source, 38a797d).**
- Incoming OHLC is destructured at `core/CandleProcessor.js:941` (`open, high, low, close, volume`) and stamped into the candle at `:990-1008` (`t: candleTimeMs`, `v: parseFloat(volume)`).
- `processNewCandle(candle, …)` runs at `:1071`. For a late correction the etime already exists, so `isUpdate = true` (`:468-471`) and the historical bar is replaced in the canonical store (`:476-480`); the latest stored candle is unchanged.
- `latestCandle = frameCtx.priceHistory.at(-1)` at `:1075` therefore still returns the **newest** stored bar, and `marketData` is built from it (`:1080-1092`: `timestamp: latestCandle.t`, `volume: parseFloat(latestCandle.v)`). The comment at `:1073-1074` documents this explicitly: "A late correction replaces its historical bar without moving the current market-data snapshot backward."
- The dashboard message now uses:
  - `dashboardTimestamp = candle.t` — the incoming (older) candle's timestamp, `:1130`;
  - `dashboardCandle.volume = parseFloat(volume)` — the incoming candle's volume, `:1139`;
  - OHLC from the incoming candle, `:1135-1138`;
  - message `volume: dashboardCandle.volume` at `:1149` and `:1166`, message `timestamp: dashboardTimestamp` at `:1150` and `:1167`.

**Baseline comparison (d76e0e).** At the baseline, `dashboardTimestamp = marketData.timestamp` (= `latestCandle.t`, the **latest** stored candle timestamp) and `volume: marketData.volume` (= `parseFloat(latestCandle.v)`, the **latest** stored candle volume) while the OHLC still came from the incoming older candle. So in the late-correction case the baseline message paired old OHLC with the latest candle's timestamp and volume — that is the inconsistency this change eliminates. In the normal (latest-candle) case `candle.t === latestCandle.t` and `candle.v === latestCandle.v`, so the change is a no-op there; no regression to the common path.

**Consumer path.**
- `ogzprime-ssl-server.js:2195-2205` relays the message verbatim to dashboard clients; `:2208` only logs price.
- `public/unified-dashboard-legacy.html:3849-3850` calls `updateChart(data.data)`. `updateChart` reads `data.candle?.timestamp` (`:3317`) and `data.candle.volume` (`:3354`), both of which match the new producer values. No consumer reads the latest-stored-candle timestamp/volume.
- `public/customer-control-panel.html:651-668` uses only `data.balance`; it does not consume timestamp/volume.
- `brokers/KrakenIBrokerAdapter.js:370,456` match `type === 'price'` but are the Kraken ticker/OHLC feed handler (producer side), not consumers of the CandleProcessor dashboard message.

**Candidate inventory (examined 4 of 4).**
1. **Current behavior** — timestamp = `candle.t`, volume = `parseFloat(volume)` (both old/incoming candle). SUPPORTED by `:1130, :1139, :1149, :1166`.
2. **Baseline behavior** — timestamp = `latestCandle.t`, volume = `parseFloat(latestCandle.v)` (latest candle). REFUTED as current; it was the pre-change inconsistent state (git_show d76e0e `:1130, :1149`).
3. **Consumer expectation** — `updateChart` uses `data.candle.timestamp`/`data.candle.volume`. SUPPORTED (HTML `:3317, :3354`), consistent with the new producer.
4. **"Timestamp should stay latest" alternative** — rejected: the change deliberately aligns timestamp/volume with the OHLC of the candle being drawn, and the comment at `:1073-1074` confirms `marketData` intentionally stays on the latest bar for the trading snapshot, while the display candle tracks the corrected bar.

**Residual nuances (not breaks).**
- `_buildDashboardIndicators` uses `marketData?.volume` (latest candle volume) as a fallback for `indicators.volume` (`core/CandleProcessor.js:217`), so in a late correction `indicators.volume` can diverge from the message's top-level `volume`. This is a minor internal divergence in the indicators object, which reflects the engine's latest-state snapshot; not a break.
- The broker-status broadcast reuses `dashboardTimestamp` (`:1191`), so a late correction would carry the old candle timestamp in a status frame — cosmetic.
- The consumer hardcodes 1-minute timestamp normalization (`HTML:3323-3324`), pre-existing and unrelated to this change.

**VERDICT: no_break_found**

**ADVERSARIAL_REVIEW_BLOCKING: no** — The change fixes the late-correction inconsistency (OHLC vs timestamp/volume) rather than introducing one; the value change is a no-op for the normal latest-candle path, and the primary consumer reads `data.candle.timestamp`/`data.candle.volume`, which match the new producer. The only divergences are the minor `indicators.volume` fallback and the broker-status timestamp reuse, neither of which breaks the dashboard price contract.

**CANDIDATE SET: examined 4 of 4** — current producer (`CandleProcessor.js:1130,1139,1149,1166`), baseline producer (git_show d76e0e `:1130,1149`), dashboard consumer (`unified-dashboard-legacy.html:3317,3354`), and the non-dashboard Kraken-adapter matches (`KrakenIBrokerAdapter.js:370,456`) ruled out as producers, not consumers.

**AST EVIDENCE** — Used `find_definition` for `processNewCandle` (`:441`) and `_buildDashboardIndicators` (`:177`), plus `grep`/`open_file`/`git_show` for the flow. No host-provided AST scan receipts were relied upon beyond the definition lookups.

**INHERITED** — The late-correction design is documented at `CandleProcessor.js:1073-1074`: `marketData` intentionally reflects the newest stored bar while the display candle reflects the corrected bar. `marketData.volume` uses the `Number.isFinite(_parsedVolume) ? _parsedVolume : null` guard (`:1088`). No environment bypass or swallowed error found on this path; the broadcast is wrapped in try/catch at `:1196`.

**ALLEGATIONS** — No prior reviewer findings exist for this question. I accepted the source-derived fix as correct based on the producer/consumer comparison above; I did not execute the code.

**SUBSTANTIVE RESOLUTION: none** — no substantive dispute exists.

**WHAT I DID** — Read the captured diff (artifact-0002), the full dashboard-broadcast region (`CandleProcessor.js:1080-1228`), the candle construction (`:940-1080`), `processNewCandle` (`:441-600`), `_buildDashboardIndicators` (`:177-219`), the baseline via `git_show d76e0e` (`:1120-1175`), and all `type === 'price'` consumers (relay `ogzprime-ssl-server.js:2190-2260`; `unified-dashboard-legacy.html:3304-3380,3840-3920`; `customer-control-panel.html:640-674`; `KrakenIBrokerAdapter.js:360-380`).

**WHAT I DID NOT DO** — Did not execute the application or run tests (no host-attested execution receipt available). Did not inspect `getCandlesForTimeframe` internals or `addCandle` storage format beyond the call sites, as they are not needed to answer the timestamp/volume question.

**WHAT I ASSUMED** — That `candle.t` is a valid integer epoch ms (guaranteed by validation at `CandleProcessor.js:448` and construction at `:996`). That the diff artifact and baseline git ref correspond to the stated SHAs.

**WHY THIS VERDICT** — The deciding evidence is the pairing of `dashboardTimestamp = candle.t` (`:1130`) and `volume: dashboardCandle.volume = parseFloat(volume)` (`:1139,1149,1166`) with OHLC drawn from the same incoming candle (`:1135-1138`), versus the baseline's `marketData.timestamp`/`marketData.volume` (latest-candle values) at the same positions. The consumer reads `data.candle.timestamp`/`data.candle.volume`, confirming the new producer and consumer agree.

**IF INCOMPLETE, WHY** — Not incomplete for the posed question; the only unread areas (`getCandlesForTimeframe`, `addCandle` internals) do not affect the timestamp/volume answer.
