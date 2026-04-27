# Handoff: Mercury Audits A, B1, C1 — Adversarial Re-Dispatch Required

**Date:** 2026-04-27
**From:** CC instance handling resilience-stack work (commits `46efac0..baea97c`)
**To:** Other CC instance running Mercury audits in parallel
**Why this exists:** Three audits dispatched tonight returned "clean" verdicts under verification-flavored prompts. C2 was re-run with proper adversarial framing and found Critical + High bugs the verification version missed. The same flaw likely affects A, B1 (original), C1.

---

## Context — read this first

We're hardening the resilience-and-supervision stack before the inaugural paper run Monday 9:30 ET. The stack landed across `46efac0..baea97c` (~3000 lines: spec + ResilientWebSocket library + Supervisor module + gauntlets + adapter migration + getHealth protocol + B1/B2/B3/C2 audit-driven fixes).

**The lesson learned tonight (recorded in memory `feedback-mercury-attack-not-verify`):**

Mercury is rarely wrong. When findings are soft, the cause is usually a verification-flavored prompt. The fix is to rewrite tasks in attack mode.

| Verification framing (BAD) | Adversarial framing (GOOD) |
|---|---|
| "Is every field present in every branch?" | "Find a state where this LIES." |
| "Is the priority right?" | "Construct a CONCURRENT race that lands wrong." |
| "Are these equivalent?" | "Find a state where pre and post DIVERGE." |
| "Verify the contract holds." | "Use this as a WEAPON — show how it can be misused." |

C2 case study: verification dispatch returned 3 advisory findings. Adversarial re-dispatch found 1 CRITICAL crash + 1 HIGH lying-DEAD + 1 MEDIUM watchdog-fooler. Same code, very different verdicts.

---

## What needs re-running

### 1. Audit A — `foundation/ResilientWebSocket.js`

**Original verdict:** SHIP IT (7 false-positives + 1 medium). **Confidence:** mid — original prompt was middle-strength.

**Suggested adversarial re-dispatch prompt:**

```
ADVERSARIAL audit of foundation/ResilientWebSocket.js (HEAD).
Mode: ATTACK, not VERIFY. Find sequences that BREAK this library.
Use git_show / open_file / grep. Cite file:line.

TASK 1 — Construct a state where the library SILENTLY DROPS A FRAME.
Trace _onMessage through the auth-success branch, the data-stale watchdog,
and the parser. Find a sequence where a real data frame arrives but the
caller's onMessage callback is never invoked. Show the exact line ranges
involved.

TASK 2 — Find the RECONNECT-LOOP TRAP.
Construct a situation where the library reconnects forever without
making forward progress (e.g. server accepts auth then immediately closes;
or server sends malformed auth-success that doesn't match the predicate).
Does maxBackoffMs cap the rate but never escape? Is there any "give up
after N attempts" path? Should there be?

TASK 3 — Race the heartbeat with reconnect.
Heartbeat ticks at heartbeatPingMs; reconnect can fire at any moment.
What if a heartbeat is mid-flight when the socket closes? Does the pong
timer fire pong-timeout against the NEW socket? Trace _tickHeartbeat
through _clearTimer and the close handler.

TASK 4 — Find the MEMORY LEAK.
Library lifetime: start() → reconnect loop forever. Anything growing
unbounded? Listeners registered fresh on each _open without removing
the previous? Reconnect attempts incremented but counter never bounded?
Subscriptions Map (in caller) never cleared on the library side?

TASK 5 — Crash the parser.
parseMessageFn is caller-supplied with default _defaultParse. Find
malformed inputs that crash the library or leak memory: enormous
payloads (>maxBufferSize?), deeply-nested JSON (parser stack overflow),
Buffer that LOOKS like valid JSON but fails midway.

Report only BREAKAGES. For each: severity (critical/high/medium/low),
exact reproduction (call sequence), file:line. Verdict: SHIP IT or FIX FIRST.
```

### 2. Audit B1 — `core/Supervisor.js` state machine (FULL re-attack, not just post-fix verify)

**Original verdict:** FIX FIRST → 4 high/medium bugs found, all fixed in commit `29670af`. Re-audit verified fixes (commit `29670af` + `df344f5` for B2 + `91be425` for B3). **Confidence:** the post-fix verify was correctly verification-framed (closure check). **But** the ORIGINAL B1 prompt was mixed-framing — it found 4 bugs but may have missed others under softer questions.

**Suggested adversarial full-attack re-dispatch:**

