# Explicit historical proof broker owner

The exact review base, candidate and source blobs are in source-manifest.json. The logger previously read nonexistent runtime path broker.id. It now reads proofPublication.account.broker, alongside the other historical account metadata. The new canonical value remains empty with publication disabled; no current broker is guessed. Canonical revision advances 10 to 11. Existing required-string validation still rejects empty BROKER.

The isolated fixture extracts actual account-input and account-validation functions from the pinned logger source. It distinguishes historical metadata from a different current broker, proves independence when the current broker is absent, and exercises existing empty-BROKER rejection. It does not generate or publish proof data, certify underlying journal/account consistency, or invoke a bot.

Reproduce: `python3 ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/proof-broker/reproduce.py`. Sources are reconstructed by recorded Git blob IDs; the helper isolation launcher executes all native probes.

Mercury run 2026-10-16T21-27-05-504Z-d90a7ac0b17c returned no_break_found. Its rationale incorrectly conflates execution broker with historical account metadata and counts a search as a third changed file. Actual diff has two production files. Astra independently reviewed the pinned candidate and returned GO with those corrections; preserve both answers. No PM2 restart, publication or runtime activation.
