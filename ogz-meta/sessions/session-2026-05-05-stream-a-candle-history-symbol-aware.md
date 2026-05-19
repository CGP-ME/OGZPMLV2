# Session 2026-05-05 — Stream A: Candle History Symbol-Aware (Changes 1 + 2 Shipped, Change 3 Open)

**Branch:** `rebuild/clean-from-baseline`
**Last commit at session-form write:** `23cbac6` — feat(candle-store): CC-A Change 1 — symbol-keyed v2 persistence schema (clean re-typed after two reverts; Change 2 P0-validated and waiting in working tree at form-write time).
**Phase 0 baseline (new anchor):** `$18,497.278595001146 / 1384 trades / 60.0% WR` on `tuning/tsla-15m-2y.json` EMASMACrossover SOLO. Re-anchored this session from prior `$17,950.589592711076` baseline due to DTO `||→??` semantic shift around MACD zero-crossings. Spec doc: `ogz-meta/specs/baseline-phase0-2026-05-06.md` (replaces 2026-04-20 doc verbatim, no movement language per Trey directive).
**Driver:** Stream A spec `ogz-meta/ledger/spec fixes/a/01-HIGH-CC-SPEC-CANDLE-HISTORY-SYMBOL-AWARE.md` — three coordinated changes covering symbol-keyed candle persistence, broker-boundary µs→ms normalization, and RTH guard defensive unit checks. Final round before prop firm eval, so workflow discipline mandated: one change → one commit, P0 baseline match required after each change, Mercury adversarial attack post-P0, line-by-line `git diff --cached` verification before commit.

---

## What Was Done This Session

### 1. CC Mix-Up Resolved → Reassigned to Stream A
Originally assigned "section b" in `ogz-meta/ledger/spec fixes/`. Trey clarified mid-session that Stream A was open and another CC would finish section B; swapped targets without touching B's files. Stream A spec covers `core/CandleStore.js` v2 persistence + broker-boundary unit normalization + RTH guard hardening.

### 2. Phase 0 Anchor Reset → `$18,497.278595001146` (replaces `$17,950.589592711076`)
Old anchor was invalidated by a prior DTO `||→??` semantic shift around MACD zero-crossings (treats `0` as a real crossing instead of falsy-fallback to the previous histogram value). Re-anchored against current HEAD per Trey + Desktop diagnosis. Replaced `ogz-meta/specs/baseline-phase0-2026-04-20.md` with `ogz-meta/specs/baseline-phase0-2026-05-06.md`, copying the old layout verbatim with the new numbers — explicitly **no "moved from X to Y" language** per Trey directive ("future you will bring that up every time there is drift and i dont wanna deal with that").

### 3. Stream A Change 1 — Symbol-Keyed v2 Persistence Schema (commit `23cbac6`, after 2 recovery cycles)
**Goal:** `data/candle-history.json` was a flat `Array<Candle>` with no symbol/timeframe key. With Wolf's multi-symbol architecture coming, this had to become `{ schemaVersion: 2, savedAt, unit: "ms", candles: { "TSLA__1m": [...], "BTC__1m": [...] } }`.

