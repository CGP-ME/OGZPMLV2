# Session 2026-06-24 - Clean Tree And Exit Audit Handoff

**Date:** 2026-06-24
**Branch:** `codex/multi-asset-symbol-state`
**Last pushed commit at handoff:** `06ee41ea Fixed TTP eval config visibility`
**Runtime status:** Not re-verified in this cleanup slice. No PM2 restart was performed in this slice.
**Tracked worktree status at cleanup checkpoint:** clean after the config commit and proof-data revert.
**Untracked status:** large preserved intake/generated pile remains. Do not delete blindly.

---

## Executive State

This session was a cleanup and handoff stabilization pass after multiple overlapping eval, dashboard, Mercury, MPM, and proof-data threads made the repo hard to reason about.

The tracked tree was reduced back to a clean state. One verified config/test fix was committed and pushed. A generated public proof-data update was intentionally not committed because it currently mislabels a partial exit as a full close, which would violate the proof-page honesty rule.

The next agent should not restart by guessing. Start from this doc, then inspect current `git status`, PM2/runtime posture, the latest live journals, and the exact files named below.

---

## What Landed

### 1. TTP eval config visibility

**Commit:** `06ee41ea Fixed TTP eval config visibility`

**Files:**

| File | Action |
|---|---|
| `core/TradingConfig.js` | Added `BASE_CONFIG.evalRules.ttp.accountLimits` and `BASE_CONFIG.evalRules.ttp.consistency` env-backed values. |
| `test/trading-config-profile.test.js` | Added regression coverage proving TTP eval sizing values read from env without requiring tuning profile overrides. |

**Why it mattered:**

The TTP 5k MAX eval sizing/rule numbers must live in config paths that runtime code can read. `OrderExecutor` already reads `evalRules.ttp.*` for share cap calculations, but `TradingConfig` did not expose the base env-owned values unless a profile override filled them.

**Values exposed:**

- `TTP_DAILY_LOSS_LIMIT_DOLLARS`
- `TTP_MAX_LOSS_THRESHOLD_EQUITY`
- `TTP_PROFIT_TARGET_DOLLARS`
- `TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO`
- `TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO`

**Important scope boundary:**

This was config visibility only. It did not add another runtime shutdown guard and did not change live PM2 env.

**Verification run:**

- `git diff --check` passed before commit.
- `npx jest test/trading-config-profile.test.js --runInBand` passed, 21/21.
- Mercury was dispatched once with `Mercury, break my fix.` against the dirty config diff. It did not return a concrete break. Its cited evidence covered:
  - `core/TradingConfig.js:1187-1199`
  - `core/TradingConfig.js:19-23`
  - `core/TradingConfig.js:119-124`
  - `core/TradingConfig.js:1559-1562`
  - `core/TradingConfig.js:1687-1704`
  - `core/TradingConfig.js:1833-1835`

---

## What Was Reverted Or Held

### 1. Price-freshness patch was reverted before commit

There was an in-progress patch touching:

- `core/StateManager.js`
- `core/TradingLoop.js`
- `run-empire-v2.js`
- `test/single-broker-subscription-symbols.test.js`
- `test/state-manager-load.test.js`
- `test/trading-loop-trace-spine.test.js`
- `CHANGELOG.md`

It attempted to add protective exit price freshness and event-time handling. Trey correctly objected that the slice had drifted into an edge-case patch while the bot was bleeding from broader exit-path issues.

**Disposition:** fully reverted with `git restore` before this handoff. Nothing from that patch remains in tracked dirty state.

### 2. Public proof track-record update was not committed

Dirty generated files were:

- `public/proof/track-record/data/accounts/MAX58356.json`
- `public/proof/track-record/data/index.json`

They reflected live eval data advancing from 18 to 26 recorded exits, but the generated account JSON represented order `43609501` incorrectly:

