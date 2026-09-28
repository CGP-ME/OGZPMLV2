# OGZ HANDOFF — 2026-09-02 — FABLE LANE — STATE + THE WALK

**Author:** Fable (claude.ai project session, Sep 1-2 2026, successor of the Aug 27-Sep 1 session).
**Successor:** run the cold-start ritual FIRST — `ogz-meta/Alignment/README.md` → `TREY-DOCTRINE-FABLE-LANE.md` → `TREY-RULINGS.md` → `OGZ-MASTER-ALIGNMENT.md`. This file is testimony; the tree is the receipt. Prior handoff `ogz-meta/inbox/fable/2026-09-01/OGZ-HANDOFF-2026-09-01-FABLE.md` (if Trey committed it) covers Aug 27-Sep 1 in depth; this file supersedes its queue and adds the walk plan. Footer law binds every report: WHAT I DID / DID NOT DO / ASSUMED, or the report is void.

---

## 1. TREE STATE

Origin HEAD at handoff: **`4878c017`** "Record Part C upgraded-layer reconciliation" on `codex/multi-asset-symbol-state`. Chain since `3727b75d`: `3727b75d` panel correction + Alignment update (Fable PASS, executed proofs; Sol PASS after its own diff-attack — Trey relayed) → `4878c017` Part C reconciliation (Fable PASS as record).

Cold-pull ledger and instrument findings: see the 2026-09-01 handoff §1 and §8 — all still current. Key deltas since:
- **Part C lane CLOSED.** Mechanical question settled twice (host adjudication + my independent repo-wide grep at `4878c017`: zero production readers for all six deleted caps; sole hit `SMS_MAX_DAILY_LOSSES`, distinct key). TTP replacement chain verified at `trading.config.json:73-80` → `ConfigLoader.js:931-938` → `EvalRuleEngine.js:384-488`. Substantive question (flatten gap) recorded UNRESOLVED-FOR-TREY, correctly not adjudicated. Ladder (ruling 11) satisfied: Fable's objection led the rerun; Fable seat caught Mercury hallucinating a live `ACCOUNT_DRAWDOWN_BYPASS` reader; recheck retracted under AST.
- **`3727b75d` follow-up still open:** `evaluatePanelAuthority` trusts the seat's `evidenceChecksPassed` boolean without re-deriving from `evidenceBasis` (probe: empty basis + true flag → FULL). Latent — sole writer is host code `ask.js:697`. Fix: re-derive inside the primitive + `evidence_contradiction` cap. Also: the structured-verdict entry point was never located/executed by me — covered by tests only.
- **`mercury.ignore:27` excludes `gates/`** — broader than any ruling; blocked AST posture evidence during reconciliation. One-line scope fix owed.
- **Mercury seat format:** 0/9 required sections emitted on both extension after-run and reconciliation; caps held. Tuning row: schema-enforce the sections for the Mercury seat.
- **`ba6be563`'s 470-line SessionRouter broker-proof rung: STILL NEVER COLD-PULLED.** Part B's flatten path runs through SessionRouter. Must be pulled hard against the July ruling ("quarantine by construction, not decoration") BEFORE ignition.
- **Fable 5.1 released Sep 1.** Layer pins `claude-fable-5`; when CC starts applying the 5.1 identifier, expect `identity_conflict` caps until the fable alias accepts it. Small allowlist touch; watch the next box review.

## 2. THE QUEUE (order is law; nothing else dispatches)

1. **Part D** — last-price influence named: one trace emission at the run-empire-v2.js site(s) where non-active-frame bars update last-price/equity before the fence drops them. No behavior change. (Ruling 4.)
2. **Part E** — protected-path alarm rework from orb commit `93b891f4`'s two files: strip ALL trailer logic; unconditional buzz (author/SHA/files/subject) on `.env*`, `ecosystem.config.js`, `.claude/**`, `ogz-meta/Alignment/**`, `config/trading.config.json`. Needs GitHub secret `NTFY_TOPIC` (Trey). Receipt = one forced test buzz Trey confirms + one clean green run. (Ruling 9.)
3. **SessionRouter rung hard cold-pull** (Fable) — see §1. Blocking for ignition, not for D/E.
4. **Freeze the SHA.** Walk and boot read one tree. Record it in the walk transcript header.
5. **Ignite paper, WATCHED** (see §4 Gate 0).
6. **THE WALK** (§4).

Parallel, non-blocking: **Walk Room** mission (orb; desktop; spec in chat — seats `claude -p` + `codex exec`, commands /round /pull /rule /station /paste, no merging, transcripts to `ogz-meta/inbox/trey/`); **CC session-messaging** mission (Codex; final spec = "current architecture" version: one AGENTS.md section, `scripts/mesh-watchdog.js`, `messages.jsonl` in packet tapes; section 0 = verify ListAgents/SendMessage on the box first). Post-ignition: GPT reviewer seat; MTF wire (blocked on ruling-2 conflict); Mercury format enforcement; `mercury.ignore` gates/ scope fix; panel evidence re-derivation; ba6be563 history-correction commit (word never sent).