**Changes:**
- `core/CandleStore.loadFromDisk` rewrite: rejects v1 `Array` shape outright (no in-place migration — Trey's call: "Reject v1"), rejects non-v2 shape, hydrates only the requested `${symbol}__${timeframe}` slot, filters stale candles via `_t(c) > cutoff` against the configured retention horizon.
- `core/CandleStore.saveToDisk` rewrite: read-modify-write to preserve sibling slots, only writes when `slotCandles.length > 0` (Mercury Finding 3 fix — see below).
- `run-empire-v2.js` `loadCandleHistory`: clears `this.priceHistory = []` before hydrate then re-binds to `this._candleStore.getCandles(symbol, '1m')` — Trey's call: "Clear priceHistory before hydrate" (vs. merge).

**Two bundling disasters before clean ship:**

| Attempt | Commit | Outcome | Root Cause |
|---|---|---|---|
| First | `946175e` | Reverted via `3b230ed` | Trusted `git add` instead of verifying staged set with `git status` — pulled in 21 dashboard panel files already pre-staged in the index from a parallel CC session |
| Second | `f7bf8e5` | Reverted via `a3456f7` | Used `git checkout 946175e -- core/CandleStore.js run-empire-v2.js` to recover work — that snapshot included CC-C's webhook adapter wiring that I never wrote, shipped under my commit |
| Third | `23cbac6` | **CLEAN — shipped** | Manually re-typed every Change 1 hunk via Edit tool, ran `git diff --cached` line-by-line before commit, verified zero foreign code |

Trey's reaction to the second disaster: "this is your literal second time shipping someone else's work what is your problem" — followed by "revert it yet again and were all going to wait for you to commit only your work." Recovery used `git revert` not `git reset --hard` per the revert-first-default rule.

### 4. Stream A Change 2 — Broker-Boundary µs→ms Unit Normalization (P0-VALIDATED, NOT YET COMMITTED at form-write)
**Goal:** Alpaca occasionally returns timestamps in microseconds or nanoseconds (year-5000+ ms equivalents), corrupting CandleStore on save and triggering false RTH gap-recovery on load. Normalize at the broker boundary, harden the validator, harden the loader as defense-in-depth.

**Changes:**
- `brokers/AlpacaAdapter.js` — added `_normalizeTsToMs(ts)` helper covering ISO string (with NaN-on-invalid catch), nanoseconds (≥1e18 → /1e6), microseconds (≥1e15 → /1000), negative-rejection, finite-only. Wired into REST `/bars` handler (line ~404), stream trade handler (~677), stream bar handler (~686).
- `core/ContractValidator.js` — strictness: `assertRange('timestamp', timestamp, 1e12, 1e14)` — derived from `Date.UTC(2001,0,1) ≈ 9.78e11` lower edge to `Date.UTC(5138,0,1) ≈ 9.99e13` upper.
- `core/CandleStore.loadFromDisk` — early-reject if any candle in the requested slot has out-of-range etime (`< 1e12 || > 1e14`), warn and start fresh rather than poisoning hydration.

**P0 result (just confirmed):** `Final Balance: 18497.278595001146 / 1384 / 60.0% WR` — bit-for-bit anchor match. Working tree state at form-write:
```
modified:   brokers/AlpacaAdapter.js   (+45/-5)
modified:   core/CandleStore.js        (+13/0)
modified:   core/ContractValidator.js  (+4/-1)
```
`git diff` already read line-by-line — verified 100% Stream A Change 2 work, zero foreign code. Awaiting one final `git diff --cached` pre-commit pass to honor the post-`f7bf8e5` discipline.

### 5. Mercury Adversarial Attacks (post-P0, both changes)
Per `feedback-mercury-attack-not-verify.md` — attack-framed prompts only.

**Change 1 attack:** 5 findings.
- **Finding 3 (REAL — applied):** Cold-start save erases prior data. If `saveToDisk` is called before `loadFromDisk` populates the in-memory map, `slotCandles.length === 0` would still trigger a slot replacement, wiping the on-disk slot. Fix: gate the slot-replace block behind `if (slotCandles.length > 0)`.
- 4 false positives / re-flags after re-verification against actual cited lines.

**Change 2 attack:** 9 findings.
- **Finding 1 (REAL — applied):** Invalid ISO string returns `NaN` from `getTime()` — would propagate through validator. Fix: catch `Number.isFinite(parsed)` in the string branch of `_normalizeTsToMs` and return `null` on NaN.
- **Finding 3 (REAL — applied):** Negative timestamp (corrupted/pre-epoch payload) passed through. Fix: `if (ts < 0) return null` after the finite-number check.
- **1 MED real (out of scope):** Multi-broker timestamp drift across stream sources — will need a per-broker offset table; not Stream A's scope.
- **1 spec-scope-skip:** Broker-side rate-limiter hardening — not in this spec.
- **4 false positives / 2 confirmations.**

Categorization breakdown follows `feedback-transparent-audit-categorization.md` — character-level expectation, no severity ducking.

### 6. CHANGES NOT YET COMMITTED → 4 staged hunks, 0 commits
After P0 confirmed Change 2 anchor-match:
1. `git add brokers/AlpacaAdapter.js core/ContractValidator.js core/CandleStore.js`
2. `git diff --cached` — read EVERY line (per discipline reset after `f7bf8e5`)
3. Commit with message documenting Change 2 + Mercury Findings 1+3 fixes + reasoning for skipped findings
4. `git push origin rebuild/clean-from-baseline`
5. Move to Change 3 (RTH guard pre-check in `core/CandleProcessor._isExpectedMarketClose`)

Form is being written ahead of commit at Trey's request — commit + push will happen immediately after.

---

## Smoke Tests

| Test | Status | Reference |
|------|--------|-----------|
| Phase 0 baseline post-Change 1 (`23cbac6`) | **PASS** | `$18,497.278595001146 / 1384 / 60.0%` — bit-for-bit |
| Phase 0 baseline post-Change 2 (working tree) | **PASS** | Task `bf61wgi6p`: `$18,497.278595001146 / 1384 / 60.0%` — bit-for-bit anchor reproduce |
| `_normalizeTsToMs` syntax check | **PASS** | `node --check brokers/AlpacaAdapter.js` |
| `CandleStore` syntax check | **PASS** | `node --check core/CandleStore.js` |
| `ContractValidator` syntax check | **PASS** | `node --check core/ContractValidator.js` |
| Mercury Change 1 attack | **PASS (5 findings, 1 real applied)** | Finding 3 — cold-start save erase, fixed via `length > 0` gate |
| Mercury Change 2 attack | **PASS (9 findings, 2 real applied)** | Findings 1+3 — NaN catch, negative-reject |
| `git diff --cached` line-by-line review | **PASS (Change 1)** | Trey-required discipline post-`f7bf8e5` disaster |
| `git diff` line-by-line review (Change 2 working tree) | **PASS** | Zero foreign code, all hunks attributable to Stream A Change 2 |
| Change 3 (RTH guard) | **NOT STARTED** | Open for next session |

---

## Files Touched

| File | Change | Commit |
|------|--------|--------|
| `core/CandleStore.js` | symbol-keyed v2 persistence schema (loadFromDisk reject v1 + slot-key hydrate, saveToDisk read-modify-write + length-gate) | `23cbac6` |
| `run-empire-v2.js` | `loadCandleHistory` clear-before-hydrate; rebind `priceHistory` to `_candleStore.getCandles(symbol, '1m')` | `23cbac6` |
| `ogz-meta/specs/baseline-phase0-2026-05-06.md` | NEW — replaces 2026-04-20 anchor doc verbatim with new numbers, zero movement language | (with Change 1 commit) |
| `brokers/AlpacaAdapter.js` | `_normalizeTsToMs(ts)` helper + wired into REST `/bars`, stream trade, stream bar handlers; Mercury Findings 1+3 applied | **uncommitted at form-write** |
| `core/ContractValidator.js` | timestamp range tightened to `1e12 < ts < 1e14` | **uncommitted at form-write** |
| `core/CandleStore.js` (Change 2 hunk) | `loadFromDisk` early-reject on out-of-range etime | **uncommitted at form-write** |

**Touched but reverted (Change 1 recovery cycles):**
- `946175e` reverted via `3b230ed` — bundled 21 unrelated dashboard panel files because index was pre-staged from a parallel CC session.
- `f7bf8e5` reverted via `a3456f7` — used `git checkout 946175e -- <files>` for recovery; that snapshot contained CC-C's webhook adapter wiring (`2d875f6` material) which I'd never authored.

---

## Git Log (this session, top-down chronological)

```
(working tree)  Change 2 — broker-boundary µs→ms normalization (P0-validated, 3 files staged-pending)
23cbac6         feat(candle-store): CC-A Change 1 — symbol-keyed v2 persistence schema  ← clean re-typed
a3456f7         Revert "feat(candle-store): CC-A Change 1 ..."                          ← undid f7bf8e5
f7bf8e5         feat(candle-store): CC-A Change 1 ...                                   ← BUNDLED CC-C webhook wiring (revert)
3b230ed         Revert "feat(candle-store): CC-A Change 1 ..."                          ← undid 946175e
946175e         feat(candle-store): CC-A Change 1 ...                                   ← BUNDLED 21 dashboard panel files (revert)
```

Note `afce412` (CC-C webhook adapter restore + 4 Mercury fixes) and `2d875f6` (CC-C webhook adapter original) are not mine — landed by parallel session after I reverted the bundled snapshot.

---

## Half-Cooked Items Status

| Item | Status | Note |
|------|--------|------|
| Stream A Change 1 (symbol-keyed v2) | **CLOSED — `23cbac6`** | P0 bit-for-bit, Mercury Finding 3 fix in place |
| Stream A Change 2 (µs→ms normalization) | **READY TO COMMIT** | P0 bit-for-bit, Mercury Findings 1+3 fixes in place, `git diff` reviewed; awaiting `git diff --cached` pre-commit pass + commit + push |
| Stream A Change 3 (RTH guard pre-check) | **OPEN — not started** | Spec target: `core/CandleProcessor._isExpectedMarketClose`. Add etime range check (`if (lastEtime > 1e14 || nextEtime > 1e14 || lastEtime < 1e12 || nextEtime < 1e12) { console.warn('[GAP-RECOVERY-CORRUPTION]'); return false; }`). P0 + Mercury attack required after. |
| CC-C webhook adapter wiring orphan | **CLOSED — `afce412`** | Their `2d875f6` had emit-hooks referencing `ctx.webhookAdapter` but my Change 1 revert removed the wiring — they re-committed wiring + 4 Mercury fixes themselves |
| Pattern bank routing bug (`UnifiedPatternMemory.js:181`) | **OPEN — documented** | Slash-only crypto detection misses `BTC-USD` dash form. Not Stream A scope. Documented in SessionRouter spec addendum |
| Old `$17,950.589592711076` anchor doc | **CLOSED — replaced by `baseline-phase0-2026-05-06.md`** | Verbatim layout, new numbers, zero movement language per Trey |

---

## Open Items for Next Session

1. **Commit + push Change 2** (this session if Trey approves immediately, otherwise next session). Workflow: `git diff --cached` line-by-line → commit → push → confirm `origin/rebuild/clean-from-baseline` advances.
2. **Stream A Change 3 — RTH guard pre-check.** `core/CandleProcessor._isExpectedMarketClose` adds etime sanity bounds before any RTH calculation. Defense-in-depth: even if Change 2 normalizes at the broker boundary, a corrupted on-disk file or stale cached candle could still feed the RTH path. P0 + Mercury attack required.
3. **Stream A acceptance test** — full spec pass-through after Change 3 ships. Spec at `ogz-meta/ledger/spec fixes/a/01-HIGH-CC-SPEC-CANDLE-HISTORY-SYMBOL-AWARE.md`.
4. **MEMORY.md index update** — none needed for Stream A specifically. Pattern of "manually re-type after revert vs. `git checkout sha -- file`" is a candidate feedback memory but the existing `feedback-git-status-before-commit.md` (saved last session) covers the broader rule. Decide if a sibling memory is warranted.
5. **Pattern bank routing bug** (`UnifiedPatternMemory.js:181` slash-only crypto detection misses dash form). Out of Stream A scope but should land in the SessionRouter / multi-symbol queue.

---

## Context for Next Session

- **Phase 0 anchor:** `$18,497.278595001146 / 1384 / 60.0%` on `tuning/tsla-15m-2y.json` EMASMACrossover SOLO. Reproduces bit-for-bit at `23cbac6` AND working-tree (Change 2 staged-pending).
- **Stream A spec:** `ogz-meta/ledger/spec fixes/a/01-HIGH-CC-SPEC-CANDLE-HISTORY-SYMBOL-AWARE.md` — three changes total. Change 1 shipped, Change 2 P0-validated, Change 3 not started.
- **Workflow discipline locked:** (a) one change → one commit, (b) P0 baseline after each change, (c) Mercury adversarial attack post-P0, (d) `git diff --cached` line-by-line BEFORE commit, (e) revert-first if a commit goes wrong (`git revert`, never `git reset --hard`).
- **Recovery pattern:** when a commit bundles foreign code, do NOT use `git checkout <bundled-sha> -- <file>` to recover — that snapshot contains the foreign code. Manually re-type each hunk via Edit tool, then verify with `git diff --cached`. Earned twice this session.
- **Mercury attack discipline:** attack-framed prompts only ("find a state that LIES", "construct a CRASH"). Verification framing returns soft findings. From C2 case study and `feedback-mercury-attack-not-verify.md`.
- **Anchor doc rule:** when re-anchoring, replace the old doc verbatim with new numbers, NO "moved from X to Y" language. Trey explicit: future me will surface drift narratives every regression and that's noise.

---

## Recorder Pipeline Disposition

- **Mercury reindex needed?** Yes — once Change 2 commits, `core/CandleStore.js`, `brokers/AlpacaAdapter.js`, `core/ContractValidator.js` will all have changed shapes Mercury should re-chunk. Run `node trai_brain/mercury-bridge/indexer.js` after Change 2 push.
- **CHANGELOG.md update?** Optional — Stream A Changes 1–3 will land as a single entry once all three commit. Defer until Change 3 ships.
- **`fixes.jsonl` entry?** YES — append once Change 2 commits and again once Change 3 commits. Entries:
  - `23cbac6` — Stream A Change 1 (symbol-keyed v2 candle persistence)
  - (pending sha) — Stream A Change 2 (broker-boundary µs→ms normalization)
  - (pending sha) — Stream A Change 3 (RTH guard pre-check)
- **Memory updates:** No new memory files saved this session. Existing `feedback-git-status-before-commit.md` covered the discipline that broke twice. The `feedback-revert-first-default.md` memory was honored on both reverts.
- **Mermaid charts:** No architectural shape changes. CandleStore got a schema bump (v1 → v2) but topology is unchanged. SKIP.
- **Spec doc movement:** `ogz-meta/specs/baseline-phase0-2026-04-20.md` → `ogz-meta/specs/baseline-phase0-2026-05-06.md` (replace, not supersede). Old doc removed in Change 1 commit.
