# Session: Matrix-Sweep TRADING_PAIR Fix — Live=Backtest Parity Restored

**Date:** 2026-04-30
**Branch:** `alpaca/stocks-paper-flip`
**Last commit at session end:** `c653800 fix(matrix-sweep): SYMBOL_MAP per-shortcut broker + policy-invariant env precedence`
**Phase 0 baseline:** preserved (pure tooling fix — no production code paths touched)

---

## What Was Done This Session

### 1. Diagnosed silent zero-trade backtest runs across the entire sweep grid
- **Symptom:** RSI walk-forward on `tsla-15m-unseen.json` returned `416/416 parsed` configs but every result was `finalBalance=10000, trades=null, netPnl=0` with `exitCode=0`.
- **Root cause (after 4 false starts):** Multi-Symbol Phase 3+4 (`9be305b`, shipped 2026-04-29) made `CandleProcessor.processNewCandle` route bars per-symbol via `candle.symbol === activeSymbol` matching. Backtest workers had no `TRADING_PAIR` env set, so `ConfigLoader.js:178-179` defaulted `tradingPair='BTC-USD'` (the kraken default). Bars carried `'TSLA'`, `activeSymbol` resolved to `'BTC-USD'`, mismatch → early-return at `CandleProcessor.js:188` → `analyzeAndTrade` never fired.

### 2. Initial wrong path (reverted)
Wrote 4 edits across `BacktestRunner.js` and `CandleProcessor.js` patching the candle pipeline directly. Each "fix" exposed a new gate. Reverted via Edit (no `git reset --hard`) after the user called out: *"these two systems are supposed to be the exact same code save env vars or feature flags."*

### 3. Right path — single env-var injection
- Added `SYMBOL_MAP` to `tools/matrix-sweep.js`, keyed by `--data` shortcut.
- Injected `TRADING_PAIR=<symbol>` in the worker env block.
- Threaded `dataKey` through `main → runMatrix → runWorker`.
- **Result:** TSLA standalone smoke went from `0 warmups / 0 emissions / 2.3s silent` → `20 warmups / 3,583 emissions / 6.2s real work`. Pipeline alive.
- **Committed:** `36e57aa fix(matrix-sweep): inject TRADING_PAIR per --data shortcut — restore live=backtest parity`

### 4. Mercury 3-pass adversarial audit
Used attack-framed prompts (operational verbs CONSTRUCT/TRACE/COMPUTE), max-tokens=7750, --agentic, max-iterations=40.

**Pass 1 findings:**
- ATTACK 2 (CRASH): worker default `BROKER=kraken` + injected `TRADING_PAIR=TSLA` → Kraken adapter throws on validation.
- ATTACK 3 (CORRUPTS): regex fallback (`/^[a-z]{1,6}$/`) on raw filepath inputs (e.g. `--data BTCUSD-1y.json`) → garbage `TRADING_PAIR='BTCUSD'` injected.

**Pass 2 (after refactor): SYMBOL_MAP → `{symbol, broker}` + hard-error on unknown shortcuts.**
- ATTACK C (latent): `Object.assign` chain placed BROKER injection BEFORE `config.env` → future generateMatrix drift could override broker.

**Pass 3 (after precedence swap): TRADING_PAIR + BROKER moved LAST in Object.assign.**
- All 3 new attack vectors (precedence-after-spawn, shell-env leak via config.env, final-overrides skip-path) returned NO ATTACK FOUND.

**Committed:** `c653800 fix(matrix-sweep): SYMBOL_MAP per-shortcut broker + policy-invariant env precedence`

### 5. Pushed both commits to origin
`175e59a..c653800  alpaca/stocks-paper-flip -> alpaca/stocks-paper-flip`

---

## Smoke Tests

| Test | Pre-fix | Post-fix |
|---|---|---|
| `--data tsla-15m-unseen` RSI standalone | 0 warmups, 0 emissions, 2.3s silent | 20 warmups, 3,583 emissions, 6.2s real |
| Bad shortcut `--data nope-fake-shortcut` | runs with garbage symbol | `process.exit(1)` with registered list |
| Pipeline parity check | live ≠ backtest (env-flag deviation) | live = backtest (same TRADING_PAIR path) |