- Source journal: `data/journal/4-live__6-alpaca__36-1fe7237b-e197-48a5-b0cd-7ee9f0cb1dbe__6-stocks__4-NVDA__3-15m/trade-ledger.jsonl`
- Actual sequence:
  - ENTRY `43609501`, NVDA short, entry `200.91`, original notional `401.82`.
  - EXIT partial, `exitFraction: 0.5`, `partialExit: true`, `exitReason: be_scaleout`, exit price `199.67`.
  - EXIT full remaining close, `exitFraction: 1`, `partialExit: false`, `exitReason: flip_position`, exit price `198.585`.

Generated proof JSON instead marked the BE scale-out row as:

- `leg_type: "full_close"`
- `partial_fraction: null`
- `exit_reason: "be_scaleout"`

That is not acceptable public proof data. The proof page must not lie about partial/full close semantics.

**Disposition:** reverted the tracked proof JSON files back to HEAD. Raw journals remain on disk for regeneration and forensic work.

---

## Current Dirty State

### Tracked files

At the cleanup checkpoint after commit and proof-data revert:

```text
git status --short --branch --untracked-files=no
## codex/multi-asset-symbol-state...origin/codex/multi-asset-symbol-state
```

No tracked dirty files remained at that point.

### Untracked files

There are approximately 1,722 untracked files. Do not broad-delete. They are mostly intake or generated runtime evidence.

Classes observed by read-only subagent audit:

| Class | Representative paths | Disposition |
|---|---|---|
| Runtime journals | `data/journal/**/trade-ledger.jsonl`, `equity-snapshots.jsonl`, `replays/*.json` | Preserve. Do not delete live/eval journals without extraction. |
| Runtime audit | `data/runtime-audit/*.jsonl` | Preserve until curated or ignored by policy. |
| Cognition/Mercury artifacts | `ogz-meta/cognition-history/mercury/**`, `mercury-attacks/**`, `live-eval/*.jsonl`, `p0-drift/**` | Preserve. Some should be curated into durable summaries. |
| Ledger intake | `ogz-meta/ledger/*.md`, `ogz-meta/ledger/frontend/**`, `ogz-meta/ledger/possiblearchitecture/**` | Intake only, not canonical. Read on demand. |
| Frontend intake | `ogz-meta/cognition-history/frontend-intake/2026-06-20-ogzprime-design-system*/**` | Do not commit wholesale. Curate selected assets only if adopted. |
| Proof artifacts | `public/proof/track-record/data/accounts/default.json`, `ogz-meta/review-artifacts/**` | Do not stage by default. |
| Source-like intake | `ogz-meta/ledger/DonchianBreakout.js`, `RSI2MeanReversion.js`, `TimeSeriesMomentum.js`, `NoWickImbalance.js` | Intake candidates only. Do not treat as active runtime code until curated. |

Recommended future cleanup is a narrow `.gitignore` / curation pass, not a delete pass.

---

## P0 Anchor Drift Record

The P0 anchor did change multiple times recently. Do not claim otherwise.

| Time UTC | Source | Anchor | Classification |
|---|---|---|---|
| 2026-06-17 to 2026-06-22 21:28 | phase0 logs/current gate before MPM fixes | `10710.667785934895 / 1692 / 62.8 / PF 1.15` | Stable starting anchor for this window. |
| 2026-06-18 18:52 | local report only | `11211.475902291051 / 1692 / 62.8 / PF 1.14` | Output-only anomaly; no matching gate/docs commit found. |
| 2026-06-22 22:48 | `dee11e54 Fixed MaxProfitManager breakeven scale-out stop ownership` | `10922.160206213319 / 1598 / 66.0 / PF 1.20` | Executable gate changed. |
| 2026-06-23 01:22 | `d21074d Fixed MaxProfitManager tier runner rebalance` | `10663.30975684895 / 1596 / 70.1 / PF 1.16` | Executable gate changed. |
| 2026-06-23 03:42 | `50b6e689 Fixed backtest ledger conservation accounting` | `10663.641411727374 / 1596 / 70.1 / PF 1.16` | Final balance changed only. |
| 2026-06-24 01:04 | `a2dccb85 Fixed eval live posture shutdown drift` | `10663.641411727374 / 1596 / 70.1 / PF 1.16` | Docs/alignment only; no executable gate change. |

**Current caution:**

