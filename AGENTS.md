# AGENTS.md - OGZPrime Codex Boot Rules

This file is the first-stop bootstrap for Codex-style agents working in this repo.
It is intentionally short. The full operating doctrine is `ogz-meta/AGENTS.md`.
Live code and live git state are ground truth. Do not trust memory, stale specs,
or prior agent summaries without checking the current files.

## Active Workspace

- Repo root: `/opt/ogzprime/OGZPMLV2`
- Full agent doctrine: `ogz-meta/AGENTS.md`
- Exported Claude memory, if present: `ogz-meta/claudememories.zip`
- Current doctrine source: `ogz-meta/Alignment/`
- Start with: `ogz-meta/Alignment/README.md`
- Then read: `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`
- Then read the newest dated master alignment, verified digest, active session
  docs, active fix plan, P0 anchor docs, Mercury config, and the relevant live
  code before making claims.

Do not use `/opt/ogzprime/OGZPMLV2_GATES/AGENTS.md` as current guidance. That is
a sibling directory, not this active git repo, and its fallback/null-return advice
does not match current doctrine.

## Operating Rules

- Verify before claiming. Cite file:line evidence for code behavior.
- One logical change per commit.
- Show the diff before committing.
- No `git reset --hard`, no force pushes, no destructive deletes without operator
  approval.
- Do not use `sed` for edits or scrubs.
- Prefer root-cause fixes over bandaids, even when the hard path is slower.
- Do not silently substitute plausible defaults for missing trading-critical data.
- Do not swallow execution-path errors with warn/log-only catches.
- Remove emojis from touched production code/log lines, but do not bundle broad
  cosmetic sweeps with runtime fixes.
- Preserve unrelated dirty work. Assume unrecognized changes belong to the
  operator or another agent.
- Treat committed/pushed code and running PM2 state as separate. Do not claim
  the bot process picked up a commit until restart, env, state, and log evidence
  prove it; never restart PM2 without explicit Trey approval. Source:
  `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:5`.
- External static reviewers such as REMIO are read-only leads. Verify every
  finding against the VPS tree before implementation. Source:
  `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:14`.
- Do not stage loose ledger/intake/proposal/backup piles, public backup files,
  or proof-track-record artifacts unless Trey explicitly tasks that cleanup.
  Source: `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:17`.
- When Trey approves a commit, treat commit and push as paired unless he says
  local-only or no-push. This does not authorize staging, committing, or pushing
  without approval. Source:
  `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:13`.

## Trading-Path Gates

For changes on the trading/backtest execution path:

- Run Mercury as an adversarial attack before commit.
- Use one focused Mercury question at a time.
- Use attack framing, not confirmation framing.
- Use `--max-tokens=7750` and `--max-iterations=60`.
- Run the full P0 TSLA 2-year anchor after each trading-path fix.
- Current required P0 gate: `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`.
- Current full-anchor expectation: `13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`.
- Older `13213.042341608163` references are historical/modifiers-off anchors unless the current
  executable gate is explicitly rebaselined.
- If the anchor moves, stop and root-cause before continuing.

## Pipeline Discipline

Use the Claudito pipeline when a fix is being authored through the fix queue.
If the pipeline lacks a capability needed to safely process a fix, halt the fix
work, build the pipeline capability, get operator sign-off, then resume.

Do not bypass Mercury, P0, manifest tracking, or commit staging discipline because
a change appears obvious.

## Cold-Start Checklist

1. Check `pwd`, `git branch --show-current`, `git status --short --branch`, and
   recent commits.
2. Read `ogz-meta/AGENTS.md` for the full agent doctrine.
3. If `ogz-meta/claudememories.zip` exists, inspect
   `claudememories/MEMORY.md` inside it and read linked memory files before
   relying on memory-derived rules.
4. Read `ogz-meta/Alignment/README.md`.
5. Read `ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md`.
6. Read the newest dated alignment master and verified digest.
7. Read the newest 2-3 session docs or current worklog if the session docs lag.
8. Read the active fix plan or dispatch prompt.
9. Inspect the exact live files touched by the requested task.
10. State any stale, conflicting, or missing context before acting.

## Current Bias

This repo values correctness, auditability, and recoverability over speed.
When a failure can affect trading, backtests, pattern memory, broker state,
or operator trust, fail loudly and preserve evidence.
