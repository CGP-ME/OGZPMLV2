# Historical REST candle retriever

`tools/fetch-candles.py` downloads provider-native historical OHLCV without starting the bot, placing orders, changing settings or reading learned state. Python 3.9+ and the system `America/New_York` timezone database are required; no additional Python packages.

## Commands

Run from the repository root. Every download requires a **new output directory**.

### Crypto: explicit dates

```bash
python3 tools/fetch-candles.py \
  --asset crypto --symbol BTC-USD --timeframe 15m \
  --start 2020-01-01 --end 2020-02-01 \
  --output backtest-results/candles-btc-2020-01
```

### Crypto: lookback ending now

```bash
python3 tools/fetch-candles.py \
  --asset crypto --symbol BTC-USD --timeframe 1h \
  --lookback 30d --output backtest-results/candles-btc-last-30d
```

`--lookback` accepts a positive integer followed by `s`, `m`, `h`, `d` or `w`. Combine it with `--end` to look backward from an earlier date. Use explicit dates for calendar months/years; `30d` means 30 days, not a calendar month.

### Stocks: existing Alpaca credentials and historical SIP

```bash
python3 tools/fetch-candles.py \
  --asset stocks --symbol TSLA --timeframe 15m \
  --start 2016-01-04 --end 2016-02-01 \
  --feed sip --adjustment raw --env-file .env \
  --output backtest-results/candles-tsla-2016-01
```

Alpaca uses `ALPACA_API_KEY` and `ALPACA_API_SECRET` from the process environment, or those two keys from an explicitly selected `--env-file`. The file is not sourced or evaluated; other settings are not loaded into the bot. Use plain `KEY=value` assignments, optionally quoting the whole value; shell `export`, substitution and inline-comment syntax are not supported. Do not paste secrets into commands or chat.

SIP is the default consolidated historical stock feed. `--feed iex` selects IEX-only data, which is a different dataset and may not have the same older history. Access depends on your account and the requested date. No subscription is purchased. For stock lookbacks without `--end`, the resolved end is now minus 16 minutes for delayed historical access; it is recorded in the receipt. An explicit end is never silently moved to avoid an access error.

`--adjustment raw` is the default; `split` and `all` are explicit alternatives. Raw multi-year stock prices can contain corporate-action discontinuities. Choose deliberately and retain the receipt. Extended-hours bars returned by the provider are not filtered out.

### Pick the sources and fallback order

```bash
python3 tools/fetch-candles.py \
  --asset crypto --symbol BTC-USD --timeframe 1d \
  --start 2011-09-01 --end 2011-09-08 \
  --sources kraken,bitstamp \
  --output backtest-results/candles-btc-2011-09
```

This tries the entire range on Kraken, then the entire range on Bitstamp if Kraken cannot supply it. Failed attempts stay visible. **It never splices different venues into one series.**

Default `--sources auto`:

| Request | Source order |
| --- | --- |
| Stocks | Alpaca |
| Crypto quoted in USD | Bitstamp, Coinbase Exchange, Kraken |
| Other crypto quotes | Binance, Bitstamp, Kraken |

Symbols are case-sensitive: `TSLA`, `BTC-USD`, `BTC-USDT`. USD is not USDT. A provider that does not list the exact market can fail/fall back; no quote substitution occurs. Kraken's BTC-to-XBT API spelling is recorded separately.

## Timeframes and date rules

```bash
python3 tools/fetch-candles.py --list-timeframes
```

