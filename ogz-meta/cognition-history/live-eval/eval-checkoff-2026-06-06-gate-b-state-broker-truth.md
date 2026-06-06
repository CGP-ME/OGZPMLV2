# Gate B State And Broker Truth Proof - 2026-06-06

## Scope

- Repo: `/opt/ogzprime/OGZPMLV2`
- Branch: `codex/multi-runtime-scope-build`
- Head at proof time: `cb57be6 Fixed TTP manual earnings status gate`
- Runtime process checked: `ogz-prime-v2`
- Runtime symbol scope: `paper:alpaca:1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe:stocks:TSLA:15m`
- Market-dependent live signal proof is still blocked by market hours. This file covers the non-market Gate B state/broker proof only.

## Runtime Posture Observed

Filtered PM2 read for `ogz-prime-v2`:

```json
{
  "name": "ogz-prime-v2",
  "status": "online",
  "pid": 1879028,
  "restart_time": 116,
  "pm_uptime": "2026-06-05T22:09:14.312Z",
  "exec": "/opt/ogzprime/OGZPMLV2/run-empire-v2.js",
  "cwd": "/opt/ogzprime/OGZPMLV2",
  "env": {
    "BROKER": "alpaca",
    "ASSET_CLASS": "stocks",
    "ALPACA_SYMBOLS": "TSLA",
    "TRADING_PAIR": "TSLA",
    "PRIMARY_ASSET": "TSLA",
    "SESSION_ROUTER_ENABLED": "false",
    "PAPER_TRADING": "true",
    "LIVE_TRADING": "false",
    "CONFIRM_LIVE_TRADING": "false",
    "WEBHOOK_DRY_RUN": "true",
    "WEBHOOK_ORDERS_ENABLED": "true",
    "RISK_MANAGER_BYPASS": "false",
    "ACCOUNT_DRAWDOWN_BYPASS": "false",
    "EXECUTION_MODE": "paper",
    "CANDLE_TIMEFRAME": "15m",
    "ENABLE_SHORTS": "true",
    "DIRECTION_FILTER": "both",
    "ENABLE_NOWICK": "true",
    "ENABLE_ORB": "true",
    "EVAL_RULES_ENABLED": null,
    "TTP_RULES_ENABLED": null,
    "TTP_EARNINGS_STATUS_JSON": null,
    "ALPACA_API_KEY_PRESENT": false,
    "ALPACA_API_SECRET_PRESENT": false,
    "ALPACA_MODE": null
  }
}
```

PM2 itself does not carry the Alpaca credentials. The app loads `.env`; a separate dotenv presence check found both Alpaca credentials present in process scope after `require('dotenv').config()`.

## Disk State

`data/state.json` was flat:

```json
{
  "path": "data/state.json",
  "mtime": "2026-06-05T21:36:46.770Z",
  "isTrading": true,
  "recoveryMode": false,
  "pauseReason": null,
  "lastError": null,
  "position": 0,
  "inPosition": 0,
  "activeTradeCount": 0,
  "activeTrades": [],
  "symbolHaltKeys": [],
  "openPositionKeys": []
}
```

## Scoped Trade Journal Rebuild

The scoped ledger was rebuilt through `core/TradeJournal.js` with explicit scope:

- `dataDir`: `data/journal/5-paper__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-TSLA__3-15m`
- `ledgerPath`: `data/journal/5-paper__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-TSLA__3-15m/trade-ledger.jsonl`
- `startingBalance`: `10000`

Rebuild output:

```json
{
  "source": "core/TradeJournal.js constructor rebuild",
  "ledgerMtime": "2026-06-05T19:37:50.582Z",
  "ledgerLines": 6,
  "eventCounts": {
    "ENTRY": 3,
    "EXIT": 2,
    "OPEN_TRADE_RECONCILED": 1
  },
  "scope": {
    "symbol": "TSLA",
    "brokerId": "alpaca",
    "accountId": "1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe",
    "accountIdSource": "broker",
    "assetClass": "stocks",
    "executionMode": "paper",
    "timeframe": "15m",
    "scopeKey": "paper:alpaca:1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe:stocks:TSLA:15m",
    "scopeKeyVersion": 2,
    "scopeComplete": true
  },
  "completedTrades": 2,
  "openTrades": 0,
  "entryOrderIds": 3,
  "stats": {
    "totalTrades": 2,
    "currentBalance": 9998.675366129415,
    "netPnl": -1.3246338705848155,
    "todayTrades": 0,
    "todayPnl": 0
  }
}
```

The current scoped journal does not rebuild the stale orphan as open exposure. It rebuilds two completed trades and zero open trades.

## Alpaca Paper REST Truth

Alpaca paper REST was queried with dotenv-loaded credentials and no secrets printed.

```json
{
  "source": "Alpaca paper REST /v2/account + /v2/positions",
  "credentialsPresent": true,
  "accountId": "1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe",
  "accountIdMatchesJournalScope": true,
  "status": "ACTIVE",
  "tradingBlocked": false,
  "transfersBlocked": false,
  "accountBlocked": false,
  "positionCount": 0,
  "tslaPositionCount": 0,
  "symbols": []
}
```

The repo adapter path `brokers/AlpacaAdapter.js#getPositions` also returned:

```json
{
  "mode": "paper",
  "credentialsPresent": true,
  "positionCount": 0,
  "tslaPositionCount": 0,
  "positions": []
}
```

## Gate B Result

For the current `ogz-prime-v2` paper runtime:

- `data/state.json` is flat.
- Scoped TradeJournal rebuild is flat.
- Alpaca paper REST account matches the scoped journal account.
- Alpaca paper REST has zero open positions and zero TSLA positions.
- Local state, scoped journal, and broker truth agree: no open TSLA exposure.

Gate B is clean for current paper runtime state/broker truth.

This does not clear eval-live posture. Runtime still reports `PAPER_TRADING=true`, `LIVE_TRADING=false`, `WEBHOOK_DRY_RUN=true`, and unset `EVAL_RULES_ENABLED` / `TTP_RULES_ENABLED` / `TTP_EARNINGS_STATUS_JSON`. Those belong to Gate A/runtime posture before the eval switch.
