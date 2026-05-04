# Session 2026-05-04 — Strategy Resurrection Campaign

**Date:** 2026-05-04
**Branch:** `rebuild/clean-from-baseline`
**Last commit at session end:** `fc83694 fix(orb): DST-aware NYSE 9:30 ET session detection + sweep wiring`
**Phase 0 baseline:** byte-identical with genesis `9c79e9f` (verified earlier in arc on TSLA + BTC fixtures)
**Driver:** Wolf's spec at `ogz-meta/ledger/CC-SPEC-GET-ALL-STRATEGIES-TRADING.md` — fix 5 silent strategies before Apex eval purchase Monday.

---

## What Was Done This Session

### 1. Fix 1 — NoWickImbalance ctx-shape bug → `dea5c46`

**Wolf's prescription:** wire NoWickImbalance into `tools/matrix-sweep.js`.

**Real bug found:** `modules/NoWickImbalance.js:198` destructured `ctx.candles` but the orchestrator passes `ctx.priceHistory` (matches every other strategy). `evaluate()` returned null on every tick — strategy never detected anything. Wolf's wiring change was real-but-insufficient; the prescribed action would have been useless without the ctx-shape fix.

**Fix:**
- `modules/NoWickImbalance.js:197-200` — destructure → direct read (`const candles = ctx.priceHistory; const indicators = ctx.indicators;`).
- `tools/matrix-sweep.js` — added 'NoWickImbalance' to ALL_STRATEGIES + `env.ENABLE_NOWICK = 'true'` block (Wolf's surface fix, still needed to enable in sweep).

**Mercury verification:** SAFE — orchestrator at line 705-706 builds ctx with priceHistory key, no caller anywhere passes 'candles'.

**Lesson saved to memory:** [feedback-prophylactic-bugclass-grep.md](file:///home/linuxuser/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/feedback-prophylactic-bugclass-grep.md) — when working through a multi-fix spec, grep the bug class across ALL targets BEFORE implementing any single fix.

---

### 2. Fix 2 — BreakRetest migration + state divergence collapse → `1a968b3`

**Wolf's prescription:** remove `return null` hardcode at `core/StrategyOrchestrator.js:336-338`.

**Real bug found (two-layered):**
- Layer 1: hardcode `return null` was real (Wolf was right about this).
- Layer 2: original closure (commit `37509dc`) read `ctx.extras.breakRetestSignal` — produced ONLY in live path. `core/BacktestRunner.js` and `tools/parallel-backtest.js` have zero producer wiring. Removing the hardcode and restoring the 37509dc closure would still yield zero trades because the architecture moved post-`50eee79` to "self-contained strategies."

**Fix path = migration, not hardcode removal.** Mirrored LiquiditySweep's self-contained pattern:
- `core/StrategyOrchestrator.js:88-90` — instantiate `this.breakAndRetestModule = new BreakAndRetest()` in constructor.
- `core/StrategyOrchestrator.js:332-364` — replace return-null closure with self-contained closure that calls `breakAndRetestModule.update(latestCandle, candles)` inline.

**Mercury attack pass 1 found a BLOCKER:** runner-side `this.breakAndRetest` (run-empire-v2.js:514) + orchestrator-side instance = two BreakAndRetest objects with diverging mutable state in live mode (`keyLevels`, `activeBreak`, `battleZone`, `recentCandles` all mutate per `update`).

**Resolution:** collapsed to single orchestrator-owned instance by deleting four dead-chain lines:
- `run-empire-v2.js:514` — runner instantiation removed.
- `core/CandleProcessor.js:99` — dead producer call removed.
- `core/TradingLoop.js:74` — dead extras forward removed.
- `run-empire-v2.js:864` — dead ctx-build entry removed.

**Mercury attack pass 2:** SAFE-TO-COMMIT. No stray readers, only one constructor in production code, orchestrator evaluated every post-warmup candle.

---

### 3. Fix 3 — CandlePattern re-enable + pattern-memory-flood remediation → `c9a6e51`

**Wolf's prescription:** "un-disable rawCandlePatterns at TradingLoop.js:418."

**Real bug found:** original disable (commit `ceb0ffb` 2026-03-20) cited 2000+ garbage entries flooding pattern memory. The 70% confidence filter at `TradingLoop.js:419-420` only gates rawCandlePatterns, not memoryPatterns (forced-emit at 0.1 conf). Plus the actual flood vector was the keying scheme: `pattern_performance` was keyed by `JSON.stringify(features).substring(0,50)` where features contained continuous indicator values. Every candle produced a unique key. Re-enabling rawCandlePatterns alone would multiply an existing leak ~8x.

**Mercury investigation found:**
- Verdict: FLOOD-RE-INTRODUCED-WITHOUT-FIX.
- Flood is keyed by feature-signature with continuous values. Mercury also designed the flood-detection test.

**Fix (3 changes, one commit):**
- `core/EnhancedPatternRecognition.js` — added `_signatureFromFeatures()` static helper. Quantizes feature values to 0.05 buckets (`Math.round(v * 20) / 20`) before `JSON.stringify`. Continuous states collapse to bounded keys.
- `core/TradingLoop.js:418` — re-enabled `candlePatternDetector.detect()` call.
- `test/pattern-memory-flood.test.js` (NEW, 3 tests, all passing): realistic 500-candle progression < 300 unique sigs (passing at 265); deterministic; near-identical features collapse to same bucket.

**Mercury verification:** SAFE-NO-PERSISTENCE — `pattern_performance` is module-level memory only, never persisted. UnifiedPatternMemory's separate `this.patterns` store is unaffected. Signature-format change orphans no historical data.

---

### 4. Fix 4 — MultiTimeframe → ARCHITECTURAL GAP DOCUMENTED, NOT FIXED

**Wolf's prescription:** "fix etime in BacktestRunner.js:88 to 900s for 15m data."

**Real bug found:** `MultiTimeframeAdapter.ingestCandle()` at line 91-97 unconditionally stores every input candle in the **1m** bucket then aggregates UP. The integration docstring at lines 19-21 confirms: *"In your 1m candle loop: mtf.ingestCandle(candle)."* TSLA fixture feeds 15m candles → adapter labels each as 1m → all aggregations to 5m/15m/1h/4h are wrong-scale → confluence never produced → 0 trades. Wolf's etime fix was irrelevant; even with correct etime, the adapter would still misinterpret 15m candles.

**Disposition:** out of scope for this campaign (Apex deadline). Architectural fix path documented in `ogz-meta/ledger/FINDING-2026-05-04-MULTITIMEFRAME-1M-CONTRACT.md`. Strategy is registered + enabled but produces 0 trades by current architecture.

**Sweep result:** 0 trades / 12 configs at $0 (expected).

---

### 5. Fix 5 — ORB DST-aware NYSE session detection → `fc83694`

**Wolf's prescription:** "inject RTH session context."

**Real bug found:** `OpeningRangeBreakout.js:134` checked `hour === sessionOpenHourUTC && minute < orDurationMinutes` with `sessionOpenHourUTC = 14`. NYSE opens at 9:30 AM ET = 13:30 UTC (EDT) or 14:30 UTC (EST). The check matched 14:00-14:14 UTC — neither DST state. State machine stayed at WAITING_FOR_OPEN forever.

**Fix (3 files, one commit):**
- `modules/OpeningRangeBreakout.js` — added DST-aware ET-based session detection via `Intl.DateTimeFormat('America/New_York')`. When `sessionOpenET` is set (e.g. `'09:30'`), formatter handles EDT/EST transitions automatically. Constructor caches the formatter; `_handleWaitingForOpen` and `_getSessionDate` both use it. Legacy UTC-hour path unchanged when sessionOpenET is null.
- `core/TradingConfig.js:617-619` — added `sessionOpenET` (default `'09:30'`) and `sessionTimeZone` (default `'America/New_York'`).
- `tools/matrix-sweep.js` — added `env.ENABLE_ORB = 'true'` block.

**Mercury verification:** SAFE-TO-COMMIT. Intl returns '00' not '24' at midnight, DST-transition day cannot mis-identify second opening range, env helper preserves string defaults, legacy crypto path unchanged.

---

## Smoke Tests

All sweeps run on `tuning/tsla-15m-2y.json` with stocks fees (`FEE_MAKER=0 FEE_TAKER=0`):

| Strategy | Trades | WR | PF | Best P&L | DD | Profitable Configs |
|---|---|---|---|---|---|---|
| NoWickImbalance | 195 | 53.3% | 2.41 | $542.58 | 0.6% | 10/12 |
| BreakRetest | 213 | 65.3% | 2.93 | $898.82 | 0.6% | 12/12 |
| CandlePattern | 1467 | 56.0% | 1.99 | $4044.60 | 1.7% | 12/12 |
| MultiTimeframe | 0 | n/a | n/a | $0 | n/a | 0/12 (architectural) |
| OpeningRangeBreakout | 199 | 75.4% | 3.97 | $615.84 | 0.5% | 9/12 |

**Pattern-memory-flood unit tests** (`test/pattern-memory-flood.test.js`): 3/3 passing (265 unique signatures across 480 realistic-progression iterations, well under the 300 bound).

---

## Files Touched

| File | Change | Commit |
|---|---|---|
| `modules/NoWickImbalance.js` | ctx.candles → ctx.priceHistory destructure fix | `dea5c46` |
| `tools/matrix-sweep.js` | NoWick + BreakRetest + ORB env wiring + ALL_STRATEGIES additions | `dea5c46` / `1a968b3` / `fc83694` |
| `core/StrategyOrchestrator.js` | BreakAndRetest module instantiation + self-contained closure | `1a968b3` |
| `core/CandleProcessor.js` | Removed dead BreakAndRetest producer call | `1a968b3` |
| `core/TradingLoop.js` | Removed dead breakRetestSignal forward + re-enabled candlePatternDetector.detect | `1a968b3` / `c9a6e51` |
| `run-empire-v2.js` | Removed runner-side BreakAndRetest instance + ctx forward | `1a968b3` |
| `core/EnhancedPatternRecognition.js` | Quantized feature signature helper | `c9a6e51` |
| `test/pattern-memory-flood.test.js` (NEW) | 3 flood-detection tests | `c9a6e51` |
| `modules/OpeningRangeBreakout.js` | DST-aware ET session detection via Intl | `fc83694` |
| `core/TradingConfig.js` | sessionOpenET + sessionTimeZone config | `fc83694` |
| `ogz-meta/ledger/FINDING-2026-05-04-MULTITIMEFRAME-1M-CONTRACT.md` (NEW) | Documented MTF architectural gap | `fc83694` |

---

## Git Log

```
fc83694 fix(orb): DST-aware NYSE 9:30 ET session detection + sweep wiring
2c78f26 feat(trading-loop): strategy_stack carries full configured list with IP-shielded labels
f6197da feat(trade-narrator): expose labelFor() as public method for IP shield
3e38da5 fix(enhanced-pattern-recognition): drop 10% confidence floor
dfbabf4 fix(unified-pattern-memory): unknown pattern returns confidence:0, not 0.1
0ea806c fix(state-manager): persist closedTrades on closePosition for win-rate math
c9a6e51 fix(candlepattern): re-enable rawCandlePatterns + bound pattern memory keys
1a968b3 fix(breakretest): migrate to self-contained pattern + collapse to single instance
dea5c46 fix(nowick): read ctx.priceHistory + wire into matrix-sweep (phase 0)
```

(Commits between mine — `2c78f26`, `f6197da`, `3e38da5`, `dfbabf4`, `0ea806c` — were authored by Trey in parallel for IP-shielded labels and pattern-memory floor work.)

---

## Half-Cooked Items Status

| Item | Status |
|---|---|
| MultiTimeframe architectural fix (1m → configurable base timeframe) | DOCUMENTED. Path written in `ogz-meta/ledger/FINDING-2026-05-04-MULTITIMEFRAME-1M-CONTRACT.md`. Out of scope for Apex deadline. |
| Walk-forward validation on `tuning/tsla-15m-unseen.json` | OPEN. All 4 fixed strategies have only in-sample 2-year results. Out-of-sample test is what distinguishes "fits the fixture" from "has edge." |
| Sweep campaign tuning across all firing strategies | OPEN. 9 of 10 strategies firing; full grid sweep across all combinations is the next phase per Trey's directive ("tuning happens during the sweep campaign after all strategies are firing"). |
| Apex eval pipeline integration with bot results | OPEN. Trey orchestrating front-end build in parallel for the website proof feed. |

---

## Open Items for Next Session

1. **Walk-forward verification** on `tuning/tsla-15m-unseen.json` for all 4 fixed strategies (NoWick, BreakRetest, CandlePattern, ORB). Confirm in-sample numbers don't collapse out-of-sample.
2. **MultiTimeframe architectural fix** — add `baseTimeframe` config option, allow ingestion at non-1m base, only aggregate UP. ~60 min, Mercury attack required, regression test for confluence on 15m base. Path documented.
3. **Top-5-identical confidence axis** — every fixed strategy showed identical Top 5 across confidence thresholds 25-45%. Either tighten matrix-sweep grid to skip cosmetic-only configs, or investigate whether strategy-internal confidence outputs render the orchestrator gate cosmetic. Compute waste otherwise.
4. **BreakRetest "too good" follow-up** — PF 2.93 / 65% WR / 100% profitable / 0.6% DD on 2-year in-sample is unrealistically clean. Trey accepted ("strategies could just be self-confident, stranger things have happened") but walk-forward will be the real arbiter.
5. **Apex eval pipeline** — bot results feed for website proof.

---

## Context for Next Session

- **The "Wolf's spec was wrong about root cause" pattern repeated 4 of 5 times.** Surface fix prescriptions matched symptoms but missed the actual bug 80% of the time. Treat any future multi-fix spec with the same skepticism — investigate independently before applying. Memory rule [Prophylactic Bug-Class Grep](file:///home/linuxuser/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/feedback-prophylactic-bugclass-grep.md) was earned this session.
- **The orchestrator's "self-contained strategies" pattern (post-`50eee79`)** is now the canonical shape for strategy registration. Any strategy that still reads `ctx.extras.X` is a candidate for migration. Audit candidate: any other ctx.extras consumers in `_registerBuiltinStrategies`.
- **The `pattern_performance` keying scheme is now bounded** via the new `_signatureFromFeatures` quantization helper. Pattern memory growth across long backtests is capped. The flood-detection test guards against regression — if anyone changes the signature format back, the test fails immediately.
- **The runner-side dead plumbing is fully cleared** for BreakAndRetest. Same producer-disconnect pattern likely affects any other strategy whose orchestrator closure references its module via constructor closure. Worth a future audit pass to identify and clean up similarly.
- **Mercury attack-framed prompts are the proven pattern.** Verification framing returned soft answers; adversarial framing found the BreakRetest two-instance blocker (Mercury pass 1) AND the pattern-memory-flood mechanism (which Wolf's spec missed entirely). Rule: every hot-path change goes through Mercury attack pass before commit, no exceptions.

---

## Recorder Pipeline Disposition

Not invoked this session. Standard Claudito pipeline (Commander → Branch → Architect → Entomologist → Exterminator → ...) was bypassed in favor of direct CC + Mercury verification per the per-fix workflow Trey approved at session start ("change it do all the same process that we have been doing check with Mercury").

Each of the 4 commits followed: investigate → propose → approve → apply → Mercury attack → commit → push → sweep verify. No `/pipeline` invocations.

`fixes.jsonl` not updated this session. Recorder skill not invoked. If next session wants jsonl coverage for these 5 fixes, the data is in this session doc and the commit messages.

Mercury reindex (`node trai_brain/mercury-bridge/indexer.js`) NOT run this session — last reindex was earlier in the day before this campaign started. Should run before next session's Mercury dispatches to ensure the new code (BreakAndRetest migration, ORB ET detection, pattern-memory quantization) is in the index.