| Source | Supported native intervals |
| --- | --- |
| Alpaca stocks | `1m`–`59m`, `1h`–`23h`, `1d`, `1w`, `1M`, `2M`, `3M`, `4M`, `6M`, `12M` |
| Binance | `1s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M` |
| Bitstamp | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`, `3d` |
| Coinbase Exchange | `1m`, `5m`, `15m`, `1h`, `6h`, `1d` |
| Kraken | `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`, `15d` |

`m` means minute; capital `M` means calendar month. Interval support does not guarantee a symbol existed or has retained data for the requested dates. No local resampling/aggregation or synthetic gap filling is performed.

Dates are UTC midnight. Timestamps require a timezone, for example `2020-01-01T09:30:00-05:00`. Bounds must be exactly representable in milliseconds: finer nonzero precision is rejected, not silently rounded. The interval is **start-inclusive, end-exclusive**. Only bars wholly inside the requested interval and completed by the captured as-of time are retained. An unaligned start can exclude its overlapping candle; an end inside a candle excludes that candle. Provider calendar bars use their calendar boundaries: Alpaca daily/weekly/monthly in New York with DST, Binance monthly in UTC. This is not a stock trading-holiday calendar.

## Outputs and honest coverage

- `candles.json`: sorted numeric OHLCV array, millisecond opening timestamps, plus `symbol`, `timeframe`, `source`, `complete`. Decimal price/volume values are preserved in JSON without an intermediate binary-float conversion. Downstream JavaScript/Python consumers retain their own numeric precision limits.
- `receipt.json`: resolved request, as-of time, selected source/feed/adjustment, attempts and coverage limitations.
- `attempt-NN-provider.json`: pagination, request/retry counts, duplicate/filter counts, actual first/last timestamp, gaps and failures.
- `attempt-NN-provider-pages.jsonl`: successful candle response payloads and non-secret request parameters. No authentication headers or HTTP error bodies are stored.

Exit `0` means a nonempty accepted provider result was published, **not** that every possible market bar is present. `coverageUnknown` stays true: API exhaustion is not proof of complete history, and absent bars can mean no ticks, market closure, outage or retention limits. Crypto interbar gaps remain visible; stock gap counts are not guessed from a 24/7 grid. Gross leading/trailing absence is refused using a disclosed tolerance: at least one day for crypto, seven days for stocks, or one native bar if longer. Thin/delisted markets or long closures may therefore be refused; smaller missing boundaries can still remain in accepted data.

Exit `1` means retrieval/publication failed, including empty data, retention limits, page cap, access denial or invalid provider candles. Exit `2` means invalid arguments or a non-new/unwritable output directory. Read the receipt, not just the last console line. Attempt status is explicitly `retrieval_only`; final output is committed by the success `receipt.json`, written last after staging both files. Caught write/rename/interruption failures trigger best-effort cleanup and a failed receipt where possible. A hard kill between renames can leave candles without a success receipt; neither cross-file crash atomicity nor physical-disk durability is guaranteed. Interrupted or filesystem-failed runs may retain incomplete evidence; they are not reusable successful downloads.

Controls: `--timeout` (default 30 seconds per request), `--retries` (default 3 retries), `--page-size` (default 1000; capped per API), `--max-pages` (default 10000 per source). Reaching the page cap fails instead of publishing a truncated result. Requests are paced, redirects disabled, and rate-limit retry instructions bounded. Multi-year minute/second requests can take many calls and significant memory/disk: rows are accumulated in memory, and raw responses are also saved. Use sensible date windows; this version has no resume support.

## Feed the matrix

```bash
python3 tools/backtest-matrix.py \
  --plan tools/backtest-matrix.example.json \
  --data backtest-results/candles-tsla-2016-01/candles.json \
  --dry-run
```

The example plan is TSLA/15m. Match the plan's symbol and timeframe to the download. Replace `--dry-run` with a new `--output` directory to run the matrix.

The current matrix accepts `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d` and `5sec`; this retriever does not provide `5sec`. Downloader support for other native intervals does **not** add those intervals to the matrix. Crypto replay uses the matrix's existing Kraken execution identity, even when input prices come from another explicitly labelled venue; that is a cross-venue research input, not proof of Kraken historical price/fill parity. This tool does not alter matrix, fee, execution or strategy behavior.

## Availability verified, not unlimited history promised

Small real requests returned BTC/USD candles from Bitstamp in September 2011, Coinbase in August 2015, BTC/USDT from Binance in August 2017, and TSLA SIP bars from Alpaca in January 2016. These establish those sampled markets/dates only—not earliest availability or complete history for all symbols. Kraken REST OHLC retains only its recent 720 entries; `since` cannot recover arbitrarily old history. Its downloadable archives are a separate ingestion path and are not implemented here.

Official contracts: [Alpaca](https://docs.alpaca.markets/reference/stockbars), [Bitstamp](https://www.bitstamp.net/api/), [Coinbase Exchange](https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles), [Binance](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints), [Kraken](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data/).

## Offline regression commands

```bash
python3 scripts/test-isolated.py \
  --fixture test/fixtures/fetch-candles-observation.py \
  -- python3 test/fixtures/fetch-candles-observation.py
python3 scripts/test-isolated.py \
  --fixture test/fixtures/fetch-candles-boundaries.py \
  -- python3 test/fixtures/fetch-candles-boundaries.py
```

Fixtures use labelled synthetic HTTP payloads in the prescribed isolated environment. They are not real-source evidence. Actual REST retrieval is a separately authorized standalone data operation; no trading modules are imported by the downloader.
