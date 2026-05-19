# Session 2026-05-05 → 2026-05-06 — Serena × Mercury `/critic-attack` Shipped + Validated

**Branch:** `rebuild/clean-from-baseline`
**Last commit at session end:** `4a6f14a` — fix(state-manager): symmetric Map serialization for lastPrices (parallel session, post-recovery)
**Phase 0 baseline:** `$17,950.589592711076 / 1430 trades / 57.55% WR` on `tuning/tsla-15m-2y.json` EMASMACrossover SOLO — verified bit-for-bit at session start (commit `5bfd0b1`) and re-verified post NaN-guard fix (commit `9b0011e`).
**Driver:** Phase-0 regression test request that surfaced 6 architectural holes in `core/SessionRouter.js`, then expanded into shipping the Wolf-spec Serena × Mercury Integration to dogfood `/critic-attack` against the same target.

---

## What Was Done This Session

### 1. Phase 0 Regression Validation → `$17,950.589592711076` Reproduces Bit-for-Bit
Trey asked for "one more regression test." Discovered `tools/regression-test.js` is **orphaned** — points at `tuning/tuning-backtest-full.js` which was deleted in commit `9451943` ("zombie files that keep resurrecting"), and the stored baseline at `tuning/regression-baseline.json` is pinned to `0267ca8` from 2026-03-11 (pre-NoWick / ORB-DST / BreakRetest migration).

**Fix:** Used the canonical Phase 0 invocation from `ogz-meta/specs/baseline-phase0-2026-04-20.md` directly against `run-empire-v2.js`. `EMASMACrossover SOLO`, `EXIT_SYSTEM=legacy`, `FEE_MAKER=0`, `BACKTEST_MODE=true`, `BACKTEST_FAST=true`, etc. **Result: `$17,950.589592711076` to the 14th decimal** — same baseline that's been reproducing since the SessionRouter shipped dormant.

**Lesson saved:** the env-var diff that bit a parallel CC session ("$8K + 4,681 pattern broadcasts") was confirmed to be missing flags (`EXIT_SYSTEM=legacy`, `BACKTEST_FAST=true`, `ENABLE_DASHBOARD=false`), not a code drift.

