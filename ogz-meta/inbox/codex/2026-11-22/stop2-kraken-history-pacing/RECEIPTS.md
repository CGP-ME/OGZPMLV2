# Stop 2: pace native Kraken history at its request source

The preceding [live activation](../stop2-history-pages-activation/RECEIPTS.md) exposed four `EGeneral:Too many requests` responses during rapid BTC history reads. The stock pagination repair was working; these were separate public Kraken requests. The traced live callers all converge on `kraken_adapter_simple.js:getHistoricalOHLC`, which previously sent directly without pacing.

The source change spaces OHLC dispatches for the same registry-normalized pair across native frames and adapter instances. It uses the existing canonical 1,000 ms transport window, rechecks after waiting, and leaves other pairs independent. Native interval, timestamp and OHLCV conversion stay intact. No candles are constructed. The uncalled `enforceRateLimit` method is removed; private request accounting and existing provider-error handling remain unchanged.

| Evidence | What it establishes |
| --- | --- |
| [Producer map](producer-map.json) | Four traced live producers, shared broker translator, and separately identified utility paths |
| [Native responses](fixtures/native-ohlc.json) | Eight actual public GETs: seven BTC native frames and ETH 1m, each returning 60 bars |
| [Baseline](baseline.json) | Same-pair concurrent requests dispatch 0–1 ms apart in the original source |
| [Working candidate](candidate.json) | Same-pair requests spaced 1,001–1,002 ms; another pair proceeds independently; native values retained |
| [Exact staged candidate](pinned.json) | Same native output with staged source/config, concurrent gaps 1,001–1,003 ms, provider failure followed by recovery, delayed event-loop wakeups without a burst |
| [Behavior helper](fixtures/history-pacing.cjs) | Actual production adapters; captured response replay and explicitly simulated HTTP 503/event-loop delay inside isolation |
| [Source diff](source.diff), [identity](source-identity.json) | Complete one-file repair, base/candidate trees, exact sandbox overrides and actual review-harness fingerprint |
| [Review command](review-command.json), [answer](mercury-answer.md), [qualified receipt](review.json), [manifest](review-source-manifest.json) | One independent focused Mercury review, preserved answer and named coverage limits |
| [Activation preflight](activation-preflight.json) | Four processes online, paper profile, one saved position, and only this new transport change awaiting activation |

All executable module verification uses `scripts/test-isolated.py`. No real credentials, runtime state, PM2 socket or network enter those fixtures. Capturing public provider bars is separate read-only HTTP observation. No Jest test was added or run.

Mercury returned `no_break_found` with no blocking code finding. Mercury alone was selected; Astra and Opus were unselected. Coverage metadata warnings remain explicit. Its blanket wording about no swallowed error is qualified: the existing transport catch logs a failure and returns `[]`; downstream callers mark history unavailable or quarantine failed hydration. This change does not claim a full error-policy audit. Regex-backed reference tools are not AST proof.

Pacing coordinates callers sharing this loaded Node module. Separate utilities or OS processes sharing the same IP can still contribute external traffic. [Kraken documents OHLC public limits per IP and pair](https://support.kraken.com/gb/articles/206548367-what-are-the-api-rate-limits-); this repair does not impose a global bot gate or certify the separate private API rate policy.

**Source repair only; not activated yet.** The bot is still running the preceding `7bc03707` repair. A separately approved restart of `ogz-prime-v2` is needed to observe the new request pacing live. Stop 2 remains open for that activation and the remaining recovery, fencing, handoff and stock-session receipts. Helper setup failures and their corrections are recorded in the detailed CHANGELOG entry; private originals are preserved.
