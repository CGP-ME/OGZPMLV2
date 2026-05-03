# Arbitrage Symbol Equivalence — Deferred (Option C)

**Status:** DEFERRED. Option A' shipped 2026-05-03 in `rebuild/clean-from-baseline`.
**Owner:** Trey Buhidar
**Last verified:** 2026-05-03

---

## Decision

OGZPrime's symbol layer was rebuilt using **Option A'** (consolidate to dash canonical) on 2026-05-03. The originally-proposed **Option C** (Stable Instrument Registry — UUID-keyed instrument records with broker-specific aliases) is **deferred indefinitely** until the cross-broker arbitrage engine is being built.

This deferral was decided after a forensic audit (`ogz-meta/ledger/architecture/forensic-audit-2026-05-03.md`) showed Option C carried 10x the LOC, 3 new attack surfaces, and 2-4 weeks of work for capabilities we do not yet need.

When the arbitrage engine arrives, Option C is **additive on top of Option A'** — it does not invalidate or refactor what shipped.

---

## What was actually built (Option A')

Branch: `rebuild/clean-from-baseline`
Phase 0: Baseline frozen at commit `9c79e9f` — 338 trades / 78W-260L / 23.1% WR / `$11057.084813641693` on `data/polygon-btc-1y-15min.json` with `BACKTEST_MODE=true BACKTEST_NO_PATTERN_SAVE=true ENABLE_DASHBOARD=false TRADING_PAIR=BTC-USD`.

Every commit on this branch reproduces that exact result, byte-identical. The match is what proves the rebuild is non-disruptive.

### Phase 1 — Canonical consolidation

Single canonical symbol form across the entire bot: **`BTC-USD`** (dash, uppercase). Slash forms (`BTC/USD`) and Kraken's `XBT` only exist *inside* broker adapters at the wire boundary.

Defense in depth on translation lies (Mercury Vector 1):
- **Write-time** — `core/StateManager.js` normalizes ledger symbol at the write boundary
- **Persist-time** — `core/DecisionLedgerLogger.js` re-normalizes at JSONL serialization
- **Telemetry-time** — `core/PatternMemoryBank.js` normalizes `trade.symbol` before it influences brain weights

Bug fixed during consolidation:
- `brokers/CoinbaseAdapter.js` — `fromBrokerSymbol` was incorrectly returning slash form (`BTC/USD`) when canonical is now dash. Coinbase's native form already matches canonical, so this is now identity.

### Phase 2 — Atomic write hardening

Mercury Vector 6 (non-atomic writes that crash mid-write into truncated JSON, blocking next-startup load) closed across 15 persistence sites via `core/AtomicWrite.js`.

Helper exports:
- `writeJsonAtomic(path, data)` — pretty-printed JSON, 2-space indent
- `writeJsonCompactAtomic(path, data)` — compact JSON, no indent (high-volume paths)
- `writeStringAtomic(path, content, options)` — CSV / HTML / plain text

Pattern: write to `path + '.tmp'`, then `fs.renameSync` to target. POSIX guarantees rename atomicity within a filesystem, so a crash at any point either preserves the previous version intact or lands the new content fully — never partial.

Migrated sites (15 total, see commits `11bfa62..a22fb1b`):
1. `core/StateManager.js` — `state.json`
2. `core/PatternMemoryBank.js` — TRAI brain
3. `core/KillSwitch.js` — emergency halt flag
4. `core/SingletonLock.js` — process lock
5. `core/CandleStore.js` — candle history
6. `core/TradeJournal.js` — CSV exports + stats cache (2 sites)
7. `core/JournalBridge.js` — journal report export
8. `core/ReplayCapture.js` — replay JSON
9. `core/PerformanceAnalyzer.js` — performance database
10. `core/BacktestRunner.js` — backtest reports (2 sites)
11. `core/BacktestRecorder.js` — backtest CSV
12. `core/Supervisor.js` — HMAC key file
13. `core/trai_core.js` — pattern category files
14. `core/tradeLogger.js` — daily trades JSON
15. `core/PerformanceVisualizer.js` — equity/metrics/trades/HTML/final report (5 sites in one commit)

All 15 commits regression-verified byte-identical to baseline.

---

## What Option C would have added (and why we did not need it yet)

Option C proposed an `Instrument` registry — UUID-keyed records mapping a stable internal id (`inst_btc_usd`) to per-broker aliases (`Coinbase: BTC-USD`, `Kraken: XBT/USD`, `Alpaca: BTC/USD`).

Use cases Option C unlocks:
- **Arbitrage**: cross-broker price comparison on the same logical instrument when broker formats diverge
- **Multi-listing**: same instrument trades on multiple venues with different identifiers
- **Wrapped assets**: `WBTC` ↔ `BTC` mapping at protocol level
- **Reorg safety**: a broker silently renames a symbol; the registry holds the line

Use cases OGZPrime does **not** have today:
- All current trading is on **one broker at a time** (paper now, Alpaca soon)
- All current symbols translate cleanly via string rules (the three Phase 1 helpers)
- No multi-listing, no wrapped assets, no protocol-level identity questions

Therefore Option C is currently **infrastructure for capabilities we do not have** — and shipping infrastructure ahead of need was the exact failure mode of the original multi-symbol redesign that broke the bot for three days.

---

## When to revisit

Revisit Option C **when arbitrage is the next workstream**, not before. The trigger is:

> "We are wiring a second concurrent broker connection and the bot will hold open positions on both broker contexts simultaneously."

At that point, Option C is added **on top of** the canonical layer that shipped 2026-05-03. The dash canonical does not need to be undone — it becomes the default `displaySymbol` field on the `Instrument` record while the registry adds a stable `instrumentId` for cross-broker correlation.

### Migration shape (for future reference, not for now)

```
Instrument {
  instrumentId: 'inst_btc_usd'       // stable, never changes
  displaySymbol: 'BTC-USD'           // current canonical, what the user sees
  brokerAliases: {
    coinbase: 'BTC-USD',
    kraken:   'XBT/USD',
    alpaca:   'BTC/USD',
  }
}
```

`OrderRouter.normalizeSymbol` becomes `OrderRouter.toInstrument(rawSymbol, brokerHint)`. State, ledger, and telemetry continue keying on `displaySymbol` for backward compatibility, with `instrumentId` added as a sibling field.

This is **additive**: existing `state.json` files, JSONL ledgers, and brain memories from the Option A' era continue to load and round-trip without touching them.

---

## Cross-references

- Forensic audit: `ogz-meta/ledger/architecture/forensic-audit-2026-05-03.md`
- Multi-AI proposal set: `ogz-meta/ledger/architecture/` (5 AIs, all primed by same dimensions — math reversed the consensus)
- Mercury attack surface: 7 vectors enumerated, V1/V6/V7 closed, V2-V5 not in scope for current single-broker operation
- Architecture invariants: `~/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/architecture-invariants.md`

---

## Why this doc exists

Mercury's RAG indexes `ogz-meta/specs/`. Without this doc, Mercury would retrieve the five competing proposals in `ogz-meta/ledger/architecture/` as if they were live design candidates and propose Option C in future sessions — the exact RAG-contamination failure mode documented in `CLAUDE.md` ("Document Accuracy Rule").

**This doc is the canonical record that Option A' shipped, Option C is deferred, and the trigger condition for revisiting is arbitrage.**
