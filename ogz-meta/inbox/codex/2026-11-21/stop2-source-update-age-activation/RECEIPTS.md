# Candle update-age repair: approved paper activation

Activated production commit: `cf6bbd15eb4cf5ff461da2630410c306fa81bba6` on `codex/archive-legacy-env`.
Trey approved restarting only `ogz-prime-v2` through the canonical ecosystem with `--update-env`.
The replacement bot started November 21 at 02:48:21 PST (10:48:21 UTC).

| Evidence | Receipt |
| --- | --- |
| Source hashes, four process identities, paper state and authorization | [preflight.json](preflight.json) |
| Exact activation command, canonical environment owner and exit code | [activation-command.json](activation-command.json) |
| Process/environment, config ownership, state and trace results | [runtime-receipt.json](runtime-receipt.json) |
| 1,456 live candle updates, seven frames, source timestamps and arithmetic | [live-candle-receipts.json](live-candle-receipts.json) |
| Dashboard socket histories, arriving frames and live config response | [wire-observation.json](wire-observation.json) |
| Existing journal files and closed-trade preservation | [history-preservation.json](history-preservation.json) |
| Pre-commit execution and Mercury review for the source change | [Source repair](../../2026-11-20/stop2-source-update-age/RECEIPTS.md) |

All seven active Kraken frames supplied 208 processor receipts each. The measured source-update age was 42–3,695 ms, and all 1,456 receipts were `on_time`. Source update time, candle end, close, symbol and timeframe matched the earlier producer/normalization traces. Both age calculations matched their recorded timestamps. These checks found zero mismatches. They do not establish full strategy correctness or profitability.

The live configuration response contained 1,397 editable fields, all owned by `config/settings.json` or `config/internals.json`, with no unavailable inputs. All 25 captured decision configuration receipts matched fingerprint `cd55988f37620f20892d9a15103fca12786eee357cb81eb253dc9006c79b3cd0` (settings revision 24, internals revision 14). The other three roles kept their existing PIDs and canonical launch environments; their internal configuration was not independently fingerprinted again.

The first read-only state check was flat. One BTC long opened before activation; the immediate pre-restart capture saved it, and it remained accounted for afterward. All 925 previous closed trades survived unchanged. All 1,271 inventoried journal files remained present, and all 42 JSONL files preserved their prior bytes. One JSON snapshot changed during normal runtime persistence; it is not described as an immutable journal.

## Explicit open findings and limits

- Active-session live age receipts cover Kraken. Alpaca age behavior has the source repair's isolated execution evidence; a fresh market-hours Alpaca stream receipt is still absent.
- A request for 60 TSLA 1m candles returned an explicit unavailable result. The server logged `No bars returned for TSLA @ 1m`. `server/stock-data-adapter.js:80-92` chooses its start using interval times requested count times the canonical multiplier of three. At this Saturday observation that requested only the preceding three hours, excluding Friday's bars. Six other stock frames returned history. This does not establish that every TSLA 1m chart request fails: the default 500-candle request uses a different window. The request-window producer remains to be repaired; no fabricated candle, aggregation or larger guessed multiplier was introduced.
- Startup `TradeJournalBridge.js:979-988` attempted to reconcile a journal entry that was still open in authoritative state. `TradeJournal.js:1033-1035` refused to mark that exposure reconciled. The BTC position remained open and the bot had no pause or symbol halt. The unnecessary producer call is recorded separately from the candle-age repair and has not been edited.
- The old process logged its dashboard socket closing during restart. That shutdown log is not evidence that the new process lost its connection: the subsequent authenticated socket returned settings and live candles.
- Previous sizing-policy and notification findings were not repaired by this activation. Stop 2 and the whole walk are not declared complete. No fresh Mercury RAG claim, new strategy-performance claim or live-money execution claim is made.

Raw state snapshots, journal-path inventory, raw logs, configuration values and observer helpers remain under the private evidence directory. Public receipts omit credentials and account identifiers. The detailed primary record is the corresponding `CHANGELOG.md` entry.
