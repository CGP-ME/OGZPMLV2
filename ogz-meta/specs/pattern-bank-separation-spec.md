# Pattern Bank Separation Spec

**Date:** 2026-04-22
**Status:** SPEC — Phase 1 code fix ready to apply, Phase 2-3 pending SessionRouter
**Driver:** Pattern bank corruption incident on 2026-04-22 when bot flipped from Kraken BTC/USD paper to Alpaca TSLA paper. `UnifiedPatternMemory` keyed its storage path by MODE only (`paper`), not asset — so 69,052 crypto patterns had 35 min of TSLA outcomes blended into their win-rates before the corruption was caught.

---

## Why this exists

Trey's directive on 2026-04-22 verbatim:

> "make sure the live pattern bank for crypto and the paper pattern for crypto and the premium ones harvested from backtests are all separated make sure they are wired into when the bot flips between markets if it does that yet if not write it down so that it gets done make sure this cant happen again"

Prior history: Trey had previously raised the need for separate pattern banks. That directive was not implemented. On 2026-04-22 the bot got flipped to stocks and the crypto pattern bank was corrupted before anyone noticed. This spec is the durable record so the implementation cannot slip again.

---

## Required taxonomy

Pattern banks are separated along two dimensions:

1. **Mode** — backtest, paper, live. Never share across these. A backtest's hallucinated outcomes must never touch live pattern win-rates.
2. **Asset** — per ticker OR per asset-class-session. Never share crypto signatures with stock signatures.

Plus one special "promotion" bank:

3. **Premium** — patterns harvested and validated from backtests. Read-only during live/paper runs. Supplements the live bank without being mutated by live outcomes.

### File path contract

```
data/unified-patterns.{mode}.{asset}.json       # primary bank, read+write by bot
data/unified-patterns.premium.{asset}.json      # read-only curated bank, asset-specific
data/unified-patterns.premium.all.json          # read-only asset-agnostic curated bank (optional)
```

Examples:

| Mode | Asset | Path |
|---|---|---|
| Live crypto BTC | live | BTC-USD | `data/unified-patterns.live.BTC-USD.json` |
| Live stock TSLA | live | TSLA | `data/unified-patterns.live.TSLA.json` |
| Paper crypto ETH | paper | ETH-USD | `data/unified-patterns.paper.ETH-USD.json` |
| Paper stock TSLA | paper | TSLA | `data/unified-patterns.paper.TSLA.json` |
| Backtest TSLA | backtest | TSLA | `data/unified-patterns.backtest.TSLA.json` |
| Premium TSLA (curated from backtests) | premium | TSLA | `data/unified-patterns.premium.TSLA.json` |

**Symbol normalization:** `/` in crypto pairs (`BTC/USD`) replaced with `-` for filesystem safety (`BTC-USD`).

---

## Phase 1 — UnifiedPatternMemory asset-aware path (READY TO APPLY)

**File:** `core/UnifiedPatternMemory.js:147-151`

**Change:** Include asset in the storage path. Source asset from `process.env.TRADING_PAIR`, normalizing `/` to `-`.

**Diff:**
```javascript
// Before:
const mode = process.env.BACKTEST_MODE === 'true' ? 'backtest' :
             process.env.PAPER_TRADING === 'true' ? 'paper' : 'live';
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
this.storagePath = config.storagePath || path.join(dataDir, `unified-patterns.${mode}.json`);

// After:
const mode = process.env.BACKTEST_MODE === 'true' ? 'backtest' :
             process.env.PAPER_TRADING === 'true' ? 'paper' : 'live';
const asset = (process.env.TRADING_PAIR || 'default').replace(/\//g, '-');
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
this.storagePath = config.storagePath || path.join(dataDir, `unified-patterns.${mode}.${asset}.json`);
```

**Effect:** Existing `unified-patterns.paper.json` is abandoned (already deleted). New bot runs create `unified-patterns.paper.{asset}.json` fresh. Each asset keeps its own bank, cannot cross-contaminate.

**Risk:** None to active trades (the storage path is pure reporting layer). Risk to historical pattern learning: already zeroed out by the incident — starting fresh either way.

---

## Phase 2 — Premium bank companion (PENDING)

