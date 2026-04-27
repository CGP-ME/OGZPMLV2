# Session Handoff: Asset Isolation + Strategy Parity + Bot Swap Resilience

**Date:** 2026-04-25 → 2026-04-27
**Branch:** `alpaca/stocks-paper-flip`
**Last Commit:** `b57493a` — feat(mercury): add web_fetch tool — generic HTTPS GET with allowlist + auth
**New Phase 0 Baseline:** `$17,551.91169513058 / 1265 trades / 778W / 487L / 61.5% WR / 2.66% MaxDD / 2.67 PF` (post `16c1b1c` sweep-winners apply, reproduces bit-for-bit)
**Old baseline (now superseded):** `$17,950.589592711076 / 1430 / 57.55% WR / 2.63% DD / 2.69 PF`

---

## What Was Done This Session

The session ran an end-to-end "burn down all dangerous half-cooked items" arc across **three audit gauntlets** (Mercury 3a–3f strategy parity, Bot Swap Resilience, Asset Isolation, Stat Attribution), **eight code fix waves**, and **three doc-truth corrections**. Below is the full audit log organized by theme.

### 1. Strategy Parity — minConfidence Wired On All Contracts (2 commits)

**Symptom:** 10 of the 14 exit contracts in `core/TradingConfig.js` were missing the `minConfidence` and `_validated` fields. The orchestrator's confidence gate was applied only to the four originally-validated strategies (RSI / EMASMA / MADynamicSR / LiquiditySweep). New strategies added by Audit 3 (CandlePattern, MarketRegime, MultiTimeframe, SmartMoneySweep, OGZTPO, default) silently bypassed the gate — any signal at any confidence reached the OrderRouter.

**Root cause:** Schema drift. `_validated` and `minConfidence` were tacked on per-strategy as each contract earned its walk-forward proof in March, but new contracts copied from older patterns that never had the fields, never re-acquired them, and the orchestrator's filter loop only consulted strategies that DID have `minConfidence` (silent miss, not loud).

**Fix (commit `d50394a`):** Added `minConfidence: null` to every contract that was missing it. `null` = "no gate applied, let sweep prove the right value before locking it." Kept the originally-validated four at their existing locked values (0.60). Mercury verified the patch was scope-clean (no logic change yet — just schema normalization).

**Fix (commit `fb8985a`):** Wired the per-strategy `contract.minConfidence` gate into `core/StrategyOrchestrator.js:757-770`, mirroring the per-strategy ATR filter at `:744-756` (reverse-splice loop on results). When `contract.minConfidence != null && r.confidence < contract.minConfidence`, the strategy is filtered out with a structured log line. Phase 0 reproduced bit-for-bit since all four locked strategies are still passing the gate at their existing thresholds.

### 2. SessionRouter Goes LIVE (4 commits)

**Symptom / context:** SessionRouter (the dual-broker Kraken/Alpaca session-aware adapter) was built behind `SESSION_ROUTER_ENABLED=false` with the spec saying "post-Apex deferred." That was inaccurate — it was already feature-complete and was just gated. Trey wanted the flag flipped and the spec updated to match reality.

**Root cause:** The flag was added defensively when the SessionRouter first landed (commit `a5b8cd5` earlier in April), but no one came back to flip it after the Phase-9 supervisor work proved out. The Apex shipping-boundary spec at `ogz-meta/specs/apex-shipping-boundary.md` was still describing it as deferred work, which created false-blocker FUD in subsequent planning sessions.

**Fixes:**
- `5d39230` — docs(apex-boundary): clarify SessionRouter is built + flag-gated, not post-Apex deferred
- `bec08c3` — spec(resilience): flip `SESSION_ROUTER_ENABLED=true` defaults across config + defer Phase 10 Kraken legacy-reconnect migration as not-blocking-Apex
- `2623d7c` — docs(apex-boundary): SessionRouter LIVE entry — flag flipped at `bec08c3`, Phase 10 deferred
- `deb276e` — fix(empire): when `this.kraken` was null on boot the SessionRouter constructor crashed — guarded with optional chaining + log warning

### 3. Bot Swap Resilience Audit (3 findings, all closed)

**Audit dispatched:** Mercury adversarial mode with prompt: "what state can leak across a SessionRouter crypto↔stocks transition that produces wrong indicators / phantom positions / restart bombs?"

