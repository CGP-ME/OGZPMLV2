# Review of the pushed backtest matrix and REST candle retriever

Reviewed source: `9f3530103e7fec15cf9bf45106953966c3ec6878` on
`codex/archive-legacy-env`, confirmed on origin before review. Requested commits:
`86d615affbad086fcf83568c79af899f9a5fb1af` (matrix) and
`9f3530103e7fec15cf9bf45106953966c3ec6878` (retriever).

## Coverage and method

Read all 11 distinct changed paths across those commits: both tool implementations,
both guides, the example matrix plan, all four native fixtures, the isolation
launcher's source-admission change, and the two changelog entries. The two tool
implementations total 996 lines. Traced relevant ConfigLoader, BacktestRunner,
BacktestRecorder, DataFileInstrument and StrategyOrchestrator consumers. This is
a review of these changes and their immediate integration, not a whole-bot audit.

All native verification used `scripts/test-isolated.py`. Its disposable copy
received the committed versions of the 20 inherited dirty files; 846 admitted
source hashes then matched the reviewed commit before each observation. Nothing
was restored or removed in the shared checkout. Existing source checks and the
full-runner observation were repeated against that committed source. Private
fixtures add focused observations; no Jest was added or run.

Official [Alpaca](https://docs.alpaca.markets/us/reference/stockbars),
[Binance](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market),
[Bitstamp](https://www.bitstamp.net/api/),
[Coinbase Exchange](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)
and [Kraken](https://docs.kraken.com/api-reference/market-data/get-ohlc-data)
candle contracts were consulted. The provider-specific pagination, quote identity and completion
rules in this review have no identified new blocking defect. This is bounded by
the execution evidence below, not certification of every provider/window.

## Findings

### 1. Crypto replay has no usable configured fee profile — P2

`tools/backtest-matrix.py:143` admits `kraken/crypto`, but lines 151–153 require
an existing fee profile that explicitly supports the asset class. At the reviewed
commit, `config/settings.json` defines only `ttp_real` and `zero`, both for stocks.
Consequently no crypto plan can pass validation with the shipped configuration.

Reproduction: the real 96-bar Bitstamp BTC/USD download passed the matrix candle
validator. Trying every configured fee profile rejected the crypto plan with
`feeProfile must explicitly cover the selected asset class`. This is not a
provider outage or a candle-format problem. Receipt: `crypto-fees.json`.

Needed repair: establish the intended crypto fee profile in the canonical
configuration and connect it to the existing descriptor selection. Do not apply
stock commissions or invent a zero-fee/default profile to get a successful run.
No configuration or fee assumptions were changed during this review.

### 2. Valid stock identities still fail an old filename whitelist — P2

`tools/backtest-matrix.py:145` accepts a canonical stock ticker, and lines 265–270
write that identity into both the temporary filename and typed run descriptor.
However, `core/BacktestRunner.js:78` invokes
`core/DataFileInstrument.js:73`, whose asset classification still depends on
historical tuning ticker lists (`configuredStockTickers`, line 18), despite the
descriptor already declaring the asset class.

Reproduction: an explicit AAPL/stocks plan and labelled synthetic AAPL candle
both passed the new validators. The actual runner then exited 1 with
`Cannot derive asset class ... aapl-15m.json`; the cell reported
`expected_one_structured_report_found_0`. AAPL is absent from those old shortcut
lists. Receipt: `stock-identity.json`; original error: `stock-identity-runner.log`.

The restrictive inference predates the new matrix. The new interface nevertheless
accepts inputs its runner cannot execute. Needed repair: use the validated
descriptor identity in the replay consumer and reconcile dataset identity there,
rather than requiring unrelated historical shortcut entries for each ticker.

### 3. A disabled selected strategy is reported as an ordinary no-trade cell — P2

`tools/backtest-matrix.py:46` validates strategy names against contracts, and
line 90 applies the selected names as `soloFilter`; it never verifies that the
selected operational profile enables those strategies. `MarketRegime` is an
explicitly supported stop owner at line 28 but is disabled in the paper profile.
The existing orchestrator removes disabled built-ins in `_applyPipelineToggles`.

Reproduction: selecting only MarketRegime passed plan validation. The actual
runner consumed 130 synthetic candles and returned exit 0, `executionComplete`
true and `no_trades`. A separate native call to the actual pipeline-toggle
consumer confirmed `configuredEnabled: false`, `selected: ["MarketRegime"]`,
`active: []`. Receipts: `disabled-strategy.json` and
`strategy-admission-native.log`.

The new classifier at `tools/backtest-matrix.py:335` treats this the same as an
active strategy that found no qualifying trades. Needed repair: identify an
inactive selected strategy during plan/resolved-configuration validation and
record a named unavailable/invalid experiment. Preserve the operator's disabled
setting; do not revive MarketRegime to make the sweep run.

## Actual behavior observed

| Observation | Input and result |
| --- | --- |
| Real REST retrieval | Bitstamp BTC/USD, 15m, January 1–2 2020 UTC: 96 completed bars, two HTTPS GETs, no retries, no observed gaps or boundary shortfall. Every emitted OHLCV value reconciled exactly with the saved provider payloads. |
| Actual runner, synthetic mechanics | 320 generated TSLA/15m bars, 96 recorded trades, no candle/state-mutation/window-close errors, no policy-parameter mismatches. Fees summed to $144; reported net P&L reconciled within floating-point precision. No historical-performance claim. |
| Actual runner, real historical input | Hermes's saved Alpaca SIP/raw TSLA January 2016 download: all 829 bars processed, 147 recorded trades, zero candle/state-mutation/window-close errors, zero policy-parameter mismatches, no window-end rows. Fees summed to $220.50; net P&L reconciled to -$353.7989401999937. This single illustrative configuration/window is not a strategy recommendation or validation. |
| Position overlap | Persisted entry/exit intervals in both completed runner observations had at most one distinct open trade at a time. No general concurrency certification is claimed. |
| Error and boundary handling | Existing isolated fixtures exercised short-page pagination, range limits, duplicate conflicts, malformed/unclosed candles, bounded HTTP failures, publication failures, source drift and invalid plan rejection. Their raw outputs remain linked; pass counts are not offered as product acceptance. |

`verification-summary.json` reconciles these observations. Raw provider pages,
individual cell reports and full original logs remain local in this directory.
The stock file was previously downloaded by Hermes; this review did not issue a
new credentialed Alpaca request. The fresh Bitstamp operation used an empty
environment except PATH and made only public data requests.

## Remaining limitations and disposition

The actual 829-bar stock replay logged 151 `FEATURE_VECTOR_UNAVAILABLE:
feature_input_unavailable` messages and five
`PATTERN_FEATURES_UNAVAILABLE: indicator_feature_unavailable` messages while the
runner reported zero candle-processing errors. These existing feature-path
warnings must not be confused with a warning-free or fully correct run. Their
complete cause was not diagnosed here. The underlying historical dataset
contains 125 zero-range bars; that count alone does not attribute all warnings.

The documented offline limitations remain: no external TrAI service, no deployed
learned state, one symbol/native timeframe, unresolved OHLC intrabar ordering,
partial stop-geometry verification, and separate treatment of window-end closes.
The native observations do not certify every matrix combination, full MTF
behavior, broker fills, live paper operation, or profitability.

The March backtest operations guide contains older environment-based examples;
the current typed descriptor implementation and the new tool guides were used
to establish actual launch behavior. No old anchor lane was invoked.

All three findings remain open for an authorized repair. No production source,
configuration, model adapter, credentials, state, PM2 process or RAG index was
changed. This delivery records the review only. No new Mercury/panel dispatch was
made for this prose-only report; the earlier authors' reviews are not presented
as approval of these newly reproduced findings.

## Follow-up: throws, silent behavior and doctrine compliance

Trey specifically requested this follow-up. The two tool files remain byte-for-byte
identical to their Hermes commits. This is an audit, not authorization to repair
the implementations. The governing rules are `ogz-meta/AGENTS.md:32,46-53` and
`ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md:7-21,35`.

### Explicit exceptions and scope

The Python AST census found 38 explicit error raises and two assertions in
`tools/backtest-matrix.py`; `tools/fetch-candles.py` has 41 explicit error raises
plus the normal `raise SystemExit(main())` CLI exit. Total: 79 error-raise sites,
two assertions, and 19 exception handlers. `doctrine-census.json` records their
individual line numbers, containing functions and source statements.

This is not evidence of 79 live-bot shutdown paths. The commits introduce
standalone utilities, guides and fixtures; the only shared helper change admits
these source files to isolation. No production caller was found in the searched
runner/core/foundation/modules/brokers/scripts/tools source. The downloader has no
PM2, signal or trading-runtime invocation. Matrix runner invocations occur inside
the existing mandatory isolated helper. `AGENTS.md:118` explicitly permits missing
isolation to stop that helper, never the bot.

Nevertheless, external exchange failures are implemented using new exceptions:
for example invalid OHLCV and conflicting duplicate bars raise `FetchError` at
`tools/fetch-candles.py:143,146`, then the whole source attempt is marked failed at
463-464. That does not implement the Fourth Shape's stated external-fault routing.
The matrix also adds internal assertions at 343 and 469. The latter repeats an
already-established condition: argument validation at 458-459 requires output
unless dry-run, and dry-run returns at 466-468. These should not be described as
producer fixes. Removing validation indiscriminately is not the remedy; preserve
explicit rejection of unusable inputs while resolving each site's producer and
failure-routing contract. No blanket claim that every CLI rejection is a bot
shutdown is made.

### Confirmed silent behavior

1. **Discarded errors in the downloader.** There are three literal catch/pass
   handlers at `tools/fetch-candles.py:322,487,492`. Invalid rate metadata is
   silently ignored; cleanup and failure-receipt write errors are also swallowed.
   An isolated synthetic observation reached a publication write error, a cleanup
   error and a failure-receipt write error. `run()` returned 1, emitted no error
   diagnostics, retained `candles.json.tmp`, and left no final `receipt.json`.
   The outer CLI only adds its exit-code/receipt-directory message. This is a
   lost-diagnostics/receipt problem, not a falsely successful download. A separate
   synthetic 429 with malformed Retry-After retried successfully with conservative
   backoff but recorded no metadata warning.
2. **Different failures lose their identity.** At 465-466, malformed provider
   data, programming/type errors and disk errors collapse into
   `malformed_provider_response_or_io_failure`. A synthetic Alpaca bar missing
   OHLCV fields reproduced that exact generic receipt. The failed status and raw
   payload remain, but the exception type, missing field and failure stage do not.
   Argument, network and outer I/O handlers at 100,328,508 also replace specific
   causes with generic messages. Sanitization must not become silent erasure of
   non-secret diagnostic identity.
3. **Unreported credential mixing.** `read_credentials` at 357-376 first copies
   both credentials from the environment and then replaces only keys present in
   an explicit file. An isolated run supplied a file containing only the key ID
   and an environment containing the secret. The actual request construction
   combined them; the resulting receipt had no credential-source/warning field.
   The transport and credentials were synthetic, so this is not a claim that
   Alpaca accepted that combination. This affects account-credential provenance,
   not trading-parameter configuration.
4. **Inactive experiment reported as normal no-trade.** Finding 3 above remains
   the concrete matrix ambiguity: the selected disabled strategy was absent from
   the active pipeline, yet 130 processed bars yielded an exit-0 `no_trades` result.
   The disabled setting must remain authoritative; the experiment's unavailable
   state needs to be named instead of represented as ordinary zero activity.

These are open compliance findings. The matrix's requested confidence/ATR/stop
changes are separately documented and receipted (`backtest-matrix.py:37-100`),
applied only to the isolated copy at 255-288. The explicit provider fallback order
also preserves failed attempts and records the selected provider. Neither was
found to silently overwrite the running bot's configuration in these commits.

### Verification and disposition

The new observations ran through `scripts/test-isolated.py` against 846 matching
source hashes from `9f3530103e7fec15cf9bf45106953966c3ec6878`. Receipts are
`doctrine-observation.json`, the complete `doctrine-observation-final.log`, and
the private `fixtures/doctrine-observation.py`. No real credentials, network,
operator state or trading process were used. An initial fixture incorrectly
shaped Alpaca's multi-symbol bars as an array; its retained log is
`doctrine-observation.log`. Only the fixture was corrected to use the actual
provider-shaped symbol map before the final observations.

Named deferral: implementation repairs await Trey's decision after this audit.
Only this report and a detailed changelog entry are delivered. No production
source, configuration, credential, PM2 process or RAG index was changed. No Jest
or paid adversarial dispatch was used for this documentation-only follow-up.
