# Session Handoff: Mercury Audit Cycle + No-Deferred Rule Adoption + First Live Alpaca

**Date:** 2026-04-27
**Branch:** `alpaca/stocks-paper-flip`
**Last Commit:** `797331a` — fix(pattern): drop fake 10% floor on Learning Pattern entries
**Phase 0 Baseline:** `$17,551.91169513058 / 1265 trades / 778W / 487L / 61.5% WR / 2.66% MaxDD / 2.67 PF` (unchanged from prior session — no core-trade-logic changes today)
**Major Process Change:** Adopted `feedback-no-deferred` rule — when a problem is known, fix it RIGHT THEN. Severity classification is for ORDER, not skip-vs-fix. LOW means "fix this last in the batch," not "fix this never."
**Major Operational Milestone:** First-ever live trades on Alpaca via SessionRouter — bot transitioned to TRADING RESUMED at ~12:55 PM EDT after parallel CC's `28c070b` unblocked the data stream.

---

## What Was Done This Session

Today ran end-to-end across three intertwined arcs: (1) Mercury audit cycle on the resilience stack from yesterday's handoff (Audits A, B1, C1, plus B2/B3/C2 from earlier landings), (2) the no-deferred rule adoption + CLAUDE.md codification of the session-doc pattern, and (3) parallel CC unblocking Alpaca live trading via the `28c070b` predicate+callback fix. Below is the full audit log organized by theme.

### 1. Mercury Audit Cycle — Adversarial Re-Dispatch of A/B1/C1 (handoff `1491def`)

**Context:** the prior session's handoff at `1491def` listed three audits whose original "verification-flavored" verdicts were suspect. C2 had been re-attacked under adversarial framing the prior day and surfaced 1 CRITICAL + 1 HIGH + 1 MEDIUM bugs the verification version had missed (case-study lesson saved as `feedback-mercury-attack-not-verify`). Same flaw likely affected A, B1, C1.

**Audit A — `foundation/ResilientWebSocket.js`:**
- Adversarial dispatch with 5 attack tasks (silent frame drop, reconnect-loop trap, heartbeat/reconnect race, memory leak, parser crash).
- Triage: 4 of 5 findings classified FALSE POSITIVE under direct code verification (predicate gated by `!isAuthenticated`, infinite-retry by-design with Supervisor escalation, JS single-threaded timer-race claim, JS Number bounds).
- 1 REAL BUG (Task 1A): `maxPayload` only caps SINGLE frame size, not cumulative buffered data. Fixed at commit `0f66df5` (1 MB cap).

**Audit A re-attack on Task 1A fix** (per no-deferred rule):
- Adversarial Mercury found 2 more real bugs in my fix:
  - Breakage 1 (HIGH): fixed-window 2x-rate evasion via boundary-straddling bursts
  - Breakage 2 (MEDIUM): post-terminate frame race (queued frames fire after `ws.terminate()`)
- Fix at commit `292d2eb`: replaced fixed window with token-bucket (continuous refill, no boundary cliff), added `_capTripped` flag to drop stragglers between trigger and `_onClose`. Verified by smoke test: 1000-byte burst at t=0 + 1000-byte burst at t=+1ms now correctly trips the cap (only 1 token refills in 1ms).

**Audit B1 — `core/Supervisor.js`:**
- Adversarial dispatch, 5 findings: HEALTHY-with-failureReason "permanent DEGRADED loop," wall-clock vs monotonic mismatch, register-before-start race, ledger-poisoning attacker, cooldown bypass.
- Triage: I initially classified all 5 as LOW or FALSE POSITIVE under a single-tenant-VPS threat model. Trey's `feedback-no-deferred` directive cracked that open.

**Audit B1 fixes shipped at `a894efc`** (closes Findings 1-5 in one commit):
- pidStartTime via `/proc/[pid]/stat` field 22 — closes PID rollover (Finding 1) and EPERM foreign-uid probes (Finding 2)
- PID range bounds (0 < pid <= PID_MAX) — partial close on Finding 3 (fabricated high-pid)
- HMAC-SHA256 signature on every ledger entry — full close on Finding 3 forgery + Finding 5 torn-write
- Legacy entry rejection with one-time warning — closes Finding 4
- Documented Linux POSIX appendFileSync atomicity for <PIPE_BUF — Finding 5 disposition

