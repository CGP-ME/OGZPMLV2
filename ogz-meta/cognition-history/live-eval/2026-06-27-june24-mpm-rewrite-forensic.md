# 2026-06-24 Eval Bleed Forensic For MPM Rewrite

Status: forensic fixture, no production code changed.

Purpose: pin the current evidence before the MaxProfitManager rewrite so the rewrite does not claim to fix an unproven cause.

## Source Material Read

- `ogz-meta/ledger/deepsearchmpmrewrite.md`
- `ogz-meta/ledger/DEEPSEARCHRESPONSETOMPMAUDITREWRITE.md`
- `ogz-meta/ledger/gptresponsetofollowupofmpmauditv2.md`
- `ogz-meta/ledger/TODAYSconvo.md`
- `ogz-meta/ledger/mpmaudit.md`
- `ogz-meta/cognition-history/live-eval/2026-06-24-live-trade-autopsy.md`
- Current code in `core/TradingLoop.js`, `core/OrderExecutor.js`, `core/StateManager.js`, `core/MaxProfitManager.js`, `core/TradeJournalBridge.js`, `core/TradeReplayCapture.js`, `core/TradeJournal.js`, and `core/BacktestRecorder.js`.

## Current Proven Trade Facts

Journal rows confirm the June 24 stop exits were materially wider than the configured stop intent.

| Order | Symbol | Direction | Entry UTC | Exit UTC | Entry | Exit | Exit reason | Net PnL | Net PnL % |
| --- | --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| `43582003` | MARA | short | 2026-06-24T13:45:03.787Z | 2026-06-24T14:00:06.517Z | 14.34 | 14.64 | stop_loss | -14.25 | -2.2083 |
| `43588406` | RIOT | long | 2026-06-24T14:00:00.924Z | 2026-06-24T14:15:03.922Z | 28.065 | 27.71 | stop_loss | -3.945 | -1.5619 |
| `43601773` | MARA | short | 2026-06-24T14:45:00.791Z | 2026-06-24T15:00:16.374Z | 14.12 | 14.345 | stop_loss | -10.65 | -1.7142 |
| `43607498` | MARA | short | 2026-06-24T15:15:00.730Z | 2026-06-24T15:30:15.125Z | 14.225 | 14.325 | stop_loss | -4.55 | -0.8417 |
| `43609501` | NVDA | short | 2026-06-24T15:30:02.951Z | 2026-06-24T16:45:02.039Z | 200.91 | 199.67 | be_scaleout | +0.865 | +0.4305 |
| `43609501` | NVDA | short | 2026-06-24T15:30:02.951Z | 2026-06-24T18:30:01.873Z | 200.91 | 198.585 | flip_position | +1.95 | +0.9706 |

These rows come from the live scoped journals under:

- `data/journal/4-live__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-MARA__3-15m/trade-ledger.jsonl`
- `data/journal/4-live__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-RIOT__3-15m/trade-ledger.jsonl`
- `data/journal/4-live__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-NVDA__3-15m/trade-ledger.jsonl`

## What The Current Code Proves

### 1. ECM is still safety-only and MPM is still a second exit authority.

`core/ExitContractManager.js:124-126` says take-profit and trailing were removed because MPM owns profit-side exits. `core/TradingLoop.js:630-640` calls ECM first in exit-only mode, and `core/TradingLoop.js:659-688` calls MPM second. The candle path has the same split at `core/TradingLoop.js:939-949` and `core/TradingLoop.js:972-995`.

Conclusion: the current code still has two exit authorities. The rewrite direction should be `ExitContractManager` as the single exit coordinator, with any profit planner called inside ECM, not from TradingLoop after ECM.

### 2. MPM still owns private mutable trade truth.

`core/MaxProfitManager.js:252-260` stores private `remainingSize`, `entryOrderQuantity`, and `remainingOrderQuantity`.

`core/MaxProfitManager.js:598-625` marks BE scale-out fired and subtracts `remainingSize` / `remainingOrderQuantity` before broker execution or StateManager confirmation.

`core/MaxProfitManager.js:932-963` marks a tier completed and subtracts `remainingSize` inside `executePartialExit`, also before broker execution or StateManager confirmation.

Conclusion: MPM is still allowed to believe a partial exit happened before the execution layer proves it. The replacement must make the planner intent-only and move remaining-quantity truth to StateManager after confirmed fill facts.

### 3. MPM lookup keys are still inconsistent.

OrderExecutor stores MPM instances by broker order id:

- `core/OrderExecutor.js:1923`
- `core/OrderExecutor.js:2132`

TradingLoop reads them by different keys:

- `core/TradingLoop.js:659` uses `activeTrade.id || activeTrade.orderId`
- `core/TradingLoop.js:973` uses `activeTrade.id`

Conclusion: one loop path can see an MPM while another misses it if active trade identity shape changes. The rewrite must remove `ctx.maxProfitManagers` entirely after cutover.

### 4. Exit-only price freshness was partially improved, but the candle path is still not proven equivalent.

Exit-only currently prefers `stateManager.getLastPrice(symbol)` over `marketData.price` at `core/TradingLoop.js:570-578`, and passes `priceSource` into ECM at `core/TradingLoop.js:632-640`.

The candle path still calls ECM with the candle-loop `price` and `marketData?.timestamp ?? Date.now()` at `core/TradingLoop.js:941-949`, with no equivalent `priceSource` field.

Conclusion: this may address part of the stale-price theory for exit-only checks, but it does not prove candle-path exits use the same freshest symbol price. The June 24 stop bleed is not fully closed by MPM rewrite alone until both paths have explicit price provenance.

### 5. Trade replay/proof data is symbol-contaminated for June 24.

