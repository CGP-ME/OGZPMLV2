# Stop 1 configuration closure — 2026-11-17

**Status: the four remaining configuration requirements are complete.** The actual paper activation ran at 05:42:53–05:42:55 UTC; the final runtime observation below is 05:50:46 UTC. This closes configuration ownership, saved-setting adoption, preservation of entry policy, and the individual-trade stop path. It is not completion of the remaining bot walk.

Trey authorized completion on the current branch while preserving Hermes's work. The controlling hot-setting/open-trade contract is R8 in `ogz-meta/inbox/fable/2026-09-09/STOP1-BOUNDARY-MISSION-v3-2026-09-09.md:26`. Detailed problem/change/review entries for each repair are in `CHANGELOG.md`.

| Requirement | Actual evidence | Result |
| --- | --- | --- |
| Canonical ownership and no legacy env override | Fresh isolated processes for bot/paper, bot/production, dashboard, supervisor, checkout and market-data-tool; every runtime leaf has a source, canonical paths resolve, and all 184 archived env names injected together leave configuration/source/revision/fingerprint unchanged. The dashboard recovery parent mislabel was corrected without changing values. All 1,397 live editable fields report settings ownership. | Complete for this configuration boundary. [Role receipt](provenance-receipt.json), [source correction](source-label/delivery-receipt.json). |
| Saved settings affect subsequent work without restart | Ten source repairs remove 148 restart-bound descriptors and their retained constructor copies. Native fixtures exercise retained indicators, evaluators, learned memory, history and TRAI clients. All 1,397 fields pass valid save, persistence, new snapshot, unchanged repeat and restore. The live bot and relay acknowledge a changed advisory request limit and its restoration, with the same PIDs; later decision records carry the restored revision. | Complete. [Field-level transport receipt](editable-transport-receipt.json), [live round trip](activation/live-roundtrip-receipt.json). |
| Existing trades retain entry policy | Actual isolated ConfigLoader saves, policy construction, StateManager persistence/restore, StopLossChecker and ProfitExitPlanner checks cover long/short trades. The live BTC short retains its entry facts and frozen-policy hash across restart and the live settings round trip. | Complete. [Joined policy receipt](trade-policy-receipt.json), [runtime receipt](activation/runtime-receipt.json). |
| One trade's explicit stop edit reaches its owner and exit consumer | Shipped UI submit/receipt functions and relay routing branches execute against the actual WebSocketManager, StateManager and exit checker. The selected owner receives the edit; disk contains it before acknowledgment; another trade and globals stay unchanged; duplicate retry does not rewrite; wrong scope/revision are refused; restore retains the edit. | Complete at the joined behavior boundary. DOM rendering and physical sockets are fixture seams; no live trade stop was changed. [Native fixture](fixtures/trade-policy-current.cjs). |

The first all-field pass proved 1,396 fields and correctly rejected changing `fees.model` to per-share with no positive fee. The focused completion supplied a valid `fees.perShare` companion in the same isolated save and restored both. The failed attempt remains in the transport receipt; it was not hidden or “fixed” by weakening admission.

## Running paper system

| Process | New PID | Observation |
| --- | ---: | --- |
| `ogz-prime-v2` | 2869703 | Online; paper; original position restored; current decisions persisted. |
| `ogz-websocket` | 2869648 | Online; authenticated settings and state responses; changed/restored request-policy receipts recorded. |
| `ogz-supervisor` | 2869657 | Online; recovery-control GET returned HTTP 200; no extra restart observed. |
| `ogz-stripe` | 2869656 | Online; configured checkout listener accepts connections. No payment transaction was performed. |

All four run from `/opt/ogzprime/OGZPMLV2` with the intended scripts. Restart used the environment in `config/internals.json:deployment.pm2.launchEnvironment`, its configured PM2 home, and per-role ecosystem posture. Bot `PROFILE=paper`; no dotenv-path or backtest-descriptor override. `NODE_ENV` is the canonical deployment posture, not a trading override. `.env` has 22 credential/secret-endpoint names, no duplicate assignments, and was not edited; credential values are absent from this packet.

The supervisor observed a transient HTTP 502 while the relay restarted and then returned to HEALTHY. Its deadman URL is absent and boot explicitly reports disabled. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are also absent: Telegram prompt delivery is not established by this closure. No substitute credential was supplied.