P0 is still useful as a regression gate, but the last several days prove the anchor is not emotionally or procedurally stable. Any future anchor movement must stop and root-cause before continuing.

---

## Current Exit/MPM Audit Findings

These were read-only reconciliations against current code and current live evidence. Treat the ledger/audit docs as leads only; verify current code before edits.

### Ranked next fixes

#### 1. Exit price truth is not canonical across exit paths

**Evidence from code:**

- `core/TradingLoop.js:495`
- `core/TradingLoop.js:648`
- `core/TradingLoop.js:840`
- `core/TradingLoop.js:883`

`_checkExitsOnly()` uses symbol-scoped `symCtx.marketData` when available, but `_analyze()` still takes `price` from global `this.ctx.marketData` while using symbol-scoped history. That price feeds ECM and MPM exit checks.

**June 24 match:**

Strongest match. The live autopsy documented stop exits at `-2.092%`, `-1.593%`, `-1.265%`, and `-0.703%` against a tighter configured stop profile.

**Next slice:**

Make exit price source canonical, symbol-scoped, and fresh for both `_checkExitsOnly()` and `_analyze()`. Add provenance logging. Fail closed only when price truth is missing or stale for that symbol, not because an unrelated subsystem is unhappy.

#### 2. Stock webhook exits can be blocked by fractional share quantities

**Evidence from code:**

- `core/OrderExecutor.js:186`
- `core/OrderExecutor.js:232`
- `core/OrderExecutor.js:305`
- `core/OrderExecutor.js:950`

Alpaca is treated as fractional-capable in one path, but webhook stock path rejects non-integer quantities. Exit planning can produce `remainingOrderQuantity * exitFraction`, such as `13.5` shares.

**June 24 match:**

Direct match. `2026-06-24-entry-halted-trade-log-window.txt:3130` logged MARA BE scale-out planned `13.5` shares and was blocked before execution/state side effects.

**Next slice:**

Normalize stock webhook exit quantities by the broker/execution route truth. Protective exits must not be blocked by a fractional share artifact.

#### 3. Long full-close accounting can use global net position as notional

**Evidence from code:**

- `core/OrderExecutor.js:2337`
- `core/OrderExecutor.js:2418`
- `core/OrderExecutor.js:2461`

The SELL path reads `stateManager.getState().position` and later uses it as `usdAmount` for close proof/fee logging. In multi-position or mixed long/short state, that can be negative or unrelated to the actual trade being closed.

**June 24 match:**

Direct match. Live log showed `FEE_MODEL notionalUsd must be non-negative; got -472.3849999999999`.

**Next slice:**

Replace global-position notional with trade-scoped/executed close notional. Do not infer close value from global net account state.

#### 4. MPM mutates partial-exit state before broker/state confirmation

**Evidence from code:**

- `core/MaxProfitManager.js:598`
- `core/MaxProfitManager.js:664`
- `core/MaxProfitManager.js:932`
- `core/TradingLoop.js:594`

BE scale-out and tier exits mutate MPM state before execution confirmation.

**June 24 match:**

Confirmed as an active corruption risk by the blocked MARA partial-exit case. Not the strongest explanation for the hard-stop bleed.

**Next slice:**

Convert MPM partial exits to intent-only semantics, or quarantine MPM before rewrite. State mutation must happen only after confirmed fill facts.

#### 5. Short-side MPM cleanup is missing on confirmed COVER

**Evidence from code:**

- `core/OrderExecutor.js:2089`
- `core/OrderExecutor.js:2723`
- `core/OrderExecutor.js:3191`

Short MPMs are created on `SELL_SHORT`; long MPM cleanup exists after non-partial SELL; equivalent COVER cleanup was not found.

**June 24 match:**

Partial. The day was short-heavy, but this is a lifecycle/stale-state risk rather than the primary stop-loss bleed.

**Next slice:**

Add short-side MPM cleanup after confirmed full COVER, then add a per-trade pending-exit guard so duplicate exit intents cannot overlap.

---

## Proof Page / Dashboard Integrity Notes

