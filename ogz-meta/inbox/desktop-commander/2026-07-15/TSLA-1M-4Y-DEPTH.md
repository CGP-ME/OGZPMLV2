# TSLA 1m 4y Depth Check

Mission: check Alpaca IEX 1-minute history depth and create a new TSLA 4-year file only if reachable.

## Result

4-year Alpaca IEX 1m depth was reachable. New files were created; no existing target was overwritten.

```json
{
  "file": "tuning/tsla-1m-4y.json",
  "bytes": 50425019,
  "sha256": "d156d68fa530a1cbff0a34e9e86be33b08fcfe8f77e9e4ef67d8e2b126e4db07",
  "count": 385377,
  "firstIso": "2022-07-18T13:01:00.000Z",
  "lastIso": "2026-07-15T19:59:00.000Z",
  "metadata": {
    "provider": "alpaca",
    "feed": "iex",
    "feedType": "single-exchange",
    "adjustment": "raw",
    "sessionProfile": "alpaca_bars_no_session_filter",
    "timestampConvention": "bar_start_ms_aligned",
    "symbol": "TSLA",
    "timeframe": "1m",
    "alpacaTimeframe": "1Min",
    "requestedStart": "2022-07-16T10:31:42.463Z",
    "requestedEnd": "2026-07-16T10:31:42.463Z",
    "firstTimestamp": 1658149260000,
    "firstIso": "2022-07-18T13:01:00.000Z",
    "lastTimestamp": 1784145540000,
    "lastIso": "2026-07-15T19:59:00.000Z",
    "candleCount": 385377,
    "generatedAt": "2026-07-16T10:31:56.972Z",
    "source": "scripts/fetch-stock-data.js"
  }
}
```

## Files

```text
-rw-rw-r-- 1 linuxuser linuxuser 49M Jul 16 10:31 tuning/tsla-1m-4y.json
-rw-rw-r-- 1 linuxuser linuxuser  89 Jul 16 10:31 tuning/tsla-1m-4y.sha256
```

## Fetch Log

```text
ogz-meta/inbox/desktop-commander/2026-07-15/tsla-1m-4y-fetch.log
```