Load a read-only "premium" pattern set alongside the primary bank at init. Premium patterns augment confidence scoring but are never mutated by live outcomes.

**File:** `core/UnifiedPatternMemory.js:167-178` (around the existing `this._load()` call)

**Proposed behavior:**
1. At init, after loading the primary bank, attempt to load `data/unified-patterns.premium.{asset}.json` (asset-specific) or `data/unified-patterns.premium.all.json` (generic).
2. Store premium patterns in a separate in-memory map: `this.premiumPatterns`.
3. At confidence-scoring time, consult premium patterns first as high-priority signals; fall back to primary bank for common signatures.
4. The auto-save timer (line 173) writes ONLY the primary bank, never touches premium.

**Source of premium patterns:** backtest pattern harvester writes to the premium path on explicit promotion (e.g., `tools/harvest-pattern-pack.js --promote-to-premium`). Never auto-generated from live outcomes.

**Gate:** Design review + integration test with a seeded premium file.

---

## Phase 3 — Session-flip wire (PENDING SessionRouter)

Per `ogz-meta/ledger/SESSION-ROUTER-SPEC.md`, the bot will one day have a SessionRouter that automatically switches brokers at market open/close. When that lands, pattern memory MUST reset alongside the broker change.

**Required integration in SessionRouter.executeTransition:**
1. On `session:transition` event (`stocks` → `crypto` or vice versa):
   a. Call `patternMemory.save()` on the outgoing session's bank to flush pending state.
   b. Construct the new bank path for the incoming asset (using the new session's asset).
   c. Either (Option A) swap `this.storagePath` in place on the existing UnifiedPatternMemory instance and call `._load()` again, OR (Option B) hot-swap the UnifiedPatternMemory instance entirely. Option A is simpler; Option B is cleaner.
2. Premium bank reload similarly — the asset changed, so the premium file changed.

**Until SessionRouter ships:** This integration is a one-time code ask when SessionRouter's PR is drafted. Note included in `ogz-meta/ledger/SESSION-ROUTER-SPEC.md` followup.

---

## Phase 4 — Backup safeguards (PENDING)

Pattern banks are gitignored. Without backups, a bug like 2026-04-22 has no recovery path.

**Proposed:**
1. **Pre-modify backup:** Before `UnifiedPatternMemory._load()` writes the file, create `data/backups/unified-patterns.{mode}.{asset}.{timestamp}.json.gz` of the prior state.
2. **Retention:** Keep last 24 hourly + last 7 daily + last 4 weekly backups. Auto-prune older.
3. **Before mode/asset transition:** Force a final backup before the active path changes (catches the exact case that broke on 2026-04-22).
4. **Backup dir in .gitignore:** gzipped backups, not committed.

Implementation: ~60 lines in UnifiedPatternMemory + a cron or internal timer for pruning.

---

## Non-goals

- Cross-asset pattern TRANSFER (e.g., "are these BTC signatures useful for NVDA?"). Premium harvesting is the path for that, not runtime bleed.
- Merging contaminated historical data. Once a bank is mixed (like the lost 2026-04-22 file), it's dead. Forensics not worth the effort.

---

## Execution order

1. **Phase 1** — apply the UnifiedPatternMemory path fix (code change, ready for approval)
2. **Phase 4** — backup safeguards (before any pattern bank is allowed to accumulate real value again)
3. **Phase 2** — premium companion bank (once there are backtest-harvested patterns worth treating specially)
4. **Phase 3** — SessionRouter integration (when SessionRouter is drafted; must be in the same PR)

---

## Status

| Phase | State |
|---|---|
| 1 (asset-aware path) | Diff written, awaiting Trey's approval to apply |
| 2 (premium companion) | Spec'd, not implemented |
| 3 (SessionRouter wire) | Spec'd, awaiting SessionRouter |
| 4 (backups) | Spec'd, not implemented |

---

## Enforcement

- Memory entry: `/home/linuxuser/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/architecture-asset-bank-isolation.md` (permanent, never delete)
- This doc: canonical spec for the fix
- Any session touching UnifiedPatternMemory or adding a new persistent-state subsystem MUST re-check this spec first