The public proof page is the sales/testimonial evidence wall. It must show true eval execution evidence without leaking strategy sauce or lying about execution semantics.

Current important facts:

- The proof-data writer/renderer needs a fix before the June 24 data update should be recommitted.
- The raw journals preserve the June 24 trade truth.
- The proof JSON currently cannot be trusted for partial/full-close semantics until the writer maps `partialExit`, `exitFraction`, and leg type correctly.
- Do not publish `MAX58356.json` with `be_scaleout` marked as `full_close`.

Suggested proof-data fix:

1. Find the writer that generated `public/proof/track-record/data/accounts/MAX58356.json`.
2. Prove it reads from `trade-ledger.jsonl` or the runtime proof logger source.
3. Make leg type derive from actual `partialExit` / `exitFraction` truth.
4. Add a focused fixture with one entry, one 50% `be_scaleout` partial, and one remaining full `flip_position` close for the same order ID.
5. Regenerate proof JSON and verify:
   - `be_scaleout` row is partial.
   - `partial_fraction` is `0.5`.
   - final close row remains full.
   - summary partial/full counts match rows.

---

## Mercury State Notes

Mercury was used successfully for the config slice after recent instability. The accepted prompt frame was the visible minimal frame:

```text
Mercury, break my fix.
```

Do not add hidden prompt steering or narrow file-only blinders back in without explicit approval. Trey has repeatedly rejected constraints that prevent Mercury from using its full repo/RAG/code context.

If Mercury is used on the next hot-path slice:

- One question at a time.
- Let it attack the whole failure class.
- Require code/file evidence.
- If it returns a false positive, verify the cited code before blaming Mercury.

---

## What Not To Do Next

- Do not rewrite all of MPM before proving whether the June 24 stop blowout is price-source truth, webhook fractional blocking, global notional accounting, MPM mutation, or a combination.
- Do not commit generated proof JSON that mislabels partial exits.
- Do not delete untracked journals, ledger intake, Mercury outputs, or frontend dumps to make `git status` look pretty.
- Do not restart PM2 or flip eval state without explicit current approval and fresh env verification.
- Do not treat old ledger audits as current truth without checking live code.
- Do not claim P0 anchor stability from memory.

---

## Recommended Next Session Startup

1. Run:

```bash
pwd
git branch --show-current
git status --short --branch
git log --oneline -8
```

2. Read this session doc first.
3. Verify whether runtime is intended to be live, paper, halted, or flat before touching PM2.
4. Pick one atomic fix from the ranked list above.
5. For trading-path code:
   - read exact files,
   - write focused test,
   - run focused test,
   - run Mercury adversarially,
   - run P0 if the path affects backtest/trading semantics,
   - commit and push as a paired step after approval.

---

## Open Items For Next Session

| Rank | Item | Reason |
|---:|---|---|
| 1 | June 24 forensic replay fixture | Prove the event chain before rewriting around assumptions. |
| 2 | Canonical execution truth boundary | Accepted webhook/order is not a fill; define broker fill truth before planner rewrite. |
| 3 | Canonical symbol-scoped fresh exit price truth | Strongest match for June 24 stop-loss overrun, and must feed both analysis and exit-only paths. |
| 4 | Fractional stock webhook exit blocking | Directly logged blocked MARA BE scale-out. Protective exits cannot be blocked this way. |
| 5 | Trade-scoped close notional in OrderExecutor | Directly logged negative notional in fee model. |
| 6 | Proof-page partial/full leg truth | Public proof data currently mislabels BE scale-out leg. |
| 7 | MPM intent-only partial-exit mutation | Prevents state from believing unconfirmed execution happened. |
| 8 | Short-side MPM cleanup on COVER | Prevents stale MPM lifecycle state. |
| 9 | Untracked artifact policy pass | Add narrow ignores or curation only after agreeing backup/forensic policy. |
| 10 | P0 drift documentation/adjudication | Make current anchor history explicit so future agents stop arguing from stale anchors. |

---

## Addendum - GPT Stance Change Uploaded After Initial Handoff

