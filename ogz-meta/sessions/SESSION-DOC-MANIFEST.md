# Session Document Manifest

**Established:** 2026-04-27
**Author:** Trey Buhidar (with Claude Code)
**Status:** CANONICAL — supersedes prior "mutate the rolling docs" pattern

---

## The Rule

**Every session writes ONE dated, self-contained, append-only session document under `ogz-meta/sessions/`. Future sessions reference these docs as the canonical record of what was accomplished in each session window. Future sessions DO NOT mutate the old rolling docs (MASTER-ROLLOUT.md, RUNNING-TODO.md, TODO-NEXT-SESSION.md, POST-MATRIX-BACKLOG.md, etc.) to flip checkboxes or scrub stale references.**

If you want to know what was done in any window, find the dated session doc. If you want to know the current state, read the most recent session doc(s) until you have your answer.

---

## Why This Pattern

### What we tried before
The old pattern mutated rolling docs at the Scribe / Recorder stage of every Claudito mission:
- Flip phase checkboxes in `ogz-meta/MASTER-ROLLOUT.md`
- Strike items off `RUNNING-TODO.md`, `TODO-NEXT-SESSION.md`, `POST-MATRIX-BACKLOG.md`
- Update audit findings inside the spec docs they came from
- Update workstream status descriptions in the architecture overview

### Why it broke
1. **Doc drift.** As soon as anyone delayed the mutation by even a session, the rolling doc lied. By 2026-04-27 the MASTER-ROLLOUT was 14 days stale, with completed phases still showing as "queued."
2. **Mercury index pollution.** Stale mutations + new mutations both got indexed equally. Mercury would retrieve a 14-day-old workstream description as if it were current truth, then build proposals on top of that lie. (Documented in CLAUDE.md "Document Accuracy Rule" section.)
3. **No audit trail of what changed when.** Mutations leave no trace of "was X done in Mar 28's session or Apr 02's session?" — git log gets diluted with doc commits, and the doc itself just shows the latest state.
4. **Frequent merge conflicts.** Two parallel sessions both editing `MASTER-ROLLOUT.md` produces git conflicts on every doc-update commit.
5. **Cognitive overhead at start of every session.** Previous sessions spent 5-15 minutes "updating the docs." That time should go to actual work.

### What this pattern fixes
- **Append-only, no mutation.** Each session doc is frozen at write time.
- **No merge conflicts.** Two parallel sessions write two different files.
- **Linear audit trail.** `ls ogz-meta/sessions/` is the timeline.
- **Mercury indexes once and is correct forever.** Each session doc is true at its date — Mercury can retrieve any of them and the temporal context is explicit in the filename.
- **Rolling docs (MASTER-ROLLOUT, etc.) stop being load-bearing.** They become starter-kit context for new sessions, not the running ledger of state.

---

## What Belongs in a Session Doc

Use the format in existing session docs as the template (e.g., `session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md`, `session-2026-04-08-mercury-bridge-layer4.md`).

Required sections:
1. **Header** — Date range, branch, last commit SHA, current Phase 0 baseline if it shifted
2. **What Was Done This Session** — numbered themes; each theme has Symptom / Root Cause / Fix with commit SHAs
3. **Smoke Test Results** — table of what was verified
4. **Files Touched** — table of files + actions
5. **Git Log** — newest-first list of session commits
6. **Half-Cooked Items Status** — explicit table of what was open at session start, what closed, what's dispositioned (deferred / TODO'd / by-design)
7. **Open Items for Next Session** — ranked
8. **Context for Next Session** — short paragraph that orients a fresh AI session in 30 seconds
9. **Recorder Pipeline Disposition** — what was done re CHANGELOG, fixes.jsonl, RAG, Scribe, commit (mostly a checklist)

Optional:
- Decision log entries (if architectural decisions were made — also add DEC-NNN entries to the doc itself, not just via a future MASTER-ROLLOUT mutation)
- Audit verbatim findings (if useful for future cross-checks)

---

## File Naming Convention

```
ogz-meta/sessions/session-YYYY-MM-DD[-MM-DD]-{slug}.md
```

- `YYYY-MM-DD` = session start date
- `[-MM-DD]` = optional end date if session spans multiple days
- `{slug}` = 3-5 hyphen-separated keywords summarizing the session's primary work

