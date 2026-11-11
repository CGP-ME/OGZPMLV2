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
