**VERDICT: `found_break`. ADVERSARIAL_REVIEW_BLOCKING: `yes` for candidate tree `3fab084bf501ad44bd2237c3b791cc50a77a66bc`.** The new quiet classification can overlook a missed revision to the last observed candle. I do not clear this candidate.

All source line references below refer to that pinned tree, compared with base `5ef5fc77dc8044469e27fe6f00da1d88c449fc22`. I independently confirmed that only the two assigned files differ and verified their SHA256 values:

| File | SHA256 |
|---|---|
| `run-empire-v2.js` | `6251492908394648a82b650deea9678c427114af9e4e8a08bc364a6f0c52fb35` |
| `core/CandleProcessor.js` | `e6e85b18f3ea2346de4670f1ccf284a465a2b935db550dc664f497f756173253` |

**[P2] A missed update to the anchor candle is classified as verified quiet.**

The reachable trigger is a symbol whose native candle delivery stops after the bot receives a candle, followed by a provider revision to that same candle. The connection can remain healthy through other traffic. If complete REST history contains the revised anchor but no later qualifying candle, `_inspectNativeSilence` returns `verified_quiet`.

This follows directly from the implementation:

- Native updates to an existing candle are supported inputs. Alpaca explicitly accepts both normal and revised minute bars and emits the revision flag; Kraken emits forming-candle updates. [Alpaca producer](/opt/ogzprime/OGZPMLV2/brokers/AlpacaAdapter.js:1186), [Alpaca revision emission](/opt/ogzprime/OGZPMLV2/brokers/AlpacaAdapter.js:1215), [Kraken producer](/opt/ogzprime/OGZPMLV2/brokers/KrakenIBrokerAdapter.js:398).
- The new native watermark retains the candle’s start time, event time and owner, but no evidence of its observed OHLCV contents. [CandleProcessor.js](/opt/ogzprime/OGZPMLV2/core/CandleProcessor.js:1089).
- The verifier validates coverage and the presence of the anchor, then only counts candles satisfying `candle.t > anchor`. A revised candle with `t === anchor` cannot establish missing delivery under this predicate. Its changed contents are never compared with the stored candle. [run-empire-v2.js](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:2904).
- `verified_quiet` is excluded from failures. With no other failing frame, execution continues before quarantine, backfill or flattening. The inspection itself does not ingest the returned revision. [run-empire-v2.js](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:3147).

The consequence is that the bot can retain an outdated candle and price while declaring the silence verified. It makes no native-data halt or flatten attempt for that discrepancy. Ordinary exit calculations prefer the saved last price, so this can delay an exit that depends on the corrected price. Whether a particular position remains open depends on its other exit protections; I am not claiming every trade will remain open or quantifying an actual loss. [TradingLoop.js](/opt/ogzprime/OGZPMLV2/core/TradingLoop.js:1078).

This is a regression in the reviewed delta: the base watchdog quarantined an expired native frame directly. The new branch suppresses that action without establishing that the bot has the provider’s latest version of the anchor.

The parent subsequently supplied a focused isolated reproduction of the branch I identified independently: expired NVDA 1m data, healthy transport, complete matching-range history, and only a revised anchor. REST returned close **100.5**, volume **1050**; the stored anchor remained close **101**, volume **1000**. The native marker stayed unchanged, evidence was `verified_quiet` with `confirmed=false`, and NVDA was not halted. This corroborates the source consequence. It used controlled data and extracted actual methods; it establishes neither a live incident nor its frequency. I did not execute that fixture or independently inspect its implementation.

**The inherited account-reconciliation stall remains a separate runtime defect.**

A previously halted symbol with fresh native data enters hydration and recovery. Recovery awaits the account snapshot; `getPositions`, `getOpenOrders` and `getBalance` receive no watchdog cancellation signal through that consumer. The inspected Alpaca private-account requests also have no request-local deadline or signal. [Recovery call](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:1794), [snapshot consumer](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:1327), [Alpaca request](/opt/ogzprime/OGZPMLV2/brokers/AlpacaAdapter.js:433).

While that promise remains pending, the single `liveness_check` remains registered and later ticks return immediately. A later symbol can therefore exceed its silence limit without inspection or quarantine. [Watchdog ownership](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:3092), [operation settlement](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:3798).

I read the parent’s [isolated observation](/opt/ogzprime/OGZPMLV2/ogz-meta/inbox/codex/2026-11-28/native-account-recovery/observation.json) after independently tracing this path and verified that its runner, SessionRouter and Alpaca source hashes match the reviewed tree. It showed that an explicitly aborted candle signal did not release the pending account snapshot: NVDA expired with no evidence and no halt. Releasing the controlled `getPositions` promise allowed the same pass to reach and halt NVDA.

That defect is unchanged from the base. **It would not, by itself, block my review of this atomic correction**, but it prevents a claim that the overall watchdog always checks every symbol within its configured interval. It remains relevant to runtime and Stop 2 acceptance.

**Other examined paths did not produce an additional delta finding.**

- Owner checks include epoch, broker and account. Native progress during an awaited query, including during another frame’s query, retires the corresponding suspicion.
- Incomplete coverage, unavailable anchors, malformed history and failed requests become `unverified`, which selects quarantine rather than inventing healthy data.
- Watchdog REST inspection does not create an entry stream or advance the native clock. Existing recovery ingests history through `processNewCandle`; native closed-candle callbacks own entry scheduling.
- Quarantine blocks symbol entries before recovery requests and uses the existing symbol queue for flattening. Missing current prices or unconfirmed closes are recorded as unresolved positions requiring reconciliation; this is not a guarantee that flattening succeeds.
- Recovery requires native freshness and scoped reconciliation before clearing its own halt cause. Other halt causes are preserved.
- The effective 1m silence threshold is **150,000 ms**, with **60,000 ms** polling and a separate **120,000 ms** history lateness allowance. Neither detection nor flattening has a simple two-minute completion guarantee.

**Coverage and limits:** I fully read both changed files—5,300 lines total—and the complete diff, plus the relevant producer, storage, health, execution, recovery and reconciliation paths listed above. The four changed behavior groups were all examined: native watermark ownership/progress, REST silence classification, disconnect tracking, and quarantine selection with resumption handling. The blocking allegation is in REST silence classification. No new throw or fabricated trading-data default was added by these groups; the Fourth Shape concern is the missed external-data discrepancy.

This was an independent source review. I did not read earlier reviewers’ answers or native-silence fixture conclusions before forming my source conclusion. I did not run AST tooling, tests, helpers, broker calls or provider reviews, and I made no edits or runtime changes. Execution evidence cited here was supplied transparently by the parent after my findings. Live provider frequency, actual fills, notification delivery and activation were not verified.

The review of **this pinned candidate is complete**, with one new blocking finding and one separately qualified inherited defect. A correction to the anchor evidence requires verification and review of its new source identity; this result does not clear later bytes or establish live activation or Stop 2 completion.

<oai-mem-citation>
<citation_entries>
MEMORY.md:91-105|note=[alignment and scope discipline checked against live instructions]
</citation_entries>
<rollout_ids>
01a18f90-beda-7523-acf4-6d12e1beb6d7
</rollout_ids>
</oai-mem-citation>