**F1 — IndicatorEngine state leak across asset swap.**
- Mercury found: 22 stateful buffer arrays inside `core/indicators/IndicatorEngine.js` (RSI window, MACD EMAs, BB rolling SMA, ATR true-range, etc.) carried BTC values into the first N candles of TSLA after a transition. ATR computed from "BTC's last 14 ranges + TSLA's first 1 range" produces nonsense for ~14 bars, and any strategy gated by ATR-min-percent silently skews on entry.
- Fix (commit `45d2b0b`): added `reset()` method to IndicatorEngine (~25 lines) that zero-initializes every buffer array. Called from both `_transitionToStocks` and `_transitionToCrypto` in `core/SessionRouter.js`, alongside `priceHistory.length = 0`.

**F2 — Restart bomb via stale candle-history.json.**
- Mercury found: `data/candle-history.json` is read on bot boot to pre-populate priceHistory. After a SessionRouter swap, the file still contained the previous asset's candles. If the bot restarted (PM2 crash, kill -9, supervisor recycle) DURING a stocks session, it would boot with BTC candles in memory and immediately try to trade TSLA logic against BTC indicators.
- Fix (commit `4433126`): write `'[]'` to `data/candle-history.json` from both transition functions before reset, ensuring a restart mid-session reads an empty seed and rebuilds from live ticks.

**F3 — Orphan position on close-failure.**
- Mercury found: `core/SessionRouter.js` force-liquidate during transition logged failures but didn't abort the transition. A failed close left an open position in the OUTGOING broker while the bot started subscribing to the INCOMING broker's ticks. Worst-case: stop-loss never fires because the bot's loop is no longer pinging the original broker.
- Fix (commit `36d2da7`): collect failures into `failedCloses[]`, throw to abort transition if any failed, log `[SessionRouter] ABORT: N positions failed to close, transition halted, manual intervention required`. Surface error via Supervisor health check.

### 4. Asset Isolation Audit (4 findings, all closed)

**Audit dispatched:** "what writes-to-disk during a multi-asset session WITHOUT tagging the active symbol, such that post-session attribution can't tell which asset an entry/exit/snapshot came from?"

**F1 — TradeJournal entries + exits untagged.**
- Mercury found: `core/TradeJournal.js:117` (recordEntry) and `:188` (recordExit) wrote records with no symbol field. The journal is the canonical attribution record consumed by Stat Attribution. Multi-asset sessions left the journal saying "trade closed +$N" with no asset tag. Backtest reports for individual assets had to grep through entry timestamps to even guess what asset a row was for.
- Fix (commit `b58d729`): `entry.symbol || 'unknown'` on recordEntry, `entry?.symbol || exit.symbol || 'unknown'` on recordExit (defensive double-check because exit might fire from a stale cache when entry was missed). Bridge updated at `core/TradeJournalBridge.js:89` to populate `symbol: bot.tradingPair || bot.config?.tradingPair || 'unknown'` upstream.

**F2 — PipelineSnapshot untagged.**
- Mercury found: `core/PipelineSnapshot.js` writes a 30-min full-state JSONL line. The snap object had no symbol field. Snapshots from a 4-hour mixed crypto/stocks day produced unattributable metric streaks.
- Fix (commit `53513fb`): added `symbol: bot.tradingPair || bot.config?.tradingPair || 'unknown'` to the Meta block of `_buildSnapshot()`. Pipeline JSONL is now grep-able by asset.

**F3 — Standalone backtest report filenames untagged.**
- Mercury found: `core/BacktestRunner.js` wrote `backtest-report-v14MERGED-{timestamp}.json`. Multi-asset standalone runs collided on filename or required wrapper-script tagging. Some old reports in the repo are mystery-asset because of this.
- Fix (commit `35ab407`): derive asset slug from `CANDLE_DATA_FILE` env var, append to filename → `backtest-report-v14MERGED-{timestamp}_{assetSlug}.json`.

**F4 — (resolved as already-correct) profit_tier_4 attribution.**
- Audit suspected `profit_tier_4` exit logs were mis-attributed (MPM estimate vs real `closePosition`). Mercury verification proved: `profit_tier_4` originates from a real `StateManager.closePosition` call (the leg-4 exit-tier) not an MPM Map estimate. Correctly attributed. **No fix needed — closure documented in this doc.**

