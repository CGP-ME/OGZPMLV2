Mercury, break my fix.

Target files:
- scripts/scan-secrets.js after case-insensitive template and assignment matching.
- test/secret-scanner-template.test.js after numeric and lowercase credential regressions.
- ogz-meta/security/burned-env-template-sha256.txt hash-only denylist.
- config/.env.example current scrubbed template.

Attack objective:
Find a false negative where a tracked or staged public template, markdown file, config file, test fixture, or backup/reference file can still carry real-looking credential material or a known burned env-template value while `node scripts/scan-secrets.js --tracked` passes. Focus on lowercase/mixed-case assignment keys, placeholder bypasses, assignment parsing gaps, burned-hash gaps, URL credential gaps, and self-matching/false-positive escape hatches.

Known scope boundary:
Committed hash fingerprints under `ogz-meta/security/` are intentional non-secret metadata. This slice does not rotate provider credentials or rewrite git history.