**Ledger intake file:** `ogz-meta/ledger/gptresponsetofollowupofmpmauditv2.md`
**Uploaded/read:** 2026-06-24 22:27 UTC intake pass
**Status:** Intake lead, not canonical by itself. Current code still needs line-by-line verification before implementation.

GPT's updated stance aligns with the broad direction of the DeepSearch/Opus exit rewrite but changes the recommended first brick:

```text
Broker fill truth first.
ExecutionFill -> StateManager.applyFill() -> CanonicalTradeEvent -> subscribers.
ProfitExitPlanner comes after the fill truth boundary is deterministic.
```

The key corrected principle:

- `webhookResult.sent === true` or broker order accepted is not execution truth.
- The system should not mutate StateManager, proof, journal, dashboard, pattern memory, or MPM/private exit state as if a fill happened until an actual broker fill or reconciliation fact exists.

This sharpens, rather than replaces, the earlier ranked list:

1. Build the June 24 forensic replay fixture first, without runtime behavior change.
2. Define the canonical fill/event contract before rewriting planner behavior:
   - `OrderEvent` for submitted/accepted/rejected/canceled.
   - `ExecutionFill` for partial/full/reconciled fill facts.
   - `CanonicalTradeEvent` after StateManager applies the fill.
3. Then fix canonical symbol price provenance across `_checkExitsOnly()` and `_analyze()`.
4. Then make EMA semantics explicit as product policy, not as a hidden strategy rename:
   - `fresh_crossover_only`
   - `alignment_continuation`
5. Then quarantine MPM/full-exit-only mode or implement the new coordinator, depending on operator tolerance for eval downtime.

Rejected or downgraded from the intake:

- Do not treat EMA alignment as a universally proven code bug. Current code/tests intentionally allow alignment continuation. The bug is ambiguity in live eval policy if that was not intended.
- Do not treat `DynamicTrailingStop` env cleanup as the current June 24 blocker. It is a rewrite prerequisite, but current ECM does not use the active trailing check path as the primary exit path.
- Do not land unused `applyFill()` scaffolding and call the system safer. It matters only when OrderExecutor and broker reconciliation actually route fill facts through it.
- Do not release pending exits on a wall-clock timeout alone. A live broker order may still be active.
- Do not add a configurable exit-price-source switch. Price truth should be a single canonical symbol-scoped algorithm with provenance and freshness validation.

Updated next-agent interpretation:

The immediate problem is not simply "delete MPM." MPM is the worst visible symptom of a larger truth-ownership disease. The replacement architecture should be organized around one broker-fill truth boundary and one post-fill canonical trade event. MPM removal becomes safer after no subsystem is allowed to invent remaining quantity, realized PnL, fees, or fill status on its own.

---

## Git Log For This Cleanup Slice

Newest first at handoff:

```text
06ee41ea Fixed TTP eval config visibility
7cea77d3 Fixed dashboard token prompt regression
f316d359 Fixed dashboard websocket cache bust
9446ad17 Fixed dashboard auth gate blocking shell
de16f7c3 Fixed dashboard operator token persistence
52c24511 Fixed live report trace vocabulary
b5be3e0a Fixed TTP share range without hidden veto
a1cdda68 Fixed TTP stock share range sizing
```

---

## Verification Summary

| Check | Result |
|---|---|
| `git diff --check` before config commit | PASS |
| `npx jest test/trading-config-profile.test.js --runInBand` | PASS, 21/21 |
| JSON parse of dirty proof files before revert | PASS |
| Proof-data semantic check | FAIL/HOLD: BE scale-out leg represented as `full_close` |
| Mercury config attack | No concrete break returned |
| PM2/runtime restart | Not run |
| P0 after config commit | Not run; config visibility only, no executable backtest path change expected |

---

## Handoff Bottom Line

The repo tracked tree was cleaned. The only code change landed in this cleanup pass was a config visibility fix for TTP eval sizing/rule values, with focused test coverage and a push. The public proof-data update was rejected because it currently mislabels a partial exit as a full close. The next real production fix should start with canonical symbol-scoped exit price truth, not an MPM rewrite first, because that is the strongest current-code match to the June 24 stop-loss blowout.