## 3. TREY'S OPEN ITEMS (nothing unblocks these but him)

1. **Ruling conflict 1:** one-net-position (ruling 1) vs doctrine "hedged coexistence is the architecture." His word: which stands; doctrine file amended on his word only.
2. **Ruling conflict 2:** ruling 2 as recorded says higher frames derive via TimeframeEngine; doctrine DATA says "no local aggregation in the live path; TFE stays retired; born-frame candles from the broker." Until his word: MTF wire = REST-native confirmation bars. Sol's MTF spec assumes TFE — needs the same word.
3. **Flatten rider (ruling 3):** account-limit breach currently blocks entries but does NOT flatten; stale start-of-day anchor silently disables the daily-loss guard. Proposed: breach → flatten via the proven cutoff path; stale anchor → entry halt + named absence. UNRESOLVED-FOR-TREY on the record.
4. **Ledger verdicts:** 115 items in `ogz-meta/ledger/`, individually, `.js` snapshots are the poison class, fix-board file needs live-or-fossil call.
5. **Kraken keys** → box `.env` + Bitwarden (form config in prior handoff §4; IP pin `45.76.11.192` after `curl -4 ifconfig.me` confirms).
6. **Box receipts:** `grep -cE "KRAKEN_API_KEY|KRAKEN_API_SECRET|ALPACA_API_KEY|ALPACA_API_SECRET|NTFY_TOPIC" .env` → 5; `grep -E "WEBHOOK_ORDERS_ENABLED=false|WEBHOOK_DRY_RUN=true" .env` → both lines.
7. **GitHub secret `NTFY_TOPIC`** (Part E). ntfy topic rotation (current topic guessable) recommended.
8. **CC trace census `237be24e` push word** (held since Aug 29).
9. **Codex/a100:** verify whether old box `ogz-a100` is alive (Tailscale/Vultr); if yes: `pkill -f codex`, `codex logout`, `pm2 stop all`, power off (also double-paying). One live Codex login per account; the desktop app owns it. Reply to the OpenAI ticket with root cause when found.
10. **Disk-tripwire mission: DISPATCHED-UNVERIFIED** — no receipt on origin. Re-demand or re-dispatch.
11. **THE ENGLISH SPEC** — see §4.1. The walk cannot start without it.

## 4. THE WALK — full plan as ruled

**What it is:** station-by-station audit of the live trade path, Trey's English spec as ground truth, conducted WITH the bot breathing on paper (Trey's amendment: "walk it with a live trace… feed stuff through the bot to get the real read"). Reading answers "what does the code say"; the live trace answers "what does it actually do"; the spec answers "what did Trey mean." All three at every station.

### 4.1 Preconditions (Gate 0)
- D + E landed and cold-pulled; SessionRouter rung pulled; SHA frozen.
- Box receipts (§3.6) green; Kraken keys in (needed for SessionRouter construction even on paper).
- **The spec, Trey's words alone, any length:** what the bot does when it wakes; what it watches; when it may enter; how it sizes; when it must exit; what it does when something breaks; what it never does. Plus his standing line: "the books must be readable by a human at any moment." No agent drafts it; agents only ever check against it.
- Ignition: `PROFILE=paper`, watched hour — trace tailed live, every position reconciled against Alpaca's own screen, boot trace archived to `ogz-meta/inbox/trey/<date>/boot-trace-1.log` (it is station 1's primary evidence).
- **Walk Room live (if landed):** desktop, both seats (Fable = context/history; GPT = doctrine enforcer — footers, N-of-M coverage, prose verdicts, banned phrases). If the room isn't ready, the walk proceeds in this chat with Trey pasting to GPT manually — the room is an accelerator, not a gate.

