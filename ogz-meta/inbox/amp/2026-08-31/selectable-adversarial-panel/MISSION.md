# Mission

Dispatcher: Puck thread `T-01a034e9-036f-70af-8009-eb719c05fc40`

Ruling authority: Trey

Original tasking verbatim:

```text
New separate governance/architecture mission from Trey. HOLD Part C unchanged; do not use this change to self-clear Part C. Implement selectable adversarial reviewer panels in `trai_brain/mercury-bridge/` and focused tests, without hardcoded mixture branches.

Required UX/contract:
- With `--agentic` in an interactive terminal and no explicit selection, present a multi-select: “Select reviewers for this adversarial run” with registry-backed choices (currently Mercury, Fable, Kimi).
- Non-interactive/deterministic usage accepts `--reviewers mercury,fable,kimi` or any nonempty subset/order, e.g. mercury, fable, kimi, mercury,fable, mercury,kimi, fable,kimi.
- Parse comma-separated reviewer IDs through an existing/new minimal reviewer registry; validate, deduplicate preserving declared order, dispatch exactly selected seats. Do not hardcode named mixtures.
- Unknown or empty explicit selection fails before provider dispatch.
- Interactive no-selection prompts. Non-interactive no-selection uses the existing configured default panel, stamped explicitly in receipt; no silent selection.
- Receipt records requested reviewers, selected reviewers, deliberately unselected reviewers, applied providers/models, unavailable/failed seats, fallback transitions, and authority ceiling.
- Fable retains its existing explicit Opus fallback within the Fable seat, fully stamped; no silent substitution.
- Unattested executable remains the sole execution hard stop.
- Single selected qualifying reviewer may produce findings but verdict is capped UNVERIFIED.
- Two or more independent selected qualifying reviewers may reach full authority only after agreement and evidence checks. Disagreement requires investigation/rerun and cannot pass.
- Provider quota/rate-limit failures ride the ladder as named absences; remaining selected clean seats continue; authority caps accordingly.
- No new env vars, config keys, defaults, or frameworks. No PM2/runtime/broker/activation. Never touch main.

This is its own mission and accountability packet under `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/`, ruling 7/7a tapes and dual hashes. Use current available seats honestly to test selection/failure combinations, but do not claim unavailable live combinations. Full adversarial review of the change under currently available panel; investigate claims. One atomic commit, push to `codex/multi-asset-symbol-state`, HOLD for Trey/Sol cold-pull. After it is independently cleared, Part C may resume under the selectable panel; until then Part C's 22-file diff remains preserved/uncommitted and must not be mixed into this commit. If safe isolation from Part C's existing uncommitted diff is impossible without destructive Git/worktree actions, STOP and report the exact isolation requirement rather than mixing scopes.
```

Publication ruling verbatim:

```text
Explicit Trey authorization: commit and push the selectable-adversarial-panel mission to `codex/multi-asset-symbol-state` now for Sol desktop cold-pull, despite the internal adversarial result remaining UNVERIFIED. This is an efficiency publication, not adversarial clearance, and may be reverted if Sol rejects it.

Before commit: complete the accountability packet under `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/`, including SOL-HANDOFF.md, ruling-7/7a evidence/tapes/hashes as available, and a prominent disclaimer in WORK.md, EVIDENCE.md, REVIEW.md, commit body, and handoff stating substantially: “NOT VERIFIED BY THE FULL ADVERSARIAL LAYER. Internal run remained UNVERIFIED because Mercury quota failed, Fable rate-limited to documented Opus fallback, and surviving prompt-only seats lacked current-diff evidence. Trey explicitly authorized publication for review efficiency so Sol can cold-pull the immutable commit. Publication is not clearance; rollback/revert remains authorized if Sol rejects it. Mercury/Fable/Kimi deferred check-in remains owed.” Do not claim PASS.

Commit exactly the seven implementation/test files plus the complete packet/handoff; keep Part C's separate 22-file diff entirely untouched and excluded. Fetch/rebase safely, verify exact scope and diff hash, push only to `origin/codex/multi-asset-symbol-state`, never main, then HOLD for Sol review. No Part C/D/E continuation until Sol rules on this commit. Reply with commit SHA, packet path, exact files, push receipt, and disclaimer location.
```
