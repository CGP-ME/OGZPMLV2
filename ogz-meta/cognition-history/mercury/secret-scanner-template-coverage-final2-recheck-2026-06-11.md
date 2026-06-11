Mercury, break my fix.

Target files:
- scripts/scan-secrets.js after adding direct burned-hash copy blocking outside security denylist files.
- test/secret-scanner-template.test.js after adding direct burned-hash copy regression coverage.
- ogz-meta/security/burned-env-template-sha256.txt hash-only denylist.
- config/.env.example current scrubbed template.

Attack objective:
Find a false negative where a tracked or staged public template, markdown file, config file, test fixture, or backup/reference file can still carry real-looking credential material, a known burned env-template value, or a copied burned hash fingerprint outside `ogz-meta/security/*sha256.txt` while `node scripts/scan-secrets.js --tracked` passes. Focus on lowercase/mixed-case assignment keys, placeholder bypasses, assignment parsing gaps, burned-hash gaps, URL credential gaps, and self-matching/false-positive escape hatches.

Known scope boundary:
Committed hash fingerprints under `ogz-meta/security/*sha256.txt` are intentional non-secret metadata. This slice does not rotate provider credentials or rewrite git history.
