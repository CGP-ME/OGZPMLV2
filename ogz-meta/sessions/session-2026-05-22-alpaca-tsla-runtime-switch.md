# Session 2026-05-22 - Alpaca TSLA Runtime Switch

## Scope

Trey asked to switch the live paper process from BTC/Kraken back to the intended
stock path, then create a session form before Codex relay. This session made no
tracked production-code edits. Runtime state and `.env` were changed because
the operator had already approved the Alpaca/TSLA switch and called out that the
prior BTC/Kraken runtime was not the intended eval target.

## Prior Session Forms

The prior handoff docs exist on disk:

- `ogz-meta/sessions/session-2026-05-22-state-flatten-restart.md`
- `ogz-meta/sessions/session-2026-05-22-full-visibility-runtime-integrity.md`
- `ogz-meta/sessions/session-2026-05-21-kill5-immutable-scope-deployment-runbook.md`
- `ogz-meta/sessions/session-2026-05-21-kill7-structure-aware-trailing.md`

At this checkpoint, `session-2026-05-22-state-flatten-restart.md` was still
untracked. It should be committed as its own documentation commit so GitHub ZIP
handoffs carry the previous flatten/restart record.

## Pre-Switch State

PM2 process before switch:

- Process: `ogz-prime-v2`
- Status: `stopped`
- Script: `/opt/ogzprime/OGZPMLV2/run-empire-v2.js`

Runtime `.env` before switch:

- `TRADING_PAIR=BTC/USD`
- `BROKER=kraken`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `CANDLE_TIMEFRAME=1m`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `ENABLE_TRAI=false`
- `ACCOUNT_DRAWDOWN_BYPASS=true`
- `ATR_FILTER_ENABLED=true`
- `RISK_MANAGER_BYPASS=false`
- `WEBHOOK_DRY_RUN=true`

`data/state.json` before flatten had BTC/Kraken paper state:

- Active trades: `1`
- Active order id: `SIM_1779469602284_q0bq0a`
- Symbol/scope: `BTC-USD`, `paper:kraken:crypto:BTC-USD:1m`
- Entry strategy: `RSI`
- Entry price: `76865.4135`
- Size USD: `800.7714204181732`
- Closed trades in state: `129`
- Trade counters: `tradeCount=132`, `dailyTradeCount=132`
- Realized PnL: `-1163.465279343835`
- Total PnL: `-153.78958826323174`

This state was valid scoped crypto state, not the old missing-scope legacy
state. It still had to be quarantined because the next process target is
Alpaca/TSLA/stocks/15m.

## Runtime State Action

Backed up `data/state.json` to:

- `ogz-meta/quarantine/state/state-2026-05-22T18-41-52-405Z-pre-alpaca-switch.json`

Then wrote a clean paper runtime state:

```json
{
  "position": 0,
  "positionCount": 0,
  "entryPrice": 0,
  "entryTime": null,
  "balance": 10000,
  "totalBalance": 10000,
  "initialBalance": 10000,
  "inPosition": 0,
  "activeTrades": 0,
  "closedTrades": 0,
  "tradeCount": 0,
  "dailyTradeCount": 0,
  "realizedPnL": 0,
  "unrealizedPnL": 0,
  "totalPnL": 0,
  "symbolEntryHalts": {},
  "lastPrices": {},
  "isTrading": true,
  "recoveryMode": false,
  "lastError": null,
  "pauseReason": null
}
```

## Runtime Env Action

Updated gitignored `.env` to the intended stock route:

- `TRADING_PAIR=TSLA`
- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `CANDLE_TIMEFRAME=15m`
- `PRIMARY_ASSET=TSLA`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `ENABLE_TRAI=false`
- `ACCOUNT_DRAWDOWN_BYPASS=true`
- `ATR_FILTER_ENABLED=true`
- `RISK_MANAGER_BYPASS=false`
- `WEBHOOK_DRY_RUN=true`

PM2 was then flushed and restarted with explicit env overrides for the route and
ATR flag so the process env no longer carried stale `ATR_FILTER_ENABLED=false`.

## Post-Restart Verification

PM2:

- Process: `ogz-prime-v2`
- Status: `online`
- PID at verification: `1098308`
- Restart count: `11`
- Unstable restarts: `0`
- Created at: `2026-05-22T18:43:46.462Z`
- Exec cwd: `/opt/ogzprime/OGZPMLV2`
- Node env: `production`
- Node.js: `22.22.2`

