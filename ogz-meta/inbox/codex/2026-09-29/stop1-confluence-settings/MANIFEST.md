# Manifest — 2026-09-29

Source: current astra-era candidate, host-run Node fixtures, existing Serena scan and the actual Mercury/Fable/Kimi review receipts. Kept for Trey's single-change accountability packet.

- MISSION.md: user tasking and ruling authority.
- WORK.md / INHERITED.md: implementation, excluded dirty work and explicit limits.
- CHANGE.patch: exact scoped production/test diff shown before commit.
- fixtures/observe.cjs and loop.cjs: reproduce exact-index behavior with synthetic data and stub execution; no broker or bot.
- fixtures/review.cjs: current scoped adversarial dispatch; existing bridge API, 7750 tokens, no iteration ceiling.
- fixtures/package-tapes.cjs: retain required tapes after the existing secret scrubber, with hashes.
- VERIFICATION.json, PRODUCERS.json and AST.json: behavior assertions, identities and source-reference evidence.
- OBSERVATIONS.json and CONTROL-FLOW.md: the exact host-attested evidence submitted to the successive reviews; earlier observation receipts remain historical.
- REVIEW.md / EVIDENCE.md: actual outcome and what was not proven.
- TAPES.json and tapes/: required review ledger and provider responses, redacted before gzip compression; original, redacted and compressed SHA-256 recorded. Failed reviews remain present.

Private fixture configs, full source snapshots and unredacted tapes are local-only. Nothing under private/ is staged. No runtime activation is performed.

FINAL-REVIEW.json retains the final adjudication and actual seat/identity diagnostics. The historical Fable needs-more-evidence label remains visible; it is not relabeled as unanimous approval.

CONTROL-FLOW.md is the display copy with trailing whitespace removed after review. The exact submitted, already-redacted bytes are preserved in tapes/control-flow-submitted.md.gz and identified in TAPES.json. CHANGE.patch omits unchanged context so patch-format blank context lines do not create whitespace errors in the packet.