### 5. $298 Dashboard Mismatch + Observability (1 commit)

**Symptom:** Dashboard balance card showed `$298` divergence between WS broadcast and authoritative state.

**Root cause:** Two channels broadcast `state.balance` (free cash sentinel under FIX 2026-03-28 architecture) instead of `getEquity(price)` (free cash + realized P&L + unrealized P&L). After a partial-close mid-trade, free cash != equity by exactly the unrealized P&L amount.

**Fix (commit `707e370`):** Three line changes in `core/CandleProcessor.js` — lines 398, 401, 404 — replace `state.balance` with `getEquity(price)` and rename the broadcast field key from `balance` to `equity` so the dashboard reads the right number. Also tucked into this commit: PIDController dead-getter NOT-WIRED-2026-04-27 warnings on `getPositionMultiplier`, `getRegimeBoostAdjustment`, `getTrailMultiplier` (replaced misleading "called by..." comments since those functions are not in the live path). Plus a TODO comment at `core/ExchangeReconciler.js:174` for Alpaca↔StateManager pre-live reconciliation work.

### 6. April 25 Sweep Winners → Production (Phase 0 Baseline Shifted)

**Commit `16c1b1c`:** applied the April 25 exit-contract sweep winners — SL updates across four strategies. **This commit shifted Phase 0 baseline**, NOT any code change in this session. The new baseline of `$17,551.91169513058 / 1265 trades / 778W/487L / 61.5% WR / 2.66% DD / 2.67 PF` is the post-`16c1b1c` reference. All my subsequent commits reproduce against THIS new baseline, bit-for-bit. The old baseline ($17,950.58…) is no longer the regression gate.

**Trey explicitly accepted:** "this is an acceptable payment -$400 for better win rate and step-forward validation." 57.55% → 61.5% WR is a structural improvement.

### 7. Mercury Tool Expansion (3 commits, parallel CC)