**Audit B1 Finding 3 fix at `21efb63` (FIVE rounds of adversarial refinement):**
- Round 1: backdate-lastRedAt approach. Mercury found 4 bugs (immediate-DEAD on `unhealthyHealAttempts=0`, negative timestamps, register-during-poll race, DEGRADED no-fast-path).
- Round 2: replaced backdate with explicit fast-path branch + per-entry `_pollInFlight` mutex. Mercury found 3 bugs (no-downgrade guard too aggressive, mutex-skip silent, repeat).
- Round 3: relaxed downgrade guard, added skip-log. Mercury found 2 bugs (DEGRADED self-report bypassing escalation, log-spam at 3600/hr).
- Round 4: stability gate (firstHealthyAfterRedAt) for sustained-HEALTHY, exponential throttle on skip-log, re-register reuses entry. Mercury found 3 bugs (oscillation attack defeating grace period, log spam at scale, re-register race with stale closure).
- Round 5: 1 real bug + 3 false positives. Real: re-register-during-in-flight-poll race with old def's result landing AFTER re-register. Closed by `_defGeneration` counter — `_pollOneInner` captures generation before getHealth await, discards result if changed.

**Audit B1 Finding 2 fix at `803ccde`:** dual-timestamp ledger (wall-clock for human display, monotonic for same-process timeline reconstruction). HMAC coverage extends to monoMs. Mercury adversarial verification: predicate-cover-array case verified clean by single yes/no question dispatch.

**Audit C1 — Alpaca migration equivalence (commits `f042021` pre vs `a5ee381` post):**
- Adversarial dispatch with 3 attack tasks (subscription-replay order, disconnect race, OHLC frame format). Used new `git_show` Mercury tool (commit `76a9a1b` from prior session) for cross-commit diff.
- Mercury hit max-iterations 3 separate times on this audit (cross-commit diffs are iteration-expensive). After Trey called out the iteration-cap pattern, I switched to direct diff-trace + single yes/no questions.
- **Verdicts:**
  - Task 1 (subscription replay): EQUIVALENT — both versions iterate `this.subscriptions` Map identically with identical payload shape
  - Task 2 (disconnect race): EQUIVALENT — `rws.stop()` is a strict superset of pre-version `clearTimeout + ws.close + null`
  - Task 3 (frame format / auth predicate): WAS REAL BUG, now CLOSED
- **C1 Task 3 fix landed at parallel CC's commit `28c070b`** while my Mercury dispatches were thrashing on iteration caps. The bug: `authSuccessPredicate` only matched single objects, but Alpaca sends auth-success wrapped in a 1-element array `[{T:"success",msg:"authenticated"}]`. Predicate failed → `_fireAuthenticated()` never fired → callbacks never drained.
- **BONUS Bug found by parallel CC at same commit `28c070b`:** `_initialSubscribeCallback` was a single slot, overwritten on each call. SessionRouter loops 7 stockSymbols (TSLA/SPY/QQQ/NVDA/COIN/MARA/RIOT) calling `subscribeToCandles` per-symbol — only RIOT (last) ever subscribed. Now accumulates all callbacks into `_pendingSubscribeCallbacks` array, drains them all in `onAuthenticated`. **This was what blocked live Alpaca trading until parallel CC's fix landed.**

### 2. No-Deferred Rule Adoption (memory + CLAUDE.md)

**Trigger:** Trey's directive at session-mid: *"i dont want deferred to ever be used again in this repo im tired of going back and fixing everything because of it when a problem arises we fix it i dont care the tier or who said what about severity if its a problem and we know about it it gets fixed right then and there not after x or after y goes live right then period."*

**Saved as memory:** `~/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/feedback-no-deferred.md` with index entry in `MEMORY.md`.

**Applied retroactively this session:** the original Audit B1 triage classified 5 findings as LOW/FALSE POSITIVE/operator-config. Under no-deferred, all 5 were re-examined and 4 of them were actually real (the 5th was operator-config). The full HMAC + pidStartTime + bounds + legacy-rejection fix landed at `a894efc` instead of being deferred as "post-Apex polish."

**Self-acknowledged failure mode:** at multiple points during the session I framed work as "overkill for our threat model" or "defer-able LOW." Each time Trey re-asserted no-deferred. Most pointed example: I tiered HMAC-signed ledger entries as "real overkill" at one stage, was corrected, applied HMAC, and HMAC subsequently closed Mercury Finding 3 (fabricated-high-pid bypass) cleanly that the identity-only fix could not.

### 3. CLAUDE.md Codification of Session-Doc Pattern (commit `8dffc81`)

