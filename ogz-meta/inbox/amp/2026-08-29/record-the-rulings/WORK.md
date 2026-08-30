# Work

Mission ID: `record-the-rulings`

Part: A — Record the rulings

Execution identity: Amp executed this mission in an Amp-managed thread on the
trusted VPS runner. The packet originally landed under `ogz-meta/inbox/codex/`,
which was wrong because ruling 7 requires the executing agent's own named
directory; the executor was Amp, not Codex. Trey cold-pulled Part A and ruled
the substance PASS, with this provenance correction mandatory before Part B.

Commit relationship: this packet and the ruling record are delivered in the
same atomic commit. Per the established self-reference mechanism in
`ogz-meta/REPO-HISTORY.md`, this packet records the immediately preceding
branch SHA, `8162d5fdee5994306e996d642ac773eea086ccef`; it does not invent its
own final SHA. The commit message carries `Mission-Id: record-the-rulings` and
this packet path as the reverse link.

Files authored for the mission:

- `ogz-meta/inbox/trey/2026-08-29/RULINGS-2026-08-29.md`
- `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/MISSION.md`
- `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/WORK.md`
- `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/EVIDENCE.md`
- `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/REVIEW.md`
- `ogz-meta/inbox/amp/2026-08-29/record-the-rulings/INHERITED.md`
- Redacted adversarial tapes listed in `EVIDENCE.md`

No source code, tests, configuration, environment, runtime, broker state,
protected path, or unrelated checkout state is changed by Part A.
