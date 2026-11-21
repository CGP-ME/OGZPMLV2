# Stock-history and journal-startup paper activation — 2026-11-21

Trey explicitly approved restarting all four canonical processes through the ecosystem with `--update-env`. Activation completed at **10:32:59 PST / 18:32:59 UTC** from pushed source `ace6504eea42bb31732e8d442170b9f2a53bd6a2`, including `f2408def93421a70f15a94b8d53281b65eed424c`.

This packet proves activation and the observed repaired behaviors. Stop 2 remains open for its outstanding requirements; ML/TRAI reports stay assigned to later stops.

## Process and configuration proof

| Process | Replacement PID | Restart delta | Observation |
| --- | ---: | ---: | --- |
| ogz-supervisor | 2158697 | 1 | Online; transient restart-time HTTP 502 recovered to HEALTHY |
| ogz-websocket | 2158695 | 1 | Online; authenticated histories and live frames delivered |
| ogz-stripe | 2158705 | 1 | Online; checkout service started |
| ogz-prime-v2 | 2158744 | 1 | Online; PROFILE=paper; saved position restored |

- [Preflight](preflight.json): 54 approved source hashes, zero drift, saved-state counts and original process identities.
- [Exact activation command and timing](activation-command.json).
- [Runtime receipt](runtime-receipt.json) and [final process check](final-process-check.json): canonical launch values and exact PM2 declared-key sets; no additional restart during the observations.
- [Configuration sources](config-sources.json): full path/source list for 1,397 editable fields, all owned by settings.json. Both current canonical JSON hashes match the live bot snapshot (settings 24, internals 15). Eleven observed decision configuration receipts match that snapshot. Other roles load explicit role snapshots at startup but do not expose independent fingerprint endpoints; no such runtime measurement is invented.

Bot fingerprint: `99fe2ac60d6cdebe891843b5c4899528ec036bc1c7cbe08333df29c6b27e94f4`.

## Candle and journal behavior

- [Authenticated wire observation](wire-observation.json): 14 successful history requests, BTC and TSLA across all seven frames, each returning 60 bars. Also 55 live BTC updates per frame and four state updates; zero socket/authentication errors.
- [Independent stock comparison](stock-native-comparison.json): all 420 returned TSLA bars match timestamps and OHLCV in the independently captured Alpaca native response from earlier the same Saturday. No missing comparison timestamps or ordering defects. This is history proof while the market is closed, not a new stock streaming receipt.
- [Live candle trace](live-candle-receipts.json): 708 Kraken producer/consumer receipts across seven frames, zero traced data/identity/timestamp mismatches; source ages 43–7,862 ms, all classified on_time. Trace identity checks cover symbol/frame/close/update time/candle end; the separate stock comparison covers full OHLCV.
- [Journal startup](journal-startup.json): restored BTC long remains open with unchanged entry/quantity/scope fields; its original journal ENTRY remains and no EXIT or reconciliation event was manufactured. Zero startup reconciliation refusals.
- [History preservation](history-preservation.json): all 1,275 old paths and byte ranges retained, including 42 append-only files; all 927 old closed-trade rows preserved. Raw private account paths are represented only by hashes where needed.
- [Startup observations and limitations](startup-observation.json): temporary supervisor health failure recovered; shutdown socket close is distinguished from the replacement process's working state stream.

No new completed trade occurred in the measured runtime window. There was no global pause or symbol halt. These observations do not prove strategy profitability or live venue execution.

## Source review and remaining scope

- [Stock-window repair and independent Mercury review](../stop2-stock-history-window/RECEIPTS.md).
- [Journal-selection repair and independent Mercury review](../journal-open-reconciliation/RECEIPTS.md).

The stock readers still consume one provider response page. Market-hours stock streaming and the stock-session bot hydration path were not newly exercised by this crypto-session activation. Stock share-minimum/sizing policy reconciliation remains open. Supervisor deadman is disabled by configuration. Other previously documented walk items and RAG freshness are not certified by this receipt.

No production edit was made during activation. No repeated paid review or Jest run was needed for this documentation-only delivery. The inherited dirty source is unchanged and excluded. Full logs, private state, credential material and observation scripts are retained only in the local `private/` evidence folder.