The replay files for MARA, RIOT, and NVDA contain candles priced around `378.9` to `414.63`, while their trade entry/exit prices are MARA `14.xx`, RIOT `28.xx`, and NVDA `200.xx`.

Examples:

- `data/journal/.../MARA.../replays/43582003.json` has entry `14.34`, exit `14.64`, but replay candles min/max `378.9` / `414.63`.
- `data/journal/.../MARA.../replays/43601773.json` has entry `14.12`, exit `14.345`, but replay candles min/max `378.9` / `410.21`.
- `data/journal/.../RIOT.../replays/43588406.json` has entry `28.065`, exit `27.71`, but replay candles min/max `378.9` / `414.63`.
- `data/journal/.../NVDA.../replays/43609501.json` has entry `200.91`, exit `199.67`, but replay candles min/max `377.87` / `409.51`.

Current code explains the contamination:

- `core/TradeJournalBridge.js:600-623` passes `bot.priceHistory || []` to `TradeReplayCapture.captureEntry`.
- `core/TradeJournalBridge.js:801-811` passes `this.bot.priceHistory || []` to `TradeReplayCapture.captureExit`.
- `core/TradeReplayCapture.js:107-111` and `core/TradeReplayCapture.js:186-201` blindly slice/merge the provided `priceHistory`.

Conclusion: symbol-scoped journal directories exist, but replay candle context still comes from global bot price history. These replay files cannot prove the June 24 price path. This must be fixed before the public proof/replay layer is treated as audit-clean.

### 6. Older June 24 journal rows lack strategy/decision ledger proof.

The June 24 rows for `43582003`, `43601773`, `43607498`, `43588406`, and `43609501` in the scoped trade-ledger JSONL do not carry `entryStrategy`, `winnerStrategy`, `decisionLedger`, or `strategySignals` in the current ledger rows.

Current code can preserve that data when active trade provenance is available:

- `core/StateManager.js:614-638` attaches `decisionLedger` at trade birth only if `context.ledgerData` is present.
- `core/TradeJournalBridge.js:184-222` can extract active trade provenance.
- `core/TradeJournal.js:307-316` and `core/TradeJournal.js:457-466` can write strategy/provenance fields into journal entries.
- `core/OrderExecutor.js:2315-2360`, `core/OrderExecutor.js:2617-2645`, and `core/OrderExecutor.js:3008-3025` carry strategy/scope fields into close logging.

Conclusion: the current code has some wiring for strategy proof, but the June 24 artifacts are not complete enough to prove every entry's strategy from journal rows alone. The rewrite should include a confirmed-fill journal adapter that writes strategy, decision id, signal id, trace id, position sizing, exit policy hash, fill ids, and lifecycle state from the canonical trade/fill event.

## Root-Cause Ranking For June 24

1. **Confirmed proof/replay contamination:** replay candle context uses global `bot.priceHistory`, not symbol-scoped history. This does not itself execute trades, but it blocks reliable audit/replay of the bleed.
2. **High-confidence stale/insufficient price provenance risk:** stop exits realized much worse than intended, and the candle path still lacks explicit price source. Exit-only has a partial current fix, but candle path parity is unproven.
3. **Confirmed MPM state ownership defect:** MPM mutates remaining size/quantity before execution confirmation. This is a fatal architecture defect for partial exits, even if it is not the sole June 24 stop-loss cause.
4. **Confirmed MPM map key inconsistency:** OrderExecutor stores by order id; TradingLoop uses mixed keys.
5. **Unproven entry semantics defect for June 24 rows:** audits identify EMA `ma_alignment` / `crossoverCount 0` as suspect, but the older June 24 journal rows lack decisionLedger fields. Later rows prove the system can emit `ma_alignment` entries/signals; the June 24 MARA attribution in the existing autopsy is plausible but not fully reconstructable from the current ledger rows alone.

## Rewrite Invariants

- One exit coordinator: ECM owns exit decision ordering.
- MPM is deleted after cutover.
- Profit-side logic becomes a stateless planner called inside ECM.
- Planner emits intent only.
- No planner-owned `remainingSize`, `remainingOrderQuantity`, `currentStop`, journal writes, dashboard writes, or broker facts.
- `FrozenExitPolicy` is built at entry and stored on the trade.
- `ExecutionFill` is the only object that mutates StateManager trade truth.
- `StateManager.applyFill(fill)` computes mutation from confirmed quantity and price only; it does not accept both fraction and quantity from callers.
- Journal, replay, dashboard, and proof record confirmed fill facts, not planner guesses.
- Replay candle context must be symbol-scoped and price-provenanced.
- Live and backtest paths must use the same exit coordinator and fill mutation contract.

## Immediate Non-Overlapping Next Slice

The next low-collision slice is not MPM internals. It is fixing the replay/proof capture to use symbol-scoped price history instead of global `bot.priceHistory`.

Why this first:

- It does not touch current MTF dirty files.
- It directly repairs the audit surface needed to prove MPM and exit fixes.
- It closes a confirmed current-code defect with exact file:line evidence.
- It prevents future MARA/RIOT/NVDA proof artifacts from carrying TSLA-priced candles.

Proposed file target:

- `core/TradeJournalBridge.js`

Expected shape:

- Resolve symbol-scoped price history for entry and exit replay capture.
- Require the replay context symbol to match the trade symbol when symbol metadata exists.
- If symbol-scoped history is unavailable, record a loud visibility failure and skip replay capture rather than writing contaminated candles.

Do not touch yet in this forensic slice:

- `core/MaxProfitManager.js`
- `core/TradingLoop.js`
- `core/StrategyOrchestrator.js`
- `core/StateManager.js`
- `core/OrderExecutor.js`
- public proof JSON output
- MTF dirty files