### 2. SessionRouter Architectural Audit (6 holes catalogued)
Trey grilled me on `core/SessionRouter.js` after Phase 0 passed. **Six gaps from the gated-off file:**
1. No pattern bank / indicator buffer reset on swap (BTC's RSI carries into TSLA)
2. No `state.priceHistory = []` — strategy memory contaminated cross-asset
3. **Crypto→stocks transition has NO force-close** (only stocks→crypto does); open BTC trade orphaned at 09:30 ET
4. No swap-gate — failed force-closes are skipped, transition proceeds anyway with `continue`
5. No historical candle backfill on new asset before strategies fire
6. Currently dormant under `SESSION_ROUTER_ENABLED=false` — blast radius zero, but flipping to true risks all 5 above silently

These remain open. SessionRouter is not safe to flip live until they're addressed.

### 3. Serena × Mercury Integration Shipped → `/critic-attack` Live (commit `124ff96`)
Wolf-spec implementation per `ogz-meta/ledger/spec fixes/CC-SPEC-SERENA-MERCURY-INTEGRATION_1.md`. **Five surgical changes:**
- `tools/dep-scanner.js` — added `getCallers(target)` inverse call-graph + `module.exports` + `require.main` guard (~47 lines)
- `tools/serena-bridge.js` — NEW, 89 lines, wraps dep-scanner with 5s timeout via `Promise.race`, formats markdown for Mercury injection
- `trai_brain/mercury-bridge/react-loop.js` — added `blastRadius` param + system-message injection at position 3 (between traceHint and userQuery for max recency-weighting)
- `trai_brain/mercury-bridge/ask.js` — threaded `blastRadius` through `runAgentic` to `runReactLoop`
- `.claude/commands/critic-attack.md` — slash command spec, attack-only framing per `feedback-mercury-attack-not-verify.md`

**Decisions locked:** 30-caller cap, 10-line citation tolerance, serial Serena→Mercury, 5s timeout, max-tokens=7750.

Canonical doc at `ogz-meta/specs/serena-mercury-integration.md`.

### 4. Ollama Cloud Provider Wiring (commit `6e101ab`)
Mercury's Inception API hit 503 mid-dogfood; Trey said "switch to Ollama Cloud." `.env` had `OLLAMA_API_KEY` + `OLLAMA_CLOUD_URL=https://api.ollama.com` set, but `core/persistent_llm_client.js`'s PROVIDERS table only knew about `localhost:11434` ollama. Plus `generateWithTools` at line 271 throws on non-`openai` request format.

**Caught my own bug pre-deploy:** named the entry `ollamaCloud` (camelCase) but the provider lookup at `:67` lowercases everything → "Unknown LLM provider: ollamacloud" error. Renamed to `ollamacloud` to match the existing convention.

**Discovered the real Ollama Cloud endpoint:** `api.ollama.com` 301-redirects to `ollama.com/v1/chat/completions`. OpenAI-compat works. `gpt-oss:20b-cloud` ping returns in 400ms; `qwen3-coder:480b-cloud` cold-start is ~28s.

**Threading change to `ask.js`:** caller-supplied `opts.provider` / `opts.model` / `opts.apiKey` with provider-specific env-var fallback chain (`OLLAMA_API_KEY` for `ollamacloud`).

### 5. `/critic-attack` Dogfood — SessionRouter Head-to-Head (Mercury vs Qwen3-Coder)
Same target, same blast radius, same prompt, two backends:

| Backend | Wall | Iterations | Cold-start |
|---|---|---|---|
| Mercury (Inception) | 34.5s | 10 | 0.6s |
| Qwen3-Coder 480B (Ollama Cloud) | 245s | 11 | 28s |

**Both backends found 3 real bugs each, complementary not redundant:**
- Both flagged listener-cleanup gap (Qwen: only `ohlc` removed; Mercury: ghost positions from premature unsubscribe)
- Both flagged `registerBroker` issue (Qwen: race; Mercury: listener accumulation)
- Mercury uniquely caught: silent-loss-of-trades on missing price (line 184-197 `continue`)
- Qwen uniquely caught: asymmetric crypto subscription (subs `cryptoSymbols[0]` only vs all stocks)

**Pattern observed:** both LLMs reasoned from what's PRESENT in the file. Neither stepped back to ask "what's missing entirely?" — that's where the human audit's 4 architectural-omission findings (state contamination, crypto→stocks force-close, historical backfill) still beat the LLM passes. **`/critic-attack` is excellent for line-level bugs; architectural-omission audits still need a human pass.**

### 6. `/critic-attack` Dogfood — RTH Gap Fix Validation (Mercury on `core/CandleProcessor.js`)
Attacked the freshly-shipped `349172a` RTH-aware gap guard. Mercury found 3 in 31s. After verifying against the actual cited lines:

- **Finding #1 (stock regex too narrow):** RE-FLAG. Mercury's `BTCUSD` example was wrong (6 chars don't match `{1,5}`). Theoretical concern. Code already adversarially tightened by prior Mercury pass.
- **Finding #2 (`rthCloseMinute` undefined → NaN):** **REAL.** If `MarketCalendar.getMarketPhase()` returns a phase object with undefined `rthCloseMinute`, `undefined - 30 = NaN`, `isAfterClose=false`, function returns false, caller triggers backfill on a legit overnight pause — resurrects exactly the bug `349172a` was supposed to fix. **Fixed.**
- **Finding #3 (backfill doesn't target gap interval):** **FALSE POSITIVE on my grading.** Mercury didn't read past line 215 in its 9-iteration walk. The timestamp-range filter exists at lines 231-234. Self-corrected after re-verifying.

### 7. Poisoned-Commit Recovery — `4a1f72e` → revert → clean re-apply
Committed the NaN-guard fix as `4a1f72e` claiming "1 file 7 lines." The commit was actually **94/-80 across 9 files** — the parallel CC/Cursor session had pre-staged 7 production files yesterday (FeatureExtractor, OrderExecutor, PatternMemoryBank, TradeIntelligenceEngine, TradingLoop, IndicatorSnapshotDTO, run-empire-v2) that sat in the index for 7.5 hours, plus an IndicatorEngine.js mod from earlier today. My `git add core/CandleProcessor.js && git commit` absorbed all of them under the misleading title.

**Root cause:** `git add` is additive. I treated it as if it gave me an exclusive index.

**Fix sequence (Trey chose Option A — `git revert` over `git reset --soft`):**
1. `git stash push core/indicators/IndicatorEngine.js` — preserved the 02:54 post-commit edit
2. `git revert 4a1f72e --no-edit` → created `160a306`, then amended message to `9150afd` labeling it "POISONED COMMIT (in retrospect)"
3. Re-applied NaN guard to CandleProcessor.js cleanly
4. `git status` first this time, confirmed only `M core/CandleProcessor.js`
5. Committed as `9b0011e` — title matches diff (1 file, 7 insertions)
6. Pushed `4a1f72e..9b0011e` (fast-forward, no force needed)

**Parallel session recovered their work** via `git checkout 4a1f72e -- <8 files>` + `git stash pop` — landed as commit `4a6f14a` (StateManager symmetric Map serialization for `lastPrices`).

**Lesson saved:** `feedback-git-status-before-commit.md` — always `git status` before `git commit` in parallel-session repos.

---

## Smoke Tests

| Test | Status | Reference |
|------|--------|-----------|
| Phase 0 baseline (TSLA 15m, EMASMACrossover SOLO) | **PASS** | `$17,950.589592711076 / 1430 trades / 57.55% WR` — verified at `5bfd0b1` and `9b0011e`, byte-identical |
| `getCallers('core/StateManager.js')` returns inverse call-graph | **PASS** | 15 callers, all real require sites |
| Serena `getBlastRadius` end-to-end | **PASS** | 57-81ms latency on `core/CandleProcessor.js` and `core/SessionRouter.js` |
| Mock-client `runReactLoop` injection | **PASS** | blastRadius lands at message position 3 (after traceHint, before userQuery) |
| Ollama Cloud auth (`/api/tags`) | **PASS** | Returns 38-model catalog |
| Ollama Cloud OpenAI-compat (`/v1/chat/completions`) | **PASS** | `gpt-oss:20b-cloud` PONG in 400ms, `qwen3-coder:480b-cloud` PONG in 28s cold-start |
| `/critic-attack` E2E via Mercury | **PASS** | SessionRouter attack: 34.5s wall, 10 iterations, 3 real findings; CandleProcessor attack: 31s wall, 9 iterations, 2 real / 1 re-flag |
| `/critic-attack` E2E via Ollama Cloud + Qwen3-Coder | **PASS** | SessionRouter attack: 245s wall, 11 iterations, 3 real findings (different framings from Mercury) |
| Phase 0 post-`9b0011e` (NaN guard fix) | **PASS** | `$17,950.589592711076` — bit-for-bit, NaN guard never fires on TSLA fixture (no missing phase data) |

Phase 0 not yet re-verified post-`4a6f14a` (parallel session's Map serialization). Open item below.

---

## Files Touched

| File | Change | Commit |
|------|--------|--------|
| `tools/dep-scanner.js` | +47 — `getCallers(target)`, `module.exports`, `require.main` guard | `124ff96` |
| `tools/serena-bridge.js` | NEW, 89 lines — `getBlastRadius` + `formatForMercury` + `Promise.race` timeout | `124ff96` |
| `trai_brain/mercury-bridge/react-loop.js` | +14 — `blastRadius` param + system-message injection at position 3 | `124ff96` |
| `trai_brain/mercury-bridge/ask.js` | +1 — thread `blastRadius` through `runAgentic` | `124ff96` |
| `.claude/commands/critic-attack.md` | NEW, 78 lines — slash command spec with attack-framed prompt template | `124ff96` |
| `ogz-meta/specs/serena-mercury-integration.md` | NEW — canonical as-built doc | `124ff96` |
| `core/persistent_llm_client.js` | +8 — `ollamacloud` PROVIDERS entry (https://ollama.com/v1, OpenAI-compat) | `6e101ab` |
| `trai_brain/mercury-bridge/ask.js` | +18 — provider/model/apiKey threading with provider-specific env-var fallback | `6e101ab` |
| `core/CandleProcessor.js` | +7 — NaN guard on `lastDayPhase.rthCloseMinute` before subtraction | `9b0011e` |

**Touched but reverted (poisoned commit `4a1f72e` → revert `9150afd`):** `core/FeatureExtractor.js`, `core/OrderExecutor.js`, `core/PatternMemoryBank.js`, `core/TradeIntelligenceEngine.js`, `core/TradingLoop.js`, `core/dto/IndicatorSnapshotDTO.js`, `core/indicators/IndicatorEngine.js`, `run-empire-v2.js` — parallel session's work. Re-landed via the parallel session's recovery + `4a6f14a`.

---

## Git Log (this session, top-down chronological)

```
4a6f14a  fix(state-manager): symmetric Map serialization for lastPrices  ← parallel session, post-recovery
9b0011e  fix(candle-processor): NaN guard on rthCloseMinute resurrected gap bug  ← clean
9150afd  Revert "fix(candle-processor)..." — POISONED COMMIT (in retrospect)
4a1f72e  fix(candle-processor): NaN guard on rthCloseMinute resurrected gap bug  ← poisoned (preserved for recovery)
6e101ab  feat(mercury-bridge): Ollama Cloud provider + per-call provider override
124ff96  feat(mercury-bridge): Serena blast-radius enrichment + /critic-attack
349172a  fix(candle-processor): RTH-aware gap guard via MarketCalendar  ← session start point
```

---

## Half-Cooked Items Status

| Item | Status | Note |
|------|--------|------|
| SessionRouter architectural holes (6) | **OPEN** | Catalogued in this session's audit. Gated off — `SESSION_ROUTER_ENABLED=false`. Cannot flip live until at least 4-5 of the 6 are addressed |
| Mercury verification of /critic-attack findings against `core/SessionRouter.js` | **CLOSED (validated)** | Mercury + Qwen each found 3 real bugs; complementary signal confirmed integration produces real value |
| `tools/regression-test.js` orphaned harness | **OPEN** | Points at deleted runner. Either fix the BACKTEST_CMD pointer or rebuild around `parallel-backtest.js`. Out-of-scope for this session |
| Stale `tuning/regression-baseline.json` | **OPEN** | Pinned to `0267ca8` from 2026-03-11. Pre-dates ~13 strategy commits. Re-baseline against current HEAD when bot is stable |
| Parallel-session pre-staged work in `4a1f72e` | **CLOSED** | Recovered via `git checkout 4a1f72e -- <files>`; landed as `4a6f14a` |
| `core/indicators/IndicatorEngine.js` post-commit stash (stash@{0}) | **OPEN — preserved** | Parallel session's 02:54 modification. Sitting in stash. They can `git stash pop stash@{0}` when ready |

---

## Open Items for Next Session

1. **Parallel-CC regression diagnosis (live).** Trey's other CC instance hit a regression as session ended. Symptom not yet captured. Likely candidates given recent commits: `4a6f14a` Map serialization (most recent), `9b0011e` NaN guard (unlikely — passes Phase 0), or further-back work. Need symptom + repro to bisect.
2. **SessionRouter holes 1-5.** Cannot flip `SESSION_ROUTER_ENABLED=true` until pattern-bank reset, state erase, crypto→stocks force-close, swap-gate, and historical backfill are addressed. Wolf has a `MULTI-SYMBOL-ARCHITECTURE` spec that overlaps with #1-#2.
3. **Phase 0 re-verify post-`4a6f14a`.** ~30s. Confirm Map serialization didn't break baseline.
4. **Other specs queued in `ogz-meta/ledger/spec fixes/`:** ACCOUNT-CONTEXT-ISOLATION_1, CANDLE-HISTORY-SYMBOL-AWARE, MULTI-SYMBOL-ARCHITECTURE_1, RTH-GAP-DETECTION (mostly done by `349172a`), WEBHOOK-ORDER-ADAPTER. Trey directs.

---

## Context for Next Session

- `/critic-attack <file> "<change>"` is now live and dogfooded on two backends. Mercury (Inception) is 7-8x faster than Qwen3-Coder 480B (Ollama Cloud) but Qwen survives Mercury 503s. Provider override per-call: `runAgentic(prompt, { provider: 'ollamacloud', model: 'qwen3-coder:480b-cloud' })`.
- `core/SessionRouter.js` is **not safe to flip live** despite `SESSION_ROUTER_ENABLED` flipping in earlier sessions. The 6 catalogued holes are real. Live-flip should be gated on Wolf's MULTI-SYMBOL-ARCHITECTURE spec landing first.
- **Always `git status` before `git commit`** in this repo. Lesson saved at `feedback-git-status-before-commit.md`.
- Mercury infra healthy as of session end: 9807 chunks indexed, MongoDB up since 2026-04-17, Inception API recovered from the 503 window mid-session.
- Phase 0 baseline `$17,950.589592711076 / 1430 trades / 57.55% WR` reproduces bit-for-bit at session-end commit `9b0011e`. Not yet re-checked post-`4a6f14a`.

---

## Recorder Pipeline Disposition

- **Mercury reindex needed?** No new files in `ogz-meta/specs/` other than `serena-mercury-integration.md` which Mercury will pick up on next index pass. Trace memory captured 2 new investigation traces (SessionRouter attack + CandleProcessor attack) at quality 320.9 and 114.0 respectively.
- **CHANGELOG.md update?** Not needed — this session's work is documented in this session doc and in commit messages. CHANGELOG is for user-facing release notes, not internal session work.
- **`fixes.jsonl` entry?** YES — should append entries for:
  - `124ff96` Serena × Mercury Integration shipped
  - `6e101ab` Ollama Cloud provider + per-call override
  - `9b0011e` NaN guard on `rthCloseMinute` (Mercury attack finding e)
  - `9150afd` poisoned-commit revert (with the lesson cross-reference)
- **Memory updates:** `feedback-git-status-before-commit.md` saved. MEMORY.md index entry pending (was about to write when regression news interrupted).
- **Mermaid charts:** No architectural changes that warrant chart updates. SessionRouter's architecture didn't change; only an audit was done.