### 4.2 Standing laws during the walk (Trey's rulings, restated)
- **Walk law (ruled):** every doc, script, comment, and snapshot encountered is PRESUMED CONTAMINATED until verified against code at the frozen SHA. Verified → may stay. Wrong/unverifiable → flagged for deletion (deletion itself is Trey's, post-walk batch). Code is the only testimony that counts.
- Totality: touching a file at a station means auditing the whole file, not the station's slice. First hit is a lead.
- Anchors derived twice (wide pattern, full scope) before any claim constrains a station.
- Every station closes with a written verdict in the walk transcript: MATCHES SPEC / DIVERGES (how) / SPEC SILENT (Trey rules on the spot or parks it) — plus the N-of-M coverage of what was read/traced.
- Fix crew: divergences become orb/Codex missions dispatched BEHIND the frozen SHA (one package per agent, WIP law), landing on a fix branch; the walk absorbs fixes only at station boundaries, never mid-station. My cold-pulls continue per commit. Trey's `/rule` lines are appended verbatim to the transcript and to TREY-RULINGS.md at day's end.
- No PM2 restarts mid-walk without a station-boundary word; the breathing bot is an instrument, not a patient.

### 4.3 The stations (8, from the trade-path map; deepsearch Ask A settled much of 5-7 already)
1. **Boot.** Construction order in `run-empire-v2.js` (SessionRouter :797/:863, wireRuntime :1342, AuthFailureGuard wiring), every config value AS LOADED vs the 606-row census (ecosystem stamps vs .env vs defaults — EXIT_SYSTEM effective value, TRAIL_* three-reader split), every weight AS INITIALIZED (~28 config / 25 hardcoded), which constructors can fail without stopping boot. Live evidence: the archived boot trace. Known bodies to confirm dead or alive: run-empire-v2.js:582 risk gates defaulting off (CC census claim — verify); silent defaults firing.
2. **Data ingress.** Broker connect → candle admission. Alpaca's unconditional 1m stamp; the fence at :945 (drop + last-price side-effect per ruling 4 — Part D's trace must appear live here); CandleProcessor:1041 stale-data claim (CC census — verify on live trace); Kraken born-frame streams. Feed probe: watch one bar traverse ingress→admission on the live trace.
3. **Evaluation.** What triggers a cycle; which strategies run (allowShorts states; per-strategy MTF vetoes at StrategyOrchestrator:1417-1498 — expect data-starved no-ops until MTF lands; confluence starvation `insufficient_ready_timeframes` visible); how a winning signal is selected (the ranking that ruling 1 makes the cross-frame referee).
4. **Signal → order.** Sizing; every guard consulted (TTP venue chain `trading.config.json:73-80` → ConfigLoader:931-938 → EvalRuleEngine:384-488; the no-flatten gap lives here — Trey's rider); order construction; routing (OrderRouter vs OrderExecutor:2913 quarantine choke from Part B).
5. **Order → position.** Submission, ack, `applyFill` (StateManager:3327; 16 refusal paths; both wrapped callers OrderExecutor:4600/:5228; broker-accepted-state-refused → symbol halt). Probe on paper: force a refusal (duplicate fill event) and watch the halt + trace. The June anatomy, live.
6. **Position management.** Stops/targets/tiers/trailing (DynamicTrailingStop TRAIL_* bypass reads; MaxProfitManager vs EXIT_SYSTEM=legacy effective — which exit system actually manages, per boot evidence); cadence; which prices (ruling 4's newest-bar marks).
7. **Exit → closed.** Exit trigger → state closure → journal chain (TradeJournal/Bridge); persistence (single write site, atomic rename, no fsync; STATE_FILE selection — no state-paper.json inside StateManager).
8. **Reconciliation + boundaries.** Every internal-vs-broker compare; divergence behavior; boot quarantine's no-flatten hole (unmanaged live position risk — likely Trey ruling on the spot); SessionRouter crypto→stocks→crypto through one real RTH boundary on paper (the rung's wind-down/force-flatten chains — pulled in §2.3, proven here); AuthFailureGuard breach probe (synthetic auth failures → broker-session quarantine + flatten + scream, NOT kill — Part B's probe re-run against the breathing bot).

**Walk receipts:** one transcript per day in `ogz-meta/inbox/trey/`, station verdicts + Trey's rulings inline, committed by Trey; fix-mission packets per ruling 7; the walk ends with the survivor test ruling (orb census columns), the ledger deletion batch, and a GO/NO-GO list for the TTP eval.

### 4.4 What the walk is NOT
Not a refactor (fixes are missions, not edits-in-place); not a spec-writing session (the spec pre-exists it); not MTF/MDT feature work (those are post-walk missions gated on conflicts 1-2 and twin-run proofs); not deletion day (flags accumulate; Trey deletes in batches after).

## 5. STANDING LAWS FOR MY SUCCESSOR
Everything in the 2026-09-01 handoff §9-10 binds, plus: dispatched ≠ established — never cite a mission as precedent without its receipt on origin (disk-tripwire lesson); read the full REVIEW before any verdict touches a review; substantive objections go up, never adjudicated, even when the objector is your own seat; the walk laws in §4.2 apply to YOU — coverage counts in every station verdict.

---
**WHAT I DID:** wrote this from the session record, my clone at `4878c017`, and the prior handoff; verified the Part C closure claims by my own greps this session.
**WHAT I DID NOT DO:** pull anything after `4878c017`; verify VPS state, the a100, Codex session ownership, or whether Trey committed the prior handoff; read the walk-room or messaging mission results (not yet dispatched/landed).
**WHAT I ASSUMED:** Sol's PASS on `3727b75d` as relayed by Trey (I did not read Sol's report); the walk starts after D/E/rung/freeze per the queue; the next instance lands in this project with chats and memory available.
