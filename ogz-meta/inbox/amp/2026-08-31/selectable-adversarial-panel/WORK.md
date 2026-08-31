# Work

Mission ID: `selectable-adversarial-panel`

Executor identity: Amp on trusted VPS runner `ogzprime-prod-001`.

Commit relationship: this implementation and packet are delivered in one atomic
commit. Per the predecessor-SHA mechanism established in
`ogz-meta/REPO-HISTORY.md`, this packet records the immediately preceding branch
SHA `cf2d9dd2746de1903adc8e7c49fef5a8776e89f7`; it does not invent its own final
SHA. The commit body carries the mission ID and packet path as the reverse link.

> **NOT VERIFIED BY THE FULL ADVERSARIAL LAYER.** Internal run remained
> **UNVERIFIED** because Mercury quota failed, Fable rate-limited to documented
> Opus fallback, and surviving prompt-only seats lacked current-diff evidence.
> Trey explicitly authorized publication for review efficiency so Sol can
> cold-pull the immutable commit. Publication is not clearance; rollback/revert
> remains authorized if Sol rejects it. Mercury/Fable/Kimi deferred check-in
> remains owed.

Implementation and test files:

- `trai_brain/mercury-bridge/ask.js`
- `trai_brain/mercury-bridge/adversarial-review.js`
- `trai_brain/mercury-bridge/run-ledger.js`
- `trai_brain/mercury-bridge/reviewer-panel.js`
- `test/mercury-consensus.test.js`
- `test/mercury-run-ledger.test.js`
- `test/mercury-reviewer-panel.test.js`

Packet files:

- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/MISSION.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/WORK.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/EVIDENCE.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/REVIEW.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/INHERITED.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/SOL-HANDOFF.md`
- `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/TAPE-HASHES.tsv`
- 22 redacted tape files under `ogz-meta/inbox/amp/2026-08-31/selectable-adversarial-panel/tapes/`

The implementation adds a registry-backed reviewer selection contract, ordered
seat dispatch, explicit selection/default receipts, seat-level failure and
fallback facts, and authority computation. It preserves Fable's existing Opus
fallback inside the Fable seat and preserves the unattested-executable hard
stop.

Part C remains separate and untouched at
`/opt/ogzprime/OGZPMLV2-trey-rulings-20260830`; its 22-file uncommitted diff is
not included. No Part C, D, or E work may continue until Sol rules on this
publication.
