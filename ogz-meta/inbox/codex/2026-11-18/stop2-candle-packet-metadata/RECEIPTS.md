# Stop 2: corrected candle timestamp and volume

Trey authorized proceeding with the next fix after the investigation-only phase.
This delivers the first repair in `../stop2-mtf-contract/REPAIR-SCOPE.md:64-81`.
It does not authorize the broader MTF/display rewrite or runtime activation.

## Problem and production change

Commit `65c4a82b6a2f74297920344e2384bf38c7e0ba26` retained the newest canonical
candle in `frameCtx.marketData`, but left the outgoing dashboard correction using
that newer candle's timestamp and envelope volume alongside the incoming older
candle's OHLC. That was an author-introduced consumer mismatch. The earlier
correction proof did not exercise this dashboard transport.

The production diff changes three assignments in `core/CandleProcessor.js`:

- `:1130`: outgoing timestamp comes from the incoming normalized `candle.t`.
- `:1149,1166`: outer and nested message volume come from `dashboardCandle.volume`.

`handleMarketData` normalizes input and constructs the candle at `:941-1008`,
ingests it through the canonical store at `:1071`, and retains the newest current
snapshot at `:1073-1097`. The message is serialized at `:1182`. The existing broker
status notification also uses `dashboardTimestamp` at `:1191`, so that notification
again identifies the incoming candle's time. No new fallback, default, throw,
catch, wrapper, configuration, aggregation or trade decision rule is introduced.

## Actual behavior evidence

The [native fixture](fixtures/packet-metadata.cjs) invokes the real
`CandleProcessor.handleMarketData`, `processNewCandle`, CandleStore,
SymbolTradingContext, indicator engine and normalizer. It captures the actual
JSON passed to the processor's WebSocket send method. NVDA and TSLA are exercised
as separate synthetic one-symbol contexts, not as a cross-symbol routing proof.
Account balances, transport and strategy orchestration are fixture surroundings.

| Incoming event | Required outgoing fields | Current snapshot after event |
| --- | --- | --- |
| First bar | Its own timestamp, close 100, volume 10 | First bar, 100 / 10 |
| Newer bar | Newer timestamp, close 108, volume 20 | Newer bar, 108 / 20 |
| Older correction | Older timestamp, close 105, volume 12 | Newer bar, 108 / 20 |
| Older correction with no trades | Older timestamp, close 106, volume 0 | Newer bar, 108 / 20 |
| Update to newest bar | Newer timestamp, close 109, volume 21 | Newer bar, 109 / 21 |

Before the change, both older corrections reproduced the mismatch for both
symbols: the newer timestamp reached every candle/message object, and volume 20
overwrote 12 or 0 in the two envelopes. After the change, outer message, nested
message and both candle objects carry the expected timestamp/close/volume.
Canonical history remains two bars; corrections update the matching historical
bar and return `acceptedAsNew: false`. The newest market snapshot remains current.
The complete values are in [before-receipt.json](before-receipt.json) and
[after-receipt.json](after-receipt.json); command/exit identities are in
[before-run.json](before-run.json) and [after-run.json](after-run.json).

All runs used `python3 scripts/test-isolated.py`. The initial and corrected runs
restore inherited dirty dependency files to HEAD bytes only inside the disposable
helper. [Source identity](source-and-preservation.json) records the override
provenance and proves the executed source hashes match the staged candidate.
The same native fixture also succeeds with the shared checkout's dirty dependency
bytes: [run](working-tree-run.json), [values](working-tree-receipt.json).
No production modules were imported on the host and no operator state or
credentials were supplied to the helper. No Jest was added or run.

## Independent review

Mercury independently answered one neutral timestamp/volume question on candidate
tree `38a797d1914e4b15100b3f1a71c8099e94e11173`, compared with HEAD's tree
`d76e0e44848804ad7aa342e52c10e0226dc8ec2d`. Its verdict is `no_break_found`,
with one completed selected vote and no dissent. Astra and Opus were unselected;
this is not multi-model consensus. One dispatch used `--max-tokens=7750` and no
iteration ceiling. It finished after 12 iterations and 17 successful tool calls;
the recorded run estimate, including the configured Decide advisory, is
USD 0.02490057, not provider invoice evidence.

The [complete final answer](review-answer.md), [sanitized receipt](review-receipt.json),
[command/harness identity](mercury-run.json), and
[captured evidence manifest](review-source-manifest.json) preserve source identity,
outcome and limitations. The executed processor hash matches the reviewed source.
The inherited dirty `react-loop.js` harness bytes were fingerprinted and preserved.

The harness reports `coverage_insufficient`, `coverage_unresolved`,
`whole_file_read_absent`, `inherited_section_incomplete`, and a parsed self-report
absence despite the answer containing explicit self-report sections. Those flags
remain visible; no whole-file audit is claimed. The answer independently follows
the relevant producer assignments and their baseline difference. Its consumer
inventory is limited to legacy HTML; the author additionally checked current
`public/js/core.js:191-192`, which prefers `data.volume` then `data.candle.volume`.
The native replay separately verifies the emitted values and current snapshot.

The author's acceptance is limited to this three-field correction. Mercury's
description of other divergences as minor/cosmetic is not adopted as dashboard
acceptance. Existing indicator-volume ownership, client timestamp handling and
current-price behavior remain open. Its `find_definition` calls are regex-backed,
not AST proof, and its broad statement about no swallowed error is not an audit
of the pre-existing broadcast catch. No repeat paid dispatch was made to improve
report formatting or expand this narrow review into unrelated work.

## Remaining boundaries

This proves the producer's serialized timestamp and volume contract using
synthetic inputs. It is not broker, real WebSocket, browser-rendering or live
paper-runtime acceptance. The known shared history cache, selected-frame
relabeling, indicator ownership, client history replacement, historical
correction/current-price separation and missing seven-frame wiring remain in
the existing [repair scope](../stop2-mtf-contract/REPAIR-SCOPE.md) and
[client follow-up](../stop2-mtf-contract/CLIENT-FOLLOWUP.md). Stop 2 remains open.

No PM2 restart or environment reload was performed. No frontend files were
changed. Source delivery must not be described as runtime activation or a fresh
RAG rebuild. The 20 inherited tracked modifications are preserved; only this
production change, its sanitized evidence and its changelog prefix are staged.
Raw local helper/reviewer logs and temporary source override material are not
publication artifacts.