Examples:
- `session-2026-04-08-mercury-bridge-layer4.md`
- `session-2026-04-25-27-asset-isolation-strategy-parity-bot-swap.md`

---

## Relationship to Existing Docs

**`ogz-meta/MASTER-ROLLOUT.md`:**
- Becomes a starter-kit context doc, not a running ledger
- Top of the doc should now point readers to `ogz-meta/sessions/` for current state
- Workstream status descriptions are accurate AS OF THE DATE STAMPED at top of doc; for current status, read the most recent session docs
- Decision Log entries (DEC-NNN) can still be added when needed, but ALSO mention them in the relevant session doc
- Don't mutate it to flip phase checkboxes session-by-session — that's the failure mode this manifest fixes

**`ogz-meta/recent-changes.md`:**
- Continues to receive one-paragraph composite entries per session window
- This is the chronological narrative; session docs are the deep archive
- Keep entries short (5-10 lines); link to the corresponding session doc for the full record

**`CHANGELOG.md`:**
- Per-commit changelog, mechanical. Continue updating as before.

**`ogz-meta/specs/*`:**
- Canonical specs unchanged. If a session proves a spec wrong, the session doc names that, and the spec is corrected (or moved to `ogz-ledger/superseded/`) in the same session per CLAUDE.md "Document Accuracy Rule"
- Specs describe what the system SHOULD be; session docs describe what was done

**`RUNNING-TODO.md`, `TODO-NEXT-SESSION.md`, `POST-MATRIX-BACKLOG.md`:**
- Largely superseded. Each session doc contains its own "Open Items for Next Session" section
- Old TODO lists can stay as historical reference but should not be treated as authoritative

---

## What a Future AI Session Reads (Updated Bootstrap)

Old bootstrap (broken):
1. `ogz-meta/MASTER-ROLLOUT.md` (full read)
2. `ogz-meta/specs/decision-ledger-schema.json` + `decision-ledger-integration-plan.md`
3. CLAUDE.md, mermaid charts

New bootstrap:
1. CLAUDE.md (project rules, never skip)
2. **Most recent 2-3 session docs in `ogz-meta/sessions/`** — these tell you what's been done, what's open, what's the current Phase 0 baseline
3. `ogz-meta/MASTER-ROLLOUT.md` 30-Second Status section ONLY (skip the per-phase details — they may be stale)
4. `ogz-meta/recent-changes.md` top 50 lines for narrative
5. CLAUDE.md mermaid chart references
6. Specs as needed for the specific work being done

**The most recent session doc is the most-current source of truth.** Older session docs frame what came before. Rolling docs are starter context, not authority.

---

## Worked Example

If a future session opens with the question "what did we do about the partial-close bug?":

**Old answer path:**
- Open `MASTER-ROLLOUT.md`, find the Phase 3 checklist, scan for partial-close items, hope the checkboxes are current

**New answer path:**
- `ls ogz-meta/sessions/ | sort` — find session docs that mention "partial-close" or "brain-bug" or "Mission 0.5"
- Read those session docs in chronological order
- Each one tells you: what was discovered, what was fixed, what was left open
- The most recent one tells you the current state

---

## Enforcement

- Every session that produces non-trivial work writes a session doc before shutdown
- The `/recorder` skill at `.claude/commands/recorder.md` should be updated to reference this manifest as the Scribe-step canonical pattern
- If a session is too short to warrant a full doc (e.g., a 1-commit hotfix), a short stub at `ogz-meta/sessions/session-YYYY-MM-DD-{slug}.md` is still written, even if it's only 30 lines
- This manifest itself does NOT get mutated session-by-session. If the rule changes, write a new dated manifest and supersede this one (link forward + back)

---

## Trey's Standing Rule

> "We dont have to worry about the old docs they can reference this one when they are checking the lists to see [...] every session can talk about what was accomplished that way theres referenceable docs."
>
> — 2026-04-27, the conversation that established this manifest

The point isn't to abandon the old docs. The point is to stop pretending they can stay current via session-by-session mutations. Future-Trey reading a session doc dated 2026-09-15 will know it's a snapshot from that day; future-Trey reading MASTER-ROLLOUT.md no longer needs to wonder how stale the checkbox in front of him is, because the canonical state is the most recent session doc.
