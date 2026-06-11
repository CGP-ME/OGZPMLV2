Mercury, break my fix.

Target files:
- scripts/scan-secrets.js after adding public-template credential assignment checks, private-key block checks, JWT-shaped literal checks, vendor-prefixed token checks, URL embedded credential checks, and burned env-template hash loading.
- ogz-meta/security/burned-env-template-sha256.txt hash-only denylist.
- test/secret-scanner-template.test.js focused regressions.
- test/mercury-embed-index-identity.test.js fixture split to avoid committing a literal credential URL.
- config/.env.example current scrubbed template.

Attack objective:
Find a false negative where a tracked or staged public template, markdown file, config file, test fixture, or backup/reference file can still carry real-looking credential material or a known burned env-template value while `node scripts/scan-secrets.js --tracked` passes. Also find any self-matching or false-positive escape hatch that weakens the scanner instead of fixing the class.

Known scope boundary:
This slice hardens scanner detection. It does not rotate provider credentials or rewrite git history.
