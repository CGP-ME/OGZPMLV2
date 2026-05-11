# Source-of-Truth Pointer Registry for OGZPrime State

This is the canonical record of every piece of mutable state in OGZPrime, where its authoritative copy lives, and where shadow copies (if any) exist. Generated 2026-05-11 from the DeepSearch audit keyed to commit `004af8c` on `rebuild/clean-from-baseline`.

Each row identifies a Finding-class risk — a state field where divergence between canonical and shadow copies can corrupt trading decisions. Mercury indexes this file so retrieval queries like "where is realized P&L canonical?" return the table row, not a guess.

## Why this registry exists

The source-of-truth pointer registry exists because OGZPrime has multiple places where the same conceptual state is tracked. When canonical and shadow drift, the bot makes decisions on stale data. The 6a architecture finding (2026-05-10) and the DeepSearch audit (2026-05-11) both identified divergent state pairs as the root cause of multi-symbol-class bugs. This registry is the lookup table that prevents future drift.

## Registry Table

The source-of-truth pointer registry for OGZPrime trading state maps every mutable concept to its canonical location, known shadow copies, the sync mechanism (if any), the divergence risk class, and which invariant currently covers it.

| State | Canonical Location | Shadow Copies | Sync Mechanism | Divergence Risk | Invariant Coverage |
|---|---|---|---|---|---|
| Candles (any symbol 1m) | `core/CandleStore.js:25` — `this.store` Map | `run-empire-v2.js:767` — `this.priceHistory[]` shim; also `run-empire-v2.js:1187` reassigns priceHistory from getCandles | Dual-write in `CandleProcessor.js:81-104` (UPDATE) and `:128-155` (NEW); also `loadCandleHistory:1206` re-syncs on save | HIGH (Finding 1) — priceHistory is never cleared between candles; CandleStore gets new candle; priceHistory gets old array | I-LEN-1, I-SNAP-1 |
| `trade.size` (position USD) | `core/StateManager.js:413` — `sizeUsd: size` | `core/StateManager.js:414` — `size: size` (compat shim) | Both set identically at open; `reducePosition:742` updates ONLY `sizeUsd` | HIGH (P1-A) — after partial close, `trade.size` stale; `OrderExecutor:700` reads `buyTrade.size` | None currently |
| Active trades | `core/StateManager.js` — `this.state.activeTrades` Map (keyed by `tradeId`) | OrderRouter adapter-local position caches; `state.position` scalar | No active sync — `state.position` set independently | MEDIUM (P1-E) | I-STATE-1 (if defined) |
| ASSET_REGISTRY | `core/SymbolTradingContext.js:34-68` | No known shadow copies | No sync needed — read-only after module load | LOW | BROKER-1 (symbol parity) |
| Exit contracts | `TradingConfig.exitContracts` — sealed at birth (DEC-013) | `trade.exitContract` field (mutated in-place at ECM:122) | Assigned once at trade open (OrderExecutor:297), mutated directly on trade object | MEDIUM (S7-BUG-1) — in-place mutation bypasses updateState | None |
| MaxProfitManager instances | Map keyed by `orderId` (DEC-008) — location UNVERIFIED | None known | Created at OrderExecutor trade open; destroyed when trade closes (UNVERIFIED GC path) | MEDIUM (P4-C) — if MPM map uses broker orderId while StateManager uses internal tradeId, lookups fail | None |
| Open orders (broker-side) | Broker exchange state | OrderRouter adapter caches (UNVERIFIED) | No reconciliation loop confirmed | HIGH — bot has no reconciliation with broker on restart | None |
| Candle history on disk | `data/candle-history.json` — written by `saveCandleHistory` | In-memory `CandleStore.store`; legacy `priceHistory` array | `saveToDisk` at session end; `loadFromDisk` at startup | MEDIUM — if process crashes before saveToDisk, session candles lost | PERSIST-1 |
| Realized P&L | `StateManager.state.realizedPnL` (net, after fees) | `StateManager.state.totalPnL` (gross, before fees); `PnLCalculator` (different formula) | Incremented independently at `closePosition:664-665` | MEDIUM (S10-BUG-2) — PnLCalculator diverges from StateManager | PNL-1/2 |
| Strategy params (EMA periods) | `modules/EMASMACrossoverSignal.js:29-33` — hardcoded | None — not configurable | N/A | LOW — cannot diverge (hardcoded) | STRAT-1 |
| Symbol canonical form | `core/SymbolTradingContext.js:34-68` ASSET_REGISTRY (dash-canonical) | Each broker adapter's native form; StateManager normalization (partial, 2 transforms only) | Healed by `CandleProcessor._resolveSymCtx` (implicit via ASSET_REGISTRY lookup) | HIGH (Finding 3) — 6 adapters confirmed non-canonical on at least one boundary | I-POS-CANONICAL (v3 D1) |
| Position sizing | `StateManager.openPosition` — `size: balance × basePositionSizePct` | `trade.size`, `trade.sizeUsd` — synchronized at open only | Diverges after reducePosition (see `trade.size` row above) | HIGH | None |
| Confidence gate | `StrategyOrchestrator.minStrategyConfidence` (from TradingConfig, default 0.35) | None | Read-only config value | LOW | None |

## Risk class glossary

- **HIGH** — divergence is observed in current HEAD or near-certain in a documented scenario (live mode, partial close, multi-broker).
- **MEDIUM** — divergence is structurally possible but blast radius is bounded (single-symbol, single-trade-at-a-time).
- **LOW** — divergence is theoretical (hardcoded, read-only, or singleton-protected).

## Source

Audit response at `ogz-meta/ledger/weresofucked.md` (Deliverable 8.3). Each row's line citations are direct DeepSearch `repo:` query results against `004af8c`.