PM2 env verification:

- `TRADING_PAIR=TSLA`
- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `CANDLE_TIMEFRAME=15m`
- `PRIMARY_ASSET=TSLA`
- `ATR_FILTER_ENABLED=true`

Fresh post-flush log evidence:

- `[BrokerFactory] Creating adapter for Alpaca (stocks)`
- `[Alpaca] Paper trading mode`
- `[OrderRouter] TSLA -> alpaca`
- `[BOOT][SymbolContexts] registered TSLA @ 15m`
- `[VIS][BOOT][SymbolContexts] broker=alpaca sessionRouter=false tradingPair=TSLA registered=TSLA envAlpacaSymbols=TSLA`
- `Using existing state - Balance: 10000 Trades: 0`
- `[Alpaca] Connected - account verified`
- `Starting TSLA 15m subscription...`
- `[Alpaca] TX subscribe(bars): {"action":"subscribe","bars":["TSLA"]} | url: wss://stream.data.alpaca.markets/v2/iex`
- `[Alpaca] First bar RX for TSLA @ 2026-05-22T18:43:00Z OHLCV: 429.32 429.61 429.26 429.32 1254`
- `[VIS][OHLC][Runner] source=single broker=alpaca timeframe=1m symbolSource=event.symbol payloadSymbol=TSLA symbol=TSLA close=429.32 contexts=TSLA`
- `Warming up... 0/3 candles (15m timeframe)`

The bot is on Alpaca/TSLA paper mode. It is not yet proving a complete signal
lifecycle because it is warming the 15m context from incoming Alpaca bars.

## Important Watchpoints

1. Alpaca ingress currently reports incoming bar timeframe as `1m` while the
   registered trading context is `TSLA @ 15m`. This can be normal if the adapter
   receives 1m bars and the CandleProcessor aggregates to 15m, but the next
   Codex must verify the first completed 15m analysis path before claiming the
   eval path is fully live.

2. `data/state.json` is clean, but `TradeJournal` still rebuilds `1` historical
   completed trade with `$10010.00` balance. Source on disk:
   `data/journal/trade-ledger.jsonl` contains two old `TEST-001` records from
   March. This is not an open position and does not block entries, but it is
   telemetry/journal contamination. Do not clear this ledger without explicit
   operator approval and a backup/quarantine path.

3. Dashboard/log output still contains old emoji/mojibake strings. That cleanup
   remains deferred and must not be bulk-regex scrubbed.

4. TRAI remains disabled: `ENABLE_TRAI=false`. Current eval observation is the
   base strategy stack plus pattern memory, not TRAI-driven decisioning.

5. `SESSION_ROUTER_ENABLED=false`. This is intentional for the current
   single-symbol stock route. SessionRouter/pattern-bank swap work is not part
   of this runtime switch.

## Recent Hot-Path Commits Already Pushed

- `92dfff0 Updated repo history snapshot`
- `fa16881 Fixed timeframe selector boot order`
- `eeaea36 Updated repo history snapshot`
- `c5923ca Fixed gap recovery symbol timeframe routing`
- `6ceeac1 Updated repo history snapshot`
- `0cc5e9a Fixed live candle timeframe provenance`
- `a8b6714 Updated repo history snapshot`
- `0a6f159 Added repo history snapshot automation`
- `df1273a Added Mercury ack resume pipeline support`
- `9f36d3d Added signal-lineage diagnostics`

## Next Codex Instructions

1. Start by reading this session form and
   `session-2026-05-22-full-visibility-runtime-integrity.md`.
2. Do not modify anchor/baseline docs.
3. Do not use Cursor or GUI tooling.
4. Do not use sed or bulk regex to clean code/log strings.
5. Verify post-restart Alpaca logs from the flush/restart at
   `2026-05-22T18:43:46.462Z` or later.
6. Watch for the first completed 15m candle analysis.
7. Confirm whether the signal path emits candidates, records pattern
   observations, and either enters a paper trade or logs the exact blocking gate.
8. Treat `data/journal/trade-ledger.jsonl` TEST-001 history as a known
   telemetry contamination item requiring explicit approval before quarantine or
   clearing.
