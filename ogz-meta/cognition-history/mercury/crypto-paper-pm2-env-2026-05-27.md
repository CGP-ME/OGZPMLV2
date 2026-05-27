# Mercury Attack Prompt: Crypto Paper PM2 Env Flip

Attack this uncommitted config-only change. Do not confirm it.

Changed file and line range:
- `ecosystem.config.js:18-39`

Runtime verification already observed from PM2 process id 4:
- `EXECUTION_MODE=paper`
- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `CONFIRM_LIVE_TRADING=false`
- `BROKER=kraken`
- `ASSET_CLASS=crypto`
- `PRIMARY_ASSET=BTC-USD`
- `TRADING_PAIR=BTC-USD`
- `ALPACA_SYMBOLS=` empty
- `CANDLE_TIMEFRAME=1m`
- `SESSION_ROUTER_ENABLED=false`
- `ACCOUNT_DRAWDOWN_BYPASS=false`
- `RISK_MANAGER_BYPASS=false`

Attack questions:
1. Can this config accidentally enable live trading, SignalStack live dispatch,
   or broker order placement outside paper mode?
2. Can stale stock/TSLA/Alpaca state leak in despite this env block?
3. Does empty `ALPACA_SYMBOLS` create a fallback bug or misleading dashboard
   symbol while the bot is in crypto mode?
4. Does keeping `SESSION_ROUTER_ENABLED=false` avoid the unfinished
   SessionRouter transition path, or is there another code path that can still
   flip brokers/sessions?
5. Are `ACCOUNT_DRAWDOWN_BYPASS=false` and `RISK_MANAGER_BYPASS=false` enough
   to avoid runtime bypass drift, or is another bypass env unpinned in this PM2
   config?
6. Does this change belong as config-only, or does it hide a code root cause?

Return blocker findings first with exact file:line citations. If no blocker,
state residual risks and whether P0 is relevant for this config-only change.
