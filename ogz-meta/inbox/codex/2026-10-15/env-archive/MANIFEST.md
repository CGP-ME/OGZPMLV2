# Environment archival evidence

Source: current VPS tree on codex/archive-legacy-env, inspected 2026-10-15 UTC (October 14 Pacific). Kept for operator-requested effective configuration provenance.

- key-disposition.json: all 206 original key names, 22 retained credential owners, 184 archived names. No values.
- candidate-verification.json: candidate role comparisons; only candidate env-file path differs.
- legacy-env-nonauthority.json: deliberately altered archived process-env values do not affect any of five role snapshots.
- installed-verification.json: actual .env path yields exact prior config, sources, and fingerprint for all five roles.
- effective-sources-before.json: full bot source map (2,623 paths); sources only, no credential values. Exact installed equality established.
- REVIEW.md: bounded Mercury findings and root disposition; no clean-review or restart claim.

Private original .env, candidate, complete snapshots, PM2 configuration, and raw review stay under private/ and must not be published. Runtime restart/provenance remains pending the open paper position disposition.