**Why:** the session-doc manifest at `ogz-meta/sessions/SESSION-DOC-MANIFEST.md` (commit `5b687b3` from prior session) was only in MY auto-memory. Parallel CC, Cursor, Desktop, future Claude instances would never see it on bootstrap. Trey corrected: "send the claude md addition fuck dependabitch."

**Insertion point:** between the existing "Document Accuracy Rule" and "Reindex Rule" sections in CLAUDE.md (the natural triad — Document Accuracy + Session Doc Pattern + Reindex are all Mercury-output-quality rules).

**Content:** explicit bootstrap order for new AI sessions (CLAUDE.md → most recent 2-3 session docs → MASTER-ROLLOUT 30-Second Status only → recent-changes top 50 lines → specs as needed). Required sections enumerated. Pointer to manifest + format template.

### 4. SessionRouter Goes LIVE on Alpaca (operational milestone)

**Time:** ~12:55 PM EDT 2026-04-27.
**Commit chain that unblocked it:** `bec08c3` (SessionRouter flag flipped LIVE, prior session) → `deb276e` (boot-crash fix) → `6dea109` (cold-boot active broker pickup) → `28c070b` (auth predicate + callback accumulator).
**Smoke evidence in commit `28c070b`:**
```
[Alpaca] Data stream authenticated (isReconnect=false)
[Alpaca] Draining 7 pending subscribe callback(s)
[Alpaca] First bar RX for TSLA @ 2026-04-27T18:14:00Z OHLCV: 379.39
[Alpaca] First bar RX for SPY @ 2026-04-27T18:14:00Z OHLCV: 714.99
[Alpaca] First bar RX for NVDA @ 2026-04-27T18:14:00Z OHLCV: 215.17
Bot transitioned to TRADING RESUMED after warmup hit 3 candles.
```

This is the first time the entire resilience stack (SessionRouter + ResilientWebSocket + Supervisor + AlpacaAdapter) has been validated end-to-end against a real broker session.

### 5. Iteration-Cap Failure Pattern (self-owned)

**Pattern:** four times this session I dispatched Mercury, hit max-iterations cap, and either retreated to a partial answer or re-dispatched with marginally-different parameters that also hit cap. Each cycle wasted Mercury compute + my time + Trey's time.

| Audit | --max-iterations | Hit cap? | What I did |
|---|---|---|---|
| Adversarial on Fix #1 + #4 combined | 30 | Mercury gave up at 25 with 1/8 tasks answered | Treated 1/8 as result, re-dispatched only Fix #4 tasks. **Tasks 1B, 1C never re-dispatched.** |
| Fix #2 monoMs first | 15 | Yes | Re-dispatched at 30 → clean |
| C1 first | 30 | Yes | Mercury thrashed on grep |
| C1 task 1 split | 20 | Yes | Mercury thrashed on grep |

**Trey's correction:** *"bro break.... up... the.... audit..."* — the dispatch playbook says three failure modes, three distinct fixes; I kept bumping iterations slightly AND splitting prompts slightly, neither decisive. Right move was either a decisive iteration jump (50→200) OR genuine prompt split into single yes/no questions Mercury can answer in 5-10 iterations.

**Applied correction:** the next Mercury dispatch (yes/no on auth predicate) finished in 4 iterations clean. Pattern fix.

**Outstanding work that was missed in this pattern (real gap):** Fix #1 Tasks 1B (broker peak-rate compatibility) and 1C (terminate-vs-`_onClose` race) were never re-dispatched after the combined-prompt cap-out. Fix #1 commit `0f66df5` shipped without those audited.

---

## Smoke Test Results

| Test | Status | Reference |
|------|--------|-----------|
| Phase 0 baseline (BTC 15m, ENABLE_TRAI=false) | PASS (unchanged) | $17,551.91169513058 — no core-trade-logic changed today |
| ResilientWebSocket smoke (instantiation, maxPayload, token-bucket cap-trip + reset on _open) | PASS | Boundary-evasion attack now correctly detected (1000B + 1000B at t=+1ms) |
| Supervisor smoke (HMAC sign+verify+tamper-detect, register-then-poll fast-path, sustained-healthy reset, re-register state preservation, race-discard via _defGeneration, concurrent _pollOne mutex) | PASS | All 9+ scenarios verified |
| Live Alpaca data stream (parallel CC) | PASS | First bars flowing for TSLA/SPY/NVDA/COIN/MARA/RIOT/QQQ at real prices, bot TRADING RESUMED |
| Mercury adversarial verification (yes/no on auth predicate) | PASS in 4 iters | Single specific question converged cleanly |

---

