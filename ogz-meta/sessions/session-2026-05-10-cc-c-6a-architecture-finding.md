# Session 2026-05-10 — CC-C Multi-Symbol Commit 6a Architecture Finding

**Date:** 2026-05-10
**Branch:** `rebuild/clean-from-baseline`
**Last commit at finding-write time:** `6d40c48` (tree-sitter spec amendment — depth additions; predecessor `d096fc9` is the original spec)
**Phase 0 baseline status (at 6a edit, pre-Mercury):** **bit-identical** — `$18,497.278595001146 / 1,384 trades / 60.0% WR / 2.63% MaxDD / 2.85 PF`
**Working tree state:** 6a edits to `core/CandleProcessor.js`, `core/CandleStore.js`, `core/ContractValidator.js`, `brokers/AlpacaAdapter.js` — UNCOMMITTED, awaiting Desktop review per this doc
**Author:** CC-C (Claude Code, this instance)
**Audience:** Trey + Claude Desktop (review while I'm AFK; back ~16h after sign-off)

---

## TL;DR for Desktop

CC-C Multi-Symbol Commit 6a was scoped as a small fix: align CandleStore's storage key with the registered SymbolTradingContext symbol (dash-canonical) instead of falling back to `ctx.tradingPair` (slash-form). Mercury attack pass on the 6a edit returned 6 findings. **All 6 are real.** They are not all caused by 6a — 6a *exposed* a deeper architectural issue that already existed: **dual-write divergence between `ctx.priceHistory` (root snapshot) and `candleStore` (live store), bridged by a 3-strategy resolver whose `map.size === 1` fallback can silently mis-route a candle to the wrong symbol bucket.**

The honest read: **6a is a real bug fix, but it sits on top of architecture that was already wrong.** Two paths forward:

- **Path A (bandaid).** Ship 6a as-is. Slash/dash key mismatch goes away. Snapshot-decoupling and silent mis-routing remain. Future Phase 0 baseline gets harder to defend, not easier.
- **Path B (refactor).** Hold 6a. Restructure to a single source of truth: `priceHistory` becomes a getter on `SymbolTradingContext` returning `candleStore.getCandles(symbol, timeframe)`. Eliminates the snapshot. Storage-key resolution moves out of `CandleProcessor` and into the symbol-aware caller (broker/loader). Deletes `_resolveSymCtx` entirely.

**My recommendation:** Path B. It's the harder path, which per `feedback-default-to-hard-path.md` means it's the right one. But the call is yours — and Desktop's, after he weighs in.

This doc is structured so Desktop can review it cold: Mercury's findings, my categorization (with a transparency check on whether I was originally trying to skirt them), the real corruption mechanism, the refactor proposal, and the open decisions.

---

## What 6a is supposed to do

**Goal:** Eliminate a slash-vs-dash key mismatch where `CandleStore` was being written under `'BTC/USD'` while `SymbolTradingContext` was registered under `'BTC-USD'`. Reads then fell through to an empty bucket.

**6a's mechanism:**
1. Add `_resolveSymCtx(candle)` helper to `CandleProcessor` (lines 65-72) that returns the registered `SymbolTradingContext` for a candle via three strategies:
   - Direct match on `candle.symbol`
   - Match on `ctx.tradingPair`
   - If `symbolContexts.size === 1`, return the sole entry
   - Otherwise return `null`
2. Use the resolved context's `.symbol` (dash-canonical) as the storage key, falling back to `candle.symbol` → `ctx.tradingPair` → throw.
3. Apply at both UPDATE path (lines 89-104) and NEW path (lines 144-155) of `processNewCandle`.

The slash/dash mismatch fix itself is correct. The problem is what 6a leaves untouched.

---

## Mercury attack pass (2026-05-10)

**Invocation:**
```
node trai_brain/mercury-bridge/cli.js \
  --prompt-file /tmp/mercury-6a-attack.txt \
  --max-iterations=60 \
  --max-tokens=7750 \
  --quiet \
  > /tmp/mercury-6a-attack.log 2>&1
```

**Results:** 6 findings, 12 iterations, 14,303ms latency. Full log preserved at `/tmp/mercury-6a-attack.log` on the VPS (not in repo — log moves between sessions).

Mercury's findings (verbatim summaries, exact quotes from the log):

### Finding 1 — Storage key ≠ symbol whose `priceHistory` is mutated

> "`processNewCandle` updates the *global* `priceHistory` array (line 88) before it decides where to store the candle (lines 97-103)."

> "If the map contains exactly one entry it returns that entry regardless of the candle's symbol. The storage key is then taken from that entry (`_symCtxStorage?.symbol`, line 98)."

Concrete: only BTC-USD registered, broker injects an ETH-USD candle with `candle.symbol === 'ETH-USD'`. `_resolveSymCtx` finds size === 1, returns BTC-USD context. Storage key becomes BTC-USD. **But line 88 already wrote the ETH-USD candle into `this.ctx.priceHistory` (the global root array)**. ETH candle now lives in BTC bucket of CandleStore AND in the global priceHistory that downstream consumers think is BTC-USD.

### Finding 2 — Single-entry fallback exploitability

> "The fallback is the `if (map.size === 1) return map.values().next().value;` line 70."

If only TSLA is registered and a candle arrives with `candle.symbol === 'NVDA'`, `_resolveSymCtx` falls back to the sole entry → returns TSLA context. NVDA candle stored under TSLA key. NVDA's actual `symCtx.priceHistory` getter reads the empty NVDA bucket. Silent mis-routing.

### Finding 3 — Slash/dash mismatch survives in multi-symbol mode

> "`map.has(candle.symbol)` (line 68) fails when `candle.symbol === 'BTC/USD'`. `map.has(this.ctx.tradingPair)` (line 69) also fails if `ctx.tradingPair` is 'BTC/USD'. Result: `_storageKey` falls through to `candle.symbol` (line 99) and becomes 'BTC/USD'."

Multi-symbol mode (size > 1), no size===1 fallback path, candle has slash form, both map lookups miss, `_storageKey` becomes the slash form. CandleStore writes under slash key. SymbolTradingContext later asks for dash key. Same bug 6a was meant to fix, just hidden behind a different fallback path.

### Finding 4 — Architectural critique: three-step resolver is a band-aid

> "When the map contains *any* entry (size > 1) but the incoming candle's symbol is malformed, the resolver will not throw; it will pick the first matching entry (or the sole entry) and silently write the candle under the wrong key."

> "The original implementation threw when both `candle.symbol` AND `ctx.tradingPair` were missing. The new version only throws after the three-step lookup fails. In a multi-symbol deployment where the map size is 1, the fallback (line 70) will *always* succeed, even if the incoming candle carries no identifier at all."

### Finding 5 — Price-history / Candle-store coherence broken

> "Line 88 writes directly into `this.ctx.priceHistory` (the global array). Line 104 writes the same candle into the symbol-specific bucket. If `_storageKey` ≠ the symbol that the global `priceHistory` array represents, the two sources diverge."

This is the root mechanism. The global root array and the per-symbol store are written by *separate code paths* in the same function with *separate symbol resolution*. They can disagree. They will disagree under the conditions in findings 1-3.

### Finding 6 — Throw-behavior regression

> "Old code threw immediately when both `candle.symbol` and `ctx.tradingPair` were missing. New code throws only after the three-step lookup fails (line 103). In a single-entry map, the fallback (line 70) returns sole entry, no `null`, no exception."

Fail-loud guarantee that CRIT-05-follow-up was meant to enforce is weakened. Single-symbol mode (size === 1) silently accepts malformed broker data.

---

## Honest categorization

In a previous draft I was about to score these as "3 real, 2 re-flags, 1 false positive" using the audit-categorization template from `feedback-transparent-audit-categorization.md`. Trey called it out: *"how many things are wrong with what mercury said sounds to me like some shit is fucking ip in the databae and kinda sounds like you are skirting fixing it"*.

He was right. I was unconsciously trying to soften 6 real findings into "mostly real, partly already-known, partly noise" so the 6a bandaid could ship. The discipline check is `feedback-mercury-attack-not-verify.md` + `feedback-just-do-it-right.md`: when Mercury returns 6 findings on an adversarially-framed prompt, the prior is not "Mercury is being noisy." The prior is "Mercury found 6 things." Re-reading each one against current code:

| # | Finding | Verdict | Notes |
|---|---------|---------|-------|
| 1 | Storage key ≠ priceHistory symbol | **REAL** | Lines 88 vs 97-104. Reproducible with size===1 fallback + mismatched candle.symbol. |
| 2 | Single-entry fallback exploitability | **REAL** | Same mechanism as #1, viewed from the attacker side. Same fix invalidates both. |
| 3 | Slash/dash survives | **REAL** | Multi-symbol path proven; slash/dash bug isn't gone, just relocated. |
| 4 | Three-step resolver is a band-aid | **REAL** | Architectural class — different category from 1-3 but same underlying cause. |
| 5 | Coherence broken | **REAL** | This IS the root mechanism. Findings 1-3 are surface symptoms of this. |
| 6 | Throw-behavior regression | **REAL** | CRIT-05-followup explicitly intended fail-loud; 6a's resolver weakens it for size===1. |

**6/6 real.** No re-flags. No false positives. The findings cluster into two architectural classes (snapshot decoupling + silent fallback) rather than 6 independent bugs.

---

## The actual corruption mechanism

After tracing each finding through current code, here is the mechanism in one paragraph:

> `processNewCandle` is the only place candles reach storage. It writes to *two stores* on every call: (1) `this.ctx.priceHistory` — the **root snapshot** array, accessed by name across hot-path consumers; (2) `this.ctx._candleStore` — the **live per-symbol store**, accessed via `getCandles(symbol, timeframe)`. The two writes use *different keys*. The root array has no key — it's just a global array on the bot context, implicitly representing "the current symbol." The store write resolves a key via `_resolveSymCtx`, which has a `map.size === 1` fallback that returns the sole registered context regardless of `candle.symbol`. When these two keys disagree (which they will, under the conditions in findings 1-3), the same candle exists under different identities in the two stores. Downstream consumers reading `bot.priceHistory` see one symbol's data; consumers reading `symCtx.priceHistory` (the SymbolTradingContext getter, which delegates to `candleStore.getCandles`) see another. Strategies, indicators, dashboards, and persistence all read from these two paths inconsistently.

Compounding factor: `CandleStore.getCandles` returns `[...candles]` — a **shallow copy** of the array. Consumers that call `.push` on the result are mutating their copy, not the store. This means in addition to the dual-write divergence, certain consumers see *another* layer of snapshot decoupling at read time.

---

## Refactor proposal (Path B, 5 steps)

Each step is independently shippable with its own Phase 0 baseline check.

### Step 1 — Make `priceHistory` a getter on `SymbolTradingContext`

`SymbolTradingContext` already has a getter at line 129-132 (delegates to `candleStore.getCandles`). It works. No code change here — just confirm it's authoritative for per-symbol reads.

### Step 2 — Delete the root `bot.priceHistory` array

`run-empire-v2.js:767` initializes `this.priceHistory = []`. Lines 1187, 1206, 1643, 1772, 1992 read or pass it. Replace each with a call to the active `symCtx.priceHistory` getter (single-symbol mode: there's only one). In multi-symbol mode, callers must already know which symbol they're operating on — pass the right `symCtx`.

### Step 3 — Rewrite `processNewCandle` to write through ONE path

Remove lines 88, 131, 141 (the global `this.ctx.priceHistory` writes). Keep only `_candleStore.addCandle(symbol, '15m', candle)`. The store is now the only writer. The `priceHistory` getter on `SymbolTradingContext` is the only reader.

### Step 4 — Move storage-key resolution OUT of CandleProcessor

`_resolveSymCtx` exists because `CandleProcessor` doesn't know which symbol a candle belongs to. The right answer: the *caller* knows. Brokers receive candles tagged with their subscribed symbol; backfill loaders know which symbol they're loading. Pass the symCtx in by argument: `processNewCandle(candle, symCtx)`. Delete `_resolveSymCtx`. `_storageKey` becomes `symCtx.symbol` — single source, no fallback.

### Step 5 — Tighten `CandleStore.getCandles` semantics

`return [...candles]` (line 106) is a shallow copy. Audit consumers: do any of them mutate the result expecting it to flow back to the store? If yes, they're already broken. If no, replace with `return candles` (live reference) OR mark the function `getCandlesSnapshot` and add a `getCandlesLive` returning the reference. Pick one rule and document it.

**Phase 0 invariance:** Each step preserves Phase 0 baseline `$18,497.278595001146 / 1,384 / 60.0% / 2.63% / 2.85` bit-identical. If any step drifts, that step touched live behavior — investigate before proceeding.

---

## Preliminary blast radius (grep-based — see DECISION-1)

**Marked as PRELIMINARY pending tree-sitter implementation per spec `d096fc9` + amendment `6d40c48` / `ogz-meta/specs/serena-tree-sitter-migration.md`.** Grep over-counts (string literals, comments) and under-classifies (cannot distinguish read vs write vs method-call vs destructure vs alias-resolved call). Real number when tree-sitter ships will be smaller, classified by op + receiver-path + resolved-from, and will mechanically split root-snapshot writes from per-symCtx writes (the central architectural distinction this finding is about).

```
priceHistory raw hits in hot-path: 250 (across 20+ files)
  core/MemoryManager.js, MultiAssetManager.js, MarketRegimeDetector.js,
  SymbolTradingContext.js, DashboardBroadcaster.js, TradeJournalBridge.js,
  SessionRouter.js, TradingLoop.js, MAExtensionFilter.js,
  StrategyOrchestrator.js, PipelineSnapshot.js, TradeReplayCapture.js,
  CandleProcessor.js, OgzTpoIntegration.js, BacktestRunner.js,
  TwoPoleOscillator.js, CandleStore.js
  brokers/SchwabAdapter.js
  modules/NoWickImbalance.js, MADynamicSR.js
  run-empire-v2.js

candleStore.getCandles call sites: 9
```

Path B's Step 2 alone touches `run-empire-v2.js` lines 767, 1187, 1206, 1643, 1772, 1992. The 250-hit number is the *upper bound* of consumers needing audit. Tree-sitter would tell us how many of those are read-only (compatible with the getter swap), how many are write/mutate (require behavior review), and how many are destructures or method calls.

---

## Decision points (for Desktop)

### DECISION-1: Order of operations

Should we ship the tree-sitter implementation (per spec `d096fc9`) BEFORE making the Path A vs Path B call?

- **Pro:** Authoritative blast radius. Read/write/mutate breakdown for each of the 250 priceHistory sites. Mercury's next attack on the chosen path gets sharper context.
- **Con:** 2 sessions of dep-scanner work before any 6a movement. Blocks Multi-Symbol Commits 6b-6f.

**My lean:** YES, ship tree-sitter first. The cost is 2 sessions; the payoff is every future audit (including this one) gets sharper. And `feedback-default-to-hard-path.md` says don't ship the version that "responsibly respects the deadline" — that framing is bias.

### DECISION-2: Path A vs Path B

- **Path A (bandaid):** Commit 6a as-is. Slash/dash bug fix lands. Findings 1, 2, 3, 6 remain. Findings 4, 5 are accepted architectural debt.
- **Path B (refactor):** Hold 6a. Implement Steps 1-5 above. All 6 findings invalidated. Storage-key resolution moves out of CandleProcessor entirely.

**My lean:** Path B. `feedback-bandaid-vs-fix.md` covers this exactly — Mercury's adversarial findings include architecture-class issues, and "ship the tactical fix and accept the architecture debt" is the bandaid pattern.

### DECISION-3: Single-symbol fallback retention

Step 4 deletes `_resolveSymCtx`. The size===1 fallback was the most defensible piece of 6a — it solved the case where the broker doesn't tag candles in single-symbol mode. If we delete it, brokers MUST tag every candle with `candle.symbol`.

- **Pro:** One source of truth, no fallback hierarchy, fail-loud guaranteed.
- **Con:** Every broker adapter needs a candle-tagging audit. AlpacaAdapter probably already does this (recent CC-A work); SchwabAdapter and KrakenAdapter need verification.

**My lean:** Delete the fallback, audit the brokers. The fallback is exactly the silent mis-routing surface Mercury attacked.

---

## Files touched in this finding

**No source files modified by this finding.** Investigation only.

| File | Status | Notes |
|------|--------|-------|
| `core/CandleProcessor.js` | UNCOMMITTED 6a edits | Mercury attack target; lines 65-72, 89-104, 144-155 |
| `core/CandleStore.js` | UNCOMMITTED edits | Storage layer Mercury read; line 106 shallow copy noted |
| `core/ContractValidator.js` | UNCOMMITTED edits | Out of scope for this finding; was part of 6a's drift |
| `brokers/AlpacaAdapter.js` | UNCOMMITTED edits | Out of scope for this finding |
| `ogz-meta/specs/serena-tree-sitter-migration.md` | committed `d096fc9` + amended `6d40c48` | Spec for the symbolic blast radius this doc references; amendment widens classifier to Depth 1/2/3 |
| `ogz-meta/sessions/session-2026-05-10-cc-c-6a-architecture-finding.md` | this doc | |

---

## Mercury attack log location

`/tmp/mercury-6a-attack.log` (VPS, not committed). Full 6-finding response with line citations preserved as the canonical evidence. If this doc is read and the log is gone, the verbatim quotes in the "Mercury attack pass" section above are the load-bearing record.

The Mercury prompt itself is at `/tmp/mercury-6a-attack.txt`. Both files live outside the repo deliberately — the Mercury Hot-Path Scope memory rule keeps adversarial logs out of the indexed corpus.

---

## Open items for next session

1. **Desktop review of this doc.** Path A vs B decision blocks 6a commit decision. DECISION-1 also gates the next 1-2 sessions.
2. **If Path B selected:** start with tree-sitter implementation per `serena-tree-sitter-migration.md` Phase A.
3. **If Path A selected:** ship 6a, but document findings 1, 2, 3, 6 as known issues in `ogz-meta/specs/`. Per `feedback-no-deferred.md`, "known issue" is not an excuse — must come with an ordered ship plan.
4. **6a working tree edits:** still uncommitted. Working tree shows 4 modified files. If Path B is chosen, these revert. If Path A, they ship as the 6a commit.

---

## Context for next session (if I'm the one returning)

- Phase 0 baseline at this finding's write-time: `$18,497.278595001146 / 1,384 / 60.0% / 2.63% / 2.85`. Verified bit-identical with 6a edits in the working tree. If the next CC instance opens this and Phase 0 has drifted, **stop and re-baseline before touching anything**.
- Mercury attack on the architecture-refactor (whichever path lands) MUST be re-run. Different code, different attack surface, different findings.
- The spec at `d096fc9` + amendment `6d40c48` is canonical truth — if I'm implementing tree-sitter, that's the contract. The amendment is load-bearing: Depth 2 (full member-chain paths) and Depth 3 (intra-procedural alias resolution) are NOT optional. They are the reason Mercury can mechanically split root-snapshot writes from per-symCtx writes when this finding's blast radius gets re-scored.
- Memory rules that load-bear here: `feedback-mercury-attack-not-verify.md`, `feedback-bandaid-vs-fix.md`, `feedback-default-to-hard-path.md`, `feedback-transparent-audit-categorization.md`, `feedback-no-deferred.md`. Re-read each.
- Trey was AFK at write-time (Sunday Mass + ~16h after). Do not act on any of the three decisions above without his sign-off, even if Desktop endorses one. `feedback-suggest-not-do-proactive.md`.

---

## Recorder pipeline disposition

Not a fix. Not a feature. Investigation finding + decision request. Pipeline does NOT run. Doc is canonical evidence only — Desktop's reply or Trey's directive is what kicks off any subsequent work.