RSI walk-forward result on tsla-15m-unseen still genuinely produces 0 trades after the fix (confirmed by user as expected — the unseen window genuinely has no RSI setups at SL=-1.25%/conf=0.30, not a regression).

---

## Files Touched

| File | Lines | Disposition |
|---|---|---|
| `tools/matrix-sweep.js` | +44/-12 across 2 commits | committed + pushed |
| `core/BacktestRunner.js` | edits applied + reverted | byte-identical to HEAD |
| `core/CandleProcessor.js` | edits applied + reverted | byte-identical to HEAD |
| `ogz-meta/sessions/session-2026-04-30-matrix-sweep-trading-pair.md` | new | created this session |

Also installed `typescript-language-server` v5.1.3 globally via `sudo npm install -g`. LSP plugin was loaded but TS LSP can't resolve dynamic `this.ctx.X` calls in raw JS without JSDoc types — partial value, not a panacea.

---

## Git Log (this session's commits)

```
c653800 fix(matrix-sweep): SYMBOL_MAP per-shortcut broker + policy-invariant env precedence
36e57aa fix(matrix-sweep): inject TRADING_PAIR per --data shortcut — restore live=backtest parity
```

---

## Half-Cooked Items Status

| Item | Status |
|---|---|
| Walk-forward sweep on 5 strategies (RSI, EMA, MASR, SMS, LiqSweep) | **Unblocked** by this fix; not yet run |
| Phase-full TradingConfig winners applied (commit `e2ffdc7`) | Still pending walk-forward validation |
| `_validated` timestamps on 5 strategies | Cleared to `null`; awaiting walk-forward results |
| Mercury adversarial audits on 8 untested commits (25b4591, e6526c0, 19f8809, 740570d, 3826016, 99f4774, 4d393ea, c3bf676) | Carried over from prior session |
| JSDoc `@type` annotations on hot-path ctx params (CandleProcessor, TradingLoop, OrderExecutor, StateManager, SessionRouter, StrategyOrchestrator) | Spec'd by Wolf, queued for after current fix work |

---

## Open Items for Next Session

1. **Re-run walk-forward sweeps now that pipeline is unblocked**:
   - `node tools/matrix-sweep.js --data tsla-15m-unseen --phase full --solo=RSI` (already known: 0 trades, expected per Trey)
   - Same for EMASMACrossover, MADynamicSR, SmartMoneySweep, LiquiditySweep
   - Build comparison table: train sweep vs walk-forward, flag overfit divergence

2. **Build remaining 5 strategies through full tuning panel** (per Trey's spec): SL → conf → ATR → exits → full → walk-forward, applying winner of each phase before next:
   - CandlePattern, MultiTimeframe, OGZTPO, OpeningRangeBreakout, NoWickImbalance

3. **Mercury audits on 8 untested commits** (carried over)

4. **JSDoc types on 6 hot-path ctx params** (Wolf-spec'd, would unlock LSP semantic queries across the trading pipeline)

---

## Context for Next Session

- The matrix-sweep fix is the ONLY thing standing between Phase 3+4 multi-symbol and a working backtest grid. With `c653800` pushed, all sweep commands work again.
- Walk-forward winners on the validated 5 strategies must be confirmed before relying on the phase-full TradingConfig values committed at `e2ffdc7`. Until then, `_validated` is null.
- The "patch the pipeline" temptation is a real anti-pattern — when backtest diverges from live, the answer is almost always "what env var or config does live set that backtest didn't." Don't reach for code patches in `BacktestRunner` or `CandleProcessor` first.
- Mercury 3-pass converging to all-defended is a strong "ship it" signal per [Mercury Multi-Pass Adversarial Dynamics](memory:mercury-multi-pass-adversarial-dynamics).

---

## Recorder Pipeline Disposition

- [x] Session doc written (this file)
- [ ] CHANGELOG.md updated
- [ ] `ogz-meta/ledger/fixes.jsonl` ledger entry added
- [ ] Mercury RAG reindex triggered
- [ ] `ogz-meta/recent-changes.md` updated
- [x] Git commit (`36e57aa` + `c653800`)
- [x] Pushed to `alpaca/stocks-paper-flip`

The unchecked items are the recorder skill's responsibility — invoking next.
