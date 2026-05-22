# Session 2026-05-22 - State Flatten And PM2 Restart

## Scope

Trey explicitly approved flattening the legacy paper trade state, restarting the live PM2 process, and creating this session form. No production code was edited in this session.

## Files And Runtime State Touched

- `data/state.json` - runtime state flattened.
- `ogz-meta/quarantine/state/state-2026-05-22T00-39-18Z-pre-flatten-restart.json` - pre-flatten backup.
- `ogz-meta/sessions/session-2026-05-22-state-flatten-restart.md` - this session form.

No git staging, commit, or push was performed for this session-form work.

## Pre-Flatten State

The active legacy paper trade was preserved in the quarantine copy before mutation:

- Trade id/order id: `SIM_1779387532068_y9jfmt`
- Symbol: `BTC-USD`
- Action/direction: `BUY` / `long`
- Entry strategy: `MADynamicSR`
- Entry price: `77772.96705`
- Size and sizeUsd: `1634.7889391043645`

The trade was legacy state and did not carry the full immutable trade-scope fields expected by the current loader. Restarting directly against it would have kept the KILL 5 deployment gate open.

## Action Taken

1. Stopped `ogz-prime-v2` under PM2 before mutating state.
2. Copied `data/state.json` to `ogz-meta/quarantine/state/state-2026-05-22T00-39-18Z-pre-flatten-restart.json`.
3. Flattened `data/state.json`:
   - `position: 0`
   - `positionCount: 0`
   - `entryPrice: 0`
   - `entryTime: null`
   - `inPosition: 0`
   - `activeTrades: []`
   - `symbolEntryHalts: {}`
   - `unrealizedPnL: 0`
   - `balance: 10000`
   - `totalBalance: 10000`
   - `lastError: null`
   - `recoveryMode: true`
4. Restarted `ogz-prime-v2` through PM2.

## Verification

Current `data/state.json` after restart:

```json
{
  "lastUpdate": "2026-05-22T00:39:45.741Z",
  "balance": 10000,
  "totalBalance": 10000,
  "position": 0,
  "inPosition": 0,
  "activeTrades": 0,
  "symbolEntryHalts": {},
  "lastError": null,
  "recoveryMode": true
}
```

PM2 verification:

- Process: `ogz-prime-v2`
- Status: `online`
- Version: `14.0.0`
- Restarts: `2`
- Unstable restarts: `0`
- Script: `/opt/ogzprime/OGZPMLV2/run-empire-v2.js`
- Node env: `production`
- Node.js version: `22.22.2`
- Created at: `2026-05-22T00:40:04.736Z`

Observed boot/runtime log evidence:

- Modules initialized successfully.
- Runtime mode fingerprint shows `EXECUTION_MODE=paper`, `CANDLE_SOURCE=live`, `DIRECTION_FILTER=long_only`, `BACKTEST_MODE=false`, `ENABLE_SHORTS=false`, `ENABLE_TRAI=false`.
- Dashboard WebSocket connected and authenticated.
- Kraken adapter connected.
- `BTC/USD` subscription started.
- TradeJournal rebuilt with `1` completed trade and `0` open positions.
- Trading cycle started.
- No new active trade was present in state after restart.

## Remaining Operational Issues

These were observed and intentionally left for a follow-up decision instead of being changed during the flatten/restart task:

- Mixed runtime context: logs show Kraken/BTC/USD routing active while boot also registers `TSLA @ 15m` and routes the first candle to a TSLA context. Before eval or confidence in live/paper behavior, confirm the intended target asset, broker, timeframe, and symbol context.
- Repeated error-log noise: `[HALT] Invalid confidence: 0 - skipping trade` continues while the orchestrator reports zero strategies returning signals. This is not crashing the process, but it should be reviewed because a no-signal hold path may be producing halt-level noise.
- Some older log lines still show webhook drift and Kraken unknown asset pair errors from before the flatten/restart. Treat only fresh post-restart lines as current evidence.
- The recent fix campaign included broad rollback units in `4bb887e` and `d49ffa6`. Future work needs strict one-logical-change commits and explicit rollback/bisect boundaries.

## Next Session Context

Do not treat "PM2 online" alone as eval-ready. The state flatten and restart succeeded, but the next checkpoint should be a deliberate runtime configuration review:

- Decide whether the process is meant to run BTC/USD or TSLA right now.
- Verify PM2 environment against the intended asset and broker.
- Confirm candle routing, symbol context, and broker symbol conversion are aligned.
- Only after that, inspect the zero-confidence halt noise and decide whether it is logging severity, strategy registration, or confidence-contract behavior.
