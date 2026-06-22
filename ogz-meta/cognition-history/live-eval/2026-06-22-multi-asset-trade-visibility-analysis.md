# 2026-06-22 Multi-Asset Eval Trade Visibility Analysis

## Source Files

- Ledger inspected: `data/journal/4-live__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-TSLA__3-15m/trade-ledger.jsonl`
- External TTP dashboard screenshot supplied by Trey showed TSLA, NVDA, MARA, and RIOT trades on June 22.

## Finding

Multi-asset execution was active, but the local TradeJournal ledger persisted every June 22 entry/exit under the TSLA runtime scope. Non-TSLA prices in the TSLA-scoped ledger prove the journal/replay path collapsed symbol attribution even though execution/order traces used multiple assets.

The root mechanism was code-level: TradeJournalBridge converted StateManager active trades into journal entries without carrying `activeTrade.symbol`, and TradeJournal stamped records from its constructor scope. The fix in this slice routes each active trade to a symbol-scoped journal bundle and aggregates dashboard snapshots across bundles.

## June 22 Ledger Rows

| line | event | orderId | UTC time | ledger symbol | inferred asset from price | direction | entry | exit | sizeUsd | netPnl | reason | confidence |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 22 | OPEN_TRADE_RECONCILED | 43392795 | 2026-06-22T16:16:14.447Z | TSLA | MARA |  |  |  | 0.00 |  |  |  |
| 23 | ENTRY | 43462856 | 2026-06-22T17:15:01.618Z | TSLA | TSLA | SELL_SHORT | 406.645 |  | 406.64 |  |  | 78.83190130211104 |
| 24 | ENTRY | 43463927 | 2026-06-22T17:30:00.789Z | TSLA | NVDA | SELL_SHORT | 208.995 |  | 209.00 |  |  | 76.60680922879732 |
| 25 | ENTRY | 43465005 | 2026-06-22T17:45:00.830Z | TSLA | MARA | BUY | 14.905 |  | 655.82 |  |  | 87.39999999999999 |
| 26 | EXIT | 43463927 | 2026-06-22T17:45:21.903Z | TSLA | NVDA | SELL_SHORT | 208.995 | 208.5 | 209.00 | -0.2549999999999954 | stop_loss | 76.60680922879732 |
| 27 | ENTRY | 43466298 | 2026-06-22T18:00:00.953Z | TSLA | NVDA | SELL_SHORT | 208.56 |  | 208.56 |  |  | 76.60680922879732 |
| 28 | EXIT | 43465005 | 2026-06-22T18:00:06.871Z | TSLA | MARA | BUY | 14.905 | 15.035 | 327.91 | 2.485000000000017 | be_scaleout | 87.39999999999999 |
| 29 | ENTRY | 43467349 | 2026-06-22T18:15:00.711Z | TSLA | RIOT | BUY | 28.915 |  | 491.56 |  |  | 76 |
| 30 | EXIT | 43467349 | 2026-06-22T18:45:22.037Z | TSLA | RIOT | BUY | 28.915 | 28.995 | 491.56 | 0.6100000000000314 | stop_loss | 76 |
| 31 | ENTRY | 43469704 | 2026-06-22T19:00:01.103Z | TSLA | MARA | BUY | 14.955 |  | 314.06 |  |  | 73.74374999999999 |
| 32 | ENTRY | 43470597 | 2026-06-22T19:15:00.638Z | TSLA | RIOT | BUY | 28.94 |  | 405.16 |  |  | 87.39999999999999 |
| 33 | EXIT | 43469704 | 2026-06-22T19:15:21.999Z | TSLA | MARA | BUY | 14.955 | 14.995 | 314.06 | 0.0899999999999821 | stop_loss | 73.74374999999999 |
| 34 | ENTRY | 43471222 | 2026-06-22T19:30:00.630Z | TSLA | MARA | SELL_SHORT | 14.93 |  | 298.60 |  |  | 75 |
| 35 | EXIT | 43470597 | 2026-06-22T19:30:06.920Z | TSLA | RIOT | BUY | 28.94 | 28.79 | 405.16 | -2.85000000000003 | stop_loss | 87.39999999999999 |
| 36 | EXIT | 43466298 | 2026-06-22T19:30:21.789Z | TSLA | NVDA | SELL_SHORT | 208.56 | 208 | 208.56 | -0.18999999999999773 | stop_loss | 76.60680922879732 |
| 37 | EXIT | 43471222 | 2026-06-22T19:45:01.856Z | TSLA | MARA | SELL_SHORT | 14.93 | 14.86 | 298.60 | 0.6500000000000059 | flip_position | 75 |
| 38 | EXIT | 43462856 | 2026-06-22T19:45:07.034Z | TSLA | TSLA | SELL_SHORT | 406.645 | 405.35 | 406.64 | 0.5449999999999591 | max_hold_loser | 78.83190130211104 |

## TTP Dashboard Crosswalk From Screenshot

| internal orderId | likely TTP row | asset | direction | note |
| --- | --- | --- | --- | --- |
| 43462856 | 5903952 | TSLA | Sell | Prices/times align with TSLA short closed near cutoff. |
| 43463927 | 5904084 | NVDA | Sell | Local price 208.995 identifies NVDA despite TSLA ledger stamp. |
| 43465005 | 5904226 | MARA | Buy | Local price 14.905 identifies MARA; partial exit logged locally. |
| 43466298 | 5904353 | NVDA | Sell | Local price 208.56 identifies NVDA. |
| 43467349 | 5904487 | RIOT | Buy | Local price 28.915 identifies RIOT. |
| 43469704 | 5904794 | MARA | Buy | Local price 14.955 identifies MARA. |
| 43470597 | 5904943 | RIOT | Buy | Local price 28.94 identifies RIOT. |
| 43471222 | 5905045 | MARA | Sell | Local price 14.93 identifies MARA. |

## Operational Notes

- Existing June 22 ledger rows are already mis-scoped and should be treated as contaminated for symbol-specific analytics.
- The code fix affects future records after runtime restart/adoption; it does not rewrite existing ledger history.
- The old TTP dashboard ID 5894561 was not present in local journal/order IDs during this pass, so the overnight/swing row cannot be proven from the local ledger alone. Current runtime state was flat and paused after cutoff until manual reconciliation.
- Primary remaining gap after this slice: equity curve, calendar, and export endpoints still use the primary journal. Closed-trade snapshots, replay lookup/list, stats, and breakdown now aggregate across scoped ledgers.