## Files Touched (this session, my edits)

| File | Action |
|------|--------|
| `foundation/ResilientWebSocket.js` | DEFAULTS.maxPayload (1MB), maxBytesPerSecond (10MB/s default), token-bucket _byteWindow, _capTripped flag with reset on _open |
| `core/Supervisor.js` | New helpers _readPidStartTime + _loadOrCreateHmacKey + _signEntry + _verifyEntry; _writeLedger stamps pid+pidStartTime+monoMs+hmac; _replayRestartHistory verifies HMAC + pidStartTime + bounds + rejects legacy; _reconcileState fast-path UNHEALTHY-on-first-red-poll; stability-gate firstHealthyAfterRedAt; per-entry _pollInFlight mutex with exponential-throttle log; _defGeneration race-discard; register reuses existing entry |
| `CLAUDE.md` | Session Doc Pattern section between Document Accuracy Rule and Reindex Rule |
| `~/.claude/.../memory/feedback-no-deferred.md` | NEW memory file |
| `~/.claude/.../memory/MEMORY.md` | Index entry for feedback-no-deferred |

---

## Git Log (commits in this session window, my work + parallel CC)

```
797331a fix(pattern): drop fake 10% floor on Learning Pattern entries (parallel CC)
803ccde fix(supervisor): dual-timestamp ledger entries (Audit B1 Finding 2)
21efb63 fix(supervisor): register-before-start fast-path + 5 audit-cycle hardenings
25b4591 feat(historical): session-aware backfill on cold-boot (parallel CC)
292d2eb fix(rws): token-bucket byte-rate cap + post-terminate straggler guard
a894efc fix(supervisor): full identity + HMAC-signed ledger entries (Audit B1 Findings 1-5)
5eceea6 fix(state): persist closedTrades on close — win rate stuck at 0% (parallel CC)
53c7a82 fix(dashboard): strategy battleground shows ALL configured strategies (parallel CC)
cfda655 fix(dashboard): round 2 phase 2 (parallel CC)
d8f8ce3 fix(dashboard): wire bot_thinking confidence (parallel CC)
a2fc66c fix(dashboard): round 2 phase 1 — kill multi-symbol bleed (parallel CC)
0f66df5 fix(rws): bound incoming frame size with maxPayload cap
06ec17c fix(dashboard): round 3 — indicators bar uncramped (parallel CC)
8390a03 fix(dashboard): round 2 — Risk Gauge + Size Preview (parallel CC)
36cb748 fix(dashboard): round 1 — IP cleanup + Trade Log P&L (parallel CC)
6dea109 fix(swap-resilience): cold-boot active broker pickup (parallel CC)
28c070b fix(alpaca): unblock data stream — predicate handles arrays + callbacks accumulate (parallel CC, UNBLOCKED LIVE)
1ff4023 fix(swap-resilience): clear candle-history.json on cold-boot (parallel CC)
2c1b694 fix(swap-resilience): watchdog backfill uses canonical IBroker.getCandles (parallel CC)
8ba9c17 fix(dashboard): confidence label disambig + unit-bug (parallel CC)
9e6dd77 fix(dashboard): Risk Gauge position + resetSession typo (parallel CC)
3436dde docs(handoff): comprehensive dashboard deepsearch prompt (parallel CC)
af807a4 fix(dashboard): lock header status cluster to right edge (parallel CC)
836952b fix(dashboard): asset-tf-card tracks LIVE active symbol (parallel CC)
1491def docs(handoff): brief other-CC for adversarial re-dispatch of audits A/B1/C1
baea97c fix(alpaca): C2 audit — details.ws never null + disconnect-race defense
8dffc81 docs(claude): add Session Doc Pattern rule (CRITICAL — adopted 2026-04-27)
```

(Prior to this window: see `session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md` for asset-isolation/strategy-parity/bot-swap-resilience arc.)

---

## Half-Cooked Items Status