The live round trip at **05:44:58.406–05:44:58.871 UTC** changed `trai.llm.maxTokens` **7750 → 7751 → 7750**, in passive advisory mode. It used the normal authenticated owner-selected writer and compare-and-swap revision/hash fields. It did not invoke an extra provider request or change a trading threshold. Settings revision advanced **22 → 23 → 24**; effective values returned to their starting values. The canonical writer also normalized JSON formatting; the delivery records that formatting and revision separately from inherited semantic edits.

Current settings revision **24**, internals revision **13**:

- Settings hash: `70330c8d63e18bc3d30da52584fd9698586d82979e9e6c4a67907c9f925426fb`.
- Internals hash: `0268f9ef76aa5013e4a4c2611b2350bce315adab2e029d0dc26c1a8aba6abb61`.
- Bot fingerprint: `bcacdeeab6eaf09df8d7dedd053478eec82d8c071a31fd730939c8f905804697`.

The final observation found **32 persisted decision/exit-evaluation records** with that fingerprint. REST hydration supplied 60 BTC candles on each configured evaluation frame: 1m, 5m, 15m, 1h and 4h; unavailable/recovery-pending lists were empty. The restored BTC short `SIM_1794888000804_befnv8` retained entry price **64959.7039**, size **143.01209721201846 USD**, direction and frozen policy. No pause or symbol halt was present.

## Source, preservation and review boundary

Activated source HEAD is **`3f04258e582f497006ec53ad25be91684ad76269`**, on `codex/archive-legacy-env`, plus the explicitly preserved inherited working-tree edits. Runtime is not represented as a pristine commit. The [runtime receipt](activation/runtime-receipt.json) records the source manifest, process environments, logs, settings identities, history checks and live samples. Final documentation/generated-metadata delivery does not require another restart.

Eleven atomic source commits were confirmed on the remote before activation: `145ec6a4`, `4454c784`, `fdbb1a79`, `f0503298`, `d3ff9702`, `29ea2bcd`, `51be1e28`, `198ce73b`, `571eca91`, `8ecd5505`, `3f04258e`. Each has its own detailed changelog and source-qualified Mercury receipt. Final reviews reported `no_break_found`; earlier findings and an incomplete response are retained in their receipts. These were independent focused Mercury dispatches, not a full-panel vote. Recorded cost across these 17 review attempts is **$0.931869**; that is not an invoice total or a count of runtime provider usage. No new RAG publication is claimed. The generated settings revision/formatting was separately reviewed as `no_break_found` in 10 iterations for $0.018950; [metadata receipt](activation/metadata-delivery-receipt.json). Combined recorded review cost is $0.950819 across 18 attempts.

Inherited edit text was checked against the pre-work private patch; the two descriptor effect-label changes were accounted for explicitly. No branch switch, reset, stash, unrelated deletion or staged Hermes change occurred. All **619** checkpointed history files remain; all prior bytes in the **16** trade ledgers remain. Three existing replay files advanced post-exit capture at 05:45 UTC; this activation did not save their previous full payloads, so it does not claim a field-by-field comparison of those three rewrites. The live state was privately backed up before restart.

## Open findings for the remaining walk

- **Stop 2:** subscriptions include 30m/1d while evaluation admits five other frames; `TIMEFRAME-NON-ACTIVE` messages continue. The current subscription/admission contract needs reconciliation. Five-frame hydration success is not proof that this mismatch is resolved.
- **Stop 2/3:** OptimizedIndicators keeps stateful MACD history in a shared instance. Multi-symbol/timeframe state and revisiting previously cached data remain an explicit data-path finding; this repair does not certify that isolation.
- **Stop 7:** historical journal/account totals and StateManager totals remain unreconciled, including legacy closure rows without broker/account identity. Startup journal reconciliation still asks about an order with authoritative exposure and correctly refuses to mark it closed. No history was relabeled or deleted.
- **Stop 10:** TRAI's inherited asynchronous decision-log callback ignores append errors. Successful logging was exercised; that failure handling is not claimed repaired.
- **Notification delivery:** the requested Telegram prompt requires its absent bot-token/chat-ID credentials and a delivery receipt. Config ownership is established; Telegram operation is not.

No rendered-browser, stock-session, complete session-switch or whole-bot correctness certificate is asserted by this configuration closure. Auxiliary process ownership is supported by current isolated source checks, actual launch environments and startup paths; the bot directly supplies its runtime configuration receipt. No new introspection endpoint or bot authority was added for verification.
