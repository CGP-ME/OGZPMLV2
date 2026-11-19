# Stop 2 cleanup activation — 2026-11-19

All four approved processes restarted once with canonical environment at 16:07 UTC. The detailed narrative and remaining findings are in the matching CHANGELOG entry. **Activation is verified; Stop 2 still has an open freshness-diagnostic defect.**

| Process | New PID | Restart delta | Observed status |
| --- | ---: | ---: | --- |
| ogz-supervisor | 574905 | 1 | online |
| ogz-websocket | 574890 | 1 | online |
| ogz-stripe | 574916 | 1 | online |
| ogz-prime-v2 | 574943 | 1 | online |

| What was observed | Receipt |
| --- | --- |
| Reviewed source, paper profile and state before restart | [preflight.json](preflight.json) |
| Exact approved command, environment owner and result | [activation-command.json](activation-command.json) |
| Current processes, canonical config, hydration, decisions and paper positions | [runtime-receipt.json](runtime-receipt.json) |
| History and original closed-trade preservation | [history-preservation.json](history-preservation.json) |
| Public socket histories, native updates, CVD and config owners | [wire-observation.json](wire-observation.json) |
| 413 closed Bitcoin candles, exact OHLCV against independent Kraken REST | [native-broker-comparison.json](native-broker-comparison.json) |
| Actual rendered seven-frame charts and indicator changes | [indicator-browser.json](indicator-browser.json), [V2 chart](served-v2.png), [original chart](served-legacy.png) |
| Final static repair bytes match the public endpoint | [served-source.json](served-source.json) |
| Explicit errors, warnings and verification limits | [startup-observation.json](startup-observation.json) |
| Separate analytics selection repair, browser proof and Mercury review | [selection receipts](../stop2-analytics-selection/RECEIPTS.md) |

The bot's live settings report contains 1,397 canonical field owners and no unavailable inputs. The other three roles' evidence is startup/environment/source evidence; they have no separate in-memory configuration endpoint. Current trading parameters still require the later sizing-policy reconciliation. Unsupported analytics remain unavailable. Notification delivery and portal authentication were not certified.

Raw state, account-bearing journals, full logs, transient observer failures and disposable browser candidate responses remain private on the VPS. No credentials or raw private account evidence are committed. The private baseline and committed receipt hashes make the preservation checks inspectable without publishing account identifiers. No existing positions or journals were cleared.