| Item | Status | Disposition |
|------|--------|-------------|
| Audit A (ResilientWebSocket adversarial) — Task 1A maxPayload | CLOSED | `0f66df5` |
| Audit A re-attack — Breakage 1 boundary-evasion | CLOSED | `292d2eb` (token-bucket) |
| Audit A re-attack — Breakage 2 post-terminate race | CLOSED | `292d2eb` (`_capTripped`) |
| Audit A — Task 1B (broker peak-rate compat) | **STILL OPEN** | Mercury cap-out, never re-dispatched after splitting prompt failed |
| Audit A — Task 1C (terminate-vs-_onClose race) | **STILL OPEN** | Same Mercury cap-out |
| Audit B1 — original 5 findings | CLOSED | `a894efc` (HMAC + pidStartTime + bounds + legacy rejection) |
| Audit B1 Finding 3 — register-before-start | CLOSED | `21efb63` (5 rounds of refinement) |
| Audit B1 Finding 2 — dual-timestamp | CLOSED | `803ccde` |
| Audit B2 — restart history persistence (prior session) | CLOSED | `df344f5` (prior session) |
| Audit B3 — review by-design | CLOSED | `91be425` (prior session) |
| Audit C1 — Task 1 (subscription replay) | EQUIVALENT | direct diff trace |
| Audit C1 — Task 2 (disconnect race) | EQUIVALENT | direct diff trace |
| Audit C1 — Task 3 (auth predicate arrays) | CLOSED | `28c070b` (parallel CC) |
| Audit C1 — Bonus (callback overwriting) | CLOSED | `28c070b` (parallel CC) |
| Audit C2 — Alpaca details.ws crash | CLOSED | `baea97c` (prior session) |
| Audit D — supervisor-daemon (PM2 entry) | **NOT YET DISPATCHED** | Initial audit needed |
| Stale-doc triage (12 unambiguously-stale ogz-meta/*.md) | OPEN, awaiting Trey approval | Inventory + proposal complete; move-to-ogz-ledger/superseded/ pending |
| Frontmatter status flag standard for indexed docs | OPEN | Phase B work, deferred (lower-case d — design proposal phase, not implementation deferral) |

---

## Open Items for Next Session (Ranked)

1. **Fix #1 Tasks 1B + 1C re-dispatch (PRIORITY)** — broker peak-rate compatibility check (10 MB/s default appropriate?) and terminate-vs-_onClose race verification. Per the no-deferred rule, these were missed when the combined Mercury prompt hit iteration cap. Cleanest dispatch: two separate single-task prompts, --max-iterations=20-30 each, focused yes/no framing.
2. **Audit D — supervisor-daemon initial dispatch** — `scripts/ogz-supervisor.js` PM2 entry point has never been adversarially audited. Per the handoff doc rule, no `ogz-supervisor` restart until ALL of A, B1, B2, B3, C1, C2, **D** are SHIP IT under adversarial framing. D blocks the restart.
3. **Stale-doc triage execution** — proposal was made earlier (move 12 stale top-level `ogz-meta/*.md` to `ogz-ledger/superseded/`). Trey hadn't given OK before the session pivoted to audit work. Awaits decision.
4. **Frontmatter status flag standard** — design proposal exists, implementation in indexer + CLAUDE.md addition still pending.

---

## Context for Next Session

- **Bot is LIVE on Alpaca paper as of ~12:55 PM EDT today.** First-ever real broker session via SessionRouter. Smoke evidence in `28c070b` commit message.
- **No-deferred rule is now in CLAUDE.md** (commit `8dffc81`) — every Claude instance reading the codebase sees it on bootstrap, not just my auto-memory.
- **Mercury audit cycle proved its worth** — 9+ real bugs across A, B1, C1, C2 closed this session, including the live-blocking auth-predicate + callback-accumulator bugs that parallel CC found.
- **Mercury reindex was running at session-end** (parallel CC) — next session's first dispatch should verify the index is current via a quick query.
- **Phase 0 baseline unchanged** — no core-trade-logic touched today. Audit work was all on the resilience-and-supervision stack which doesn't affect strategy or execution math.
- **Iteration-cap failure pattern is now a known anti-pattern** — sessional discipline: single specific yes/no questions for Mercury, not 3-task open-ended adversarial sweeps. The dispatch playbook's "split prompt" mode is the right answer when a single dispatch hits cap.

---

## Recorder Pipeline Disposition

Following the spirit of `/recorder` per `.claude/commands/recorder.md`:

- **CHANGELOG.md update:** N/A this session — covered by individual commit messages and recent-changes (next item).
- **fixes.jsonl:** Does not exist in this repo (recorder skill's reference is aspirational). Audit findings + closures captured ABOVE in this session doc instead — the durable record.
- **RAG reindex:** In progress at session-end (parallel CC running it). Next session's first Mercury dispatch verifies.
- **Context docs (Scribe step):** This session doc IS the canonical record per the SESSION-DOC-MANIFEST. `recent-changes.md` will receive a one-paragraph composite entry pointing to this doc.
- **Git commit:** All audit-cycle work is already committed in the listed SHAs. This session doc commits separately when written.