Cursor / parallel CC added three Mercury bridge tools while this session ran:
- `b57493a` — web_fetch (generic HTTPS GET with allowlist + auth)
- `76a9a1b` — git_show (cross-commit history access)
- `d9a6bf2` — tavily_search (public web search via TRAI's existing API key)

These are referenced here for the audit trail. They were not gated by my session's audits; recording them so this session doc captures everything that landed in the window.

### 8. Supervisor B1/B2/B3 Audit Fixes (3 commits, parallel CC)

Earlier supervisor audits surfaced three findings that parallel CC closed inside this window:
- `29670af` — B1: clock-monotonic + parallel polling + health validation
- `df344f5` — B2: persist restart history across supervisor restarts
- `91be425` — B3 review: documented by-design choices + tightened error logging

---

## Smoke Test Results

| Test | Status | Reference |
|------|--------|-----------|
| Phase 0 baseline (BTC 15m, ENABLE_TRAI=false) | PASS | `$17,551.91169513058` reproduces bit-for-bit after every code-touching commit in the arc |
| Per-strategy minConfidence gate fires | PASS | Verified by adding logger probe — 4 locked strategies pass at 0.60, 10 unlocked strategies pass-through (null) |
| SessionRouter Kraken→Alpaca transition | PASS | IndicatorEngine.reset() called, candle-history cleared, priceHistory zeroed, no orphan-position regressions in scenario tests |
| Asset Isolation pipeline | PASS | TradeJournal/PipelineSnapshot/BacktestRunner all carry symbol tag through the full lifecycle |
| $298 dashboard mismatch | PASS (resolved) | Equity vs free-cash now matches authoritative `getEquity(price)` |
| Mercury adversarial reverify (post-fix) | PASS | All findings re-checked in red-team mode; no re-flag, no false-positive findings |

---

## Files Touched (this session, my edits)

| File | Action |
|------|--------|
| `core/TradingConfig.js` | Added `minConfidence: null` + `_validated: null` to 10 contracts |
| `core/StrategyOrchestrator.js` | Wired per-strategy minConfidence filter at :757-770 |
| `core/CandleProcessor.js` | Replaced `state.balance` with `getEquity(price)` at :398, :401, :404; renamed broadcast key `balance` → `equity` |
| `core/PIDController.js` | Replaced "called by..." comments with NOT WIRED 2026-04-27 warnings on getPositionMultiplier / getRegimeBoostAdjustment / getTrailMultiplier |
| `core/ExchangeReconciler.js` | TODO comment at :174 for Alpaca↔StateManager reconciliation pre-live |
| `core/indicators/IndicatorEngine.js` | NEW reset() method re-initializing all 22 stateful indicator buffers |
| `core/SessionRouter.js` | indicatorEngine.reset() + priceHistory clear + candle-history.json clear + abort-transition collection in both _transitionToStocks and _transitionToCrypto |
| `core/TradeJournal.js` | symbol field on recordEntry (:117) + completedTrade (:188) |
| `core/TradeJournalBridge.js` | symbol field on entryData (:89) |
| `core/PipelineSnapshot.js` | symbol field on snap Meta block |
| `core/BacktestRunner.js` | Asset slug derivation from CANDLE_DATA_FILE → filename pattern with `_{assetSlug}` |
| `ogz-meta/specs/apex-shipping-boundary.md` | SessionRouter LIVE update + Phase 10 deferral notes |
| `scripts/download-tsla-unseen.js` | NEW — clone of walkforward script, END_DATE=2026-04-26, OUTPUT=tuning/tsla-15m-unseen.json |

---

## Git Log (commits in this session window, newest first)

```
b57493a feat(mercury): add web_fetch tool — generic HTTPS GET with allowlist + auth
76a9a1b feat(mercury): add git_show tool — cross-commit history access
d9a6bf2 feat(mercury): add tavily_search tool — public web search via TRAI's existing API key
35ab407 fix(asset-iso): tag standalone backtest report filenames with asset slug
53513fb fix(asset-iso): tag PipelineSnapshot output with active symbol
b58d729 fix(asset-iso): tag TradeJournal entries + exits with symbol
36d2da7 fix(swap-resilience): abort transition on close-failure — closes orphan-position risk
4433126 fix(swap-resilience): clear candle-history.json on transition — closes restart-bomb
91be425 docs(supervisor): B3 audit review — document by-design choices + tighten error logging
df344f5 fix(supervisor): B2 — persist restart history across supervisor restarts
45d2b0b fix(swap-resilience): reset IndicatorEngine + priceHistory on broker transition
29670af fix(supervisor): B1 audit fixes — clock-monotonic + parallel polling + health validation
707e370 chore(observability): $298 dashboard fix + PID dead-getter docs + Alpaca reconcile TODO
16c1b1c feat(exit-contracts): apply April 25 sweep winners — SL updates for 4 strategies
deb276e fix(empire): SessionRouter wiring — this.kraken null on boot crashed bot
2623d7c docs(apex-boundary): SessionRouter LIVE — flag flipped at bec08c3, Phase 10 deferred
bec08c3 spec(resilience): defer Phase 10 Kraken migration + flip SESSION_ROUTER_ENABLED=true
5d39230 docs(apex-boundary): SessionRouter is built + flag-gated, not post-Apex deferred
fb8985a feat(orchestrator): wire per-strategy contract.minConfidence gate
d50394a refactor(config): add minConfidence: null to all exit contracts missing the field
```

---

## Half-Cooked Items Status — ZERO open dangerous items

The session began with a long list of "half-cooked" items that were giving Trey red flags. Below is the final state — this list reflects WHERE EACH ITEM ACTUALLY STANDS AS OF END OF SESSION:

| Item | Status | Disposition |
|------|--------|-------------|
| Strategy parity gap (minConfidence missing on 10 contracts) | CLOSED | Batch normalization + per-strategy wiring (`d50394a`, `fb8985a`) |
| SessionRouter post-Apex deferral confusion | CLOSED | Flipped LIVE at `bec08c3`, docs corrected |
| IndicatorEngine state leak across asset swap | CLOSED | reset() method (`45d2b0b`) |
| Restart-bomb via stale candle-history.json | CLOSED | File clear on transition (`4433126`) |
| Orphan position on transition close-failure | CLOSED | Abort transition + failedCloses collection (`36d2da7`) |
| TradeJournal asset-mixing | CLOSED | symbol field on entries + exits (`b58d729`) |
| PipelineSnapshot asset-mixing | CLOSED | symbol field in Meta block (`53513fb`) |
| BacktestRunner filename collision risk | CLOSED | asset slug in filename (`35ab407`) |
| $298 dashboard mismatch | CLOSED | getEquity() in CandleProcessor + StateManager (`707e370`) |
| profit_tier_4 attribution suspicion | RESOLVED | Confirmed accurate (real closePosition, not MPM estimate) — no fix needed |

**Dispositioned (intentional / not closing this session):**
| Item | Disposition |
|------|-------------|
| Phase 11 split (Kraken legacy reconnect, Alpaca ResilientWebSocket migration) | Trey accepted — Phase 10 deferred, Alpaca already migrated to ResilientWebSocket at `a5ee381` |
| Alpaca↔StateManager reconciliation | TODO'd at `core/ExchangeReconciler.js:174` for pre-live cycle |
| MPM internal `realizedPnL` gross-vs-net divergence | Bounded — internal-only, doesn't leak to external state |
| MultiAssetManager.candleCache memory growth | LOW SEVERITY — no aggressive growth observed under realistic session lengths |

---

## Open Items for Next Session (Ranked)

1. **Pre-live cycle on Alpaca paper:** drive an end-to-end paper trade through the SessionRouter → Alpaca path now that the LIVE flag is flipped, and verify reconciliation TODO at `ExchangeReconciler.js:174` against real Alpaca account state.
2. **Sweep matrix on the new strategy roster:** with `minConfidence: null` on the 10 new contracts, run the matrix-sweep tool to find the right gates for CandlePattern / MarketRegime / MultiTimeframe / SmartMoneySweep / OGZTPO. Lock validated contracts with new `_validated` dates.
3. **Walk-forward run on TSLA unseen data:** `scripts/download-tsla-unseen.js` was created with END_DATE=2026-04-26 → `tuning/tsla-15m-unseen.json`. Validate the new Phase 0 baseline holds on this held-out dataset.
4. **MASTER-ROLLOUT.md refresh (low priority):** that doc is from 2026-04-13 and many of its workstream statuses are now stale. Per the new manifest, future sessions reference dated session docs first; MASTER-ROLLOUT only needs a top-level pointer, not a deep rewrite.

---

## Context for Next Session

- New Phase 0 baseline is `$17,551.91169513058 / 1265 / 61.5% WR / 2.66% DD / 2.67 PF` — this is the regression gate going forward.
- SessionRouter is LIVE (flag flipped at `bec08c3`). Crypto via Kraken 24/7, Stocks via Alpaca RTH. Transitions are state-clean (indicators reset, candle history cleared, orphan positions abort).
- Asset attribution is fully wired: every TradeJournal entry, every PipelineSnapshot, every standalone backtest report carries the active symbol.
- $298 dashboard divergence is closed — `getEquity(price)` is the authoritative source for broadcasts.
- 10 new strategy contracts have `minConfidence: null` — sweep is what proves the right value before locking.
- Mercury bridge gained 3 new tools (web_fetch, git_show, tavily_search) — broader research surface for audit dispatches.
- Supervisor passed B1+B2+B3 audit cycle.
- Branch `alpaca/stocks-paper-flip` is at HEAD `b57493a`, all commits pushed.

---

## Recorder Pipeline Disposition

This session followed the spirit of the `/recorder` skill at `.claude/commands/recorder.md`:

- **CHANGELOG.md update:** Index entry added at `ogz-meta/recent-changes.md` (single composite entry per session, not per-commit, per existing convention)
- **fixes.jsonl:** File does not exist in this repo (recorder skill's reference is aspirational). Audit findings + closures are captured ABOVE in this session doc instead, which IS the durable record.
- **RAG reindex:** Run `node trai_brain/mercury-bridge/indexer.js` after this commit lands so Mercury picks up the new session doc.
- **Context docs (Scribe step):** This session doc IS the canonical record. Per the new SESSION-DOC-MANIFEST adopted today, future sessions reference dated session docs as the source-of-truth instead of mutating MASTER-ROLLOUT / RUNNING-TODO / TODO-NEXT-SESSION etc.
- **Git commit:** All work above is already committed in the listed SHAs.