```
ADVERSARIAL audit of core/Supervisor.js (HEAD, post B1+B2+B3 fixes).
Previous audits found and fixed bugs at commits 29670af, df344f5, 91be425.
Now ATTACK the full state machine + action mechanics + side channels.
Use git_show / open_file / grep. Cite file:line.

TASK 1 — Construct a state machine deadlock or infinite loop.
The transitions: HEALTHY → DEGRADED → UNHEALTHY → DEAD with recovery
edges. Find a sequence where the machine cycles forever between two
states without converging. Or a state where it's stuck and can never
reach HEALTHY again.

TASK 2 — Find the lying ledger.
The ledger writes wall-clock timestamps for human readability. The
state machine uses monotonic-ms internally. Construct a postmortem
scenario where the ledger and the runtime disagree about what happened
when. Specifically: a clock-skew sequence that makes ledger entries
appear out of order vs the actual transition order.

TASK 3 — Concurrent register/unregister/start race.
register() can be called before or after start(). Find a sequence:
register A; start(); register B mid-poll; what does B's first poll
see? Is its initial state HEALTHY by default — does that lie if B
is already broken at registration?

TASK 4 — Replay-history poisoning.
_replayRestartHistory reads JSONL ledger entries. What if the ledger
contains malformed JSON, partial lines (per the B3 known ENOSPC trade),
or entries from a DIFFERENT supervisor instance with different subsystem
names? Does poisoning the ledger compromise restart-loop guard math?

TASK 5 — Heal/escalate cooldown bypass.
healCooldownMs and deadCooldownMs are time-gates. With monotonic clock
they're skew-immune. But: can a fast clock interrupt (Node lib level,
not OS) cause _monoMs() to return non-monotonic values briefly? What
if a subsystem's selfHeal returns synchronously (not a real Promise)?

Report only BREAKAGES. Severity, file:line, exact reproduction.
Verdict: SHIP IT or FIX FIRST.
```

### 3. Audit C1 — Alpaca migration equivalence (re-frame as DIVERGENCE hunting)

**Original verdict:** BEHAVIORALLY EQUIVALENT. **Confidence:** low — the prompt asked "are they equivalent?" which is sympathetic. Should be "find a state where they diverge."

**Suggested adversarial re-dispatch:**

```
ADVERSARIAL audit of brokers/AlpacaAdapter.js Phase 9 migration
(commit a5ee381). The PRE-migration code is at commit f042021.
Mode: ATTACK — find a state where pre and post DIVERGE.

Use git_show to read both versions. Cite file:line.

TASK 1 — Find a CALL SEQUENCE that produces different observable behavior.
Construct: subscribeToCandles(A) → subscribeToCandles(B) → simulated
WS drop → reconnect → check that both A and B subscriptions are restored
correctly. Does the order of replay differ between pre and post? Does
the post version drop a subscription the pre version kept?

TASK 2 — Race the disconnect across versions.
disconnect() pre: set flag → clearTimeout → ws.close() → null. Post:
set flag → rws.stop() → null. Find a window where the post version
takes LONGER (or shorter) to settle than the pre version, and a
concurrent caller observes the difference.

TASK 3 — Find an OHLC frame that one version handles and the other drops.
Both versions parse messages from Alpaca's WS. Construct a frame
(bar, trade, quote, or control) that the pre version processed but
the post version drops, or vice versa. Pay attention to how each
version handles arrays-of-messages vs single-message format.

Report DIVERGENCES specifically, not equivalences. Each finding: severity,
file:line, exact frame/sequence, what pre does, what post does.
Verdict: BEHAVIORALLY EQUIVALENT or DIFF FOUND.
```

---

## Tools the other CC has

Mercury bridge gained 3 tools tonight (commits `d9a6bf2`, `76a9a1b`, `b57493a`):

- `tavily_search` — public web search (TRAI's existing TAVILY_API_KEY)
- `git_show` — cross-commit history (`{ref, path, start_line?, end_line?}`)
- `web_fetch` — raw HTTPS GET on allowlisted hosts

Use `git_show` for the C1 pre-vs-post comparison. The original C1 dispatch failed because Mercury didn't have history access — that's now fixed.

---

## What I (the resilience-stack CC) am pivoting to

Per Trey's call: the other CC takes A/B1/C1 re-dispatch in parallel, I move to dashboard cleanup work. C2 fixes already shipped (`baea97c`). Audit D (supervisor-daemon) still needs dispatch — also fits the other CC's queue.

---

## Reporting back

After each audit, report findings using `feedback-transparent-audit-categorization` rule:
- For each Mercury finding: classify as REAL BUG / RE-FLAG OF KNOWN / FALSE POSITIVE
- Real bugs get fixed before next audit dispatches
- "Mercury said it's fine" verdicts on softball prompts are NOT trustable — re-attack if confidence is low

Final verdict for each: SHIP IT (after real bugs fixed and re-audit confirms) or DEFER (if scope blows up beyond pre-Apex window).

---

## What NOT to do

- Don't restart `ogz-supervisor` until ALL of A, B1, B2, B3, C1, C2, D are SHIP IT under adversarial framing
- Don't override Trey's "Mercury is rarely wrong" — if you find yourself rationalizing a Mercury finding away, re-read `feedback-teammates-not-targets` memory
- Don't dispatch multiple audits in parallel — sequential per `feedback-mercury-one-at-a-time`
