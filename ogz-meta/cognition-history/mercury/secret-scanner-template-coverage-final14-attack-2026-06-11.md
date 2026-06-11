Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-33`
- `scripts/scan-secrets.js:87-172`
- `scripts/scan-secrets.js:182-320`
- `test/secret-scanner-template.test.js:13-118`

Recent patches:
- Added test-mode payment token vendor-prefix coverage.
- Added split vendor-token literal coverage for quote concatenation and template literals.
- Added hyphenated credential-assignment names.
- Added bearer-token literal coverage.
- Added credential-query-parameter coverage with placeholder/dynamic-value allowance.
- Added declaration-prefix assignment parsing.
- Fixed code-expression false positives for regex literals, arrays, ternaries, member access, and quote-starting expressions.
- Added JSON credential-property coverage with explicit env-reference allowance for `*Env` property names.
- Added object-property credential coverage with fixture-only dummy allowances and metric-name exclusions.

Attack question:
Find one focused false-negative shape in this scanner that matches the current scanner scope: credential assignments, credential object/JSON properties, vendor token shapes, bearer tokens, credential URLs, private-key blocks, JWTs, or denylisted burned values. Use placeholders only; do not print any realistic credential value, token literal, private-key block, JWT-like text, or URL with credentials. If every remaining candidate requires generic entropy scanning, multi-line dataflow reconstruction, or intentionally obfuscated source generation, classify it as out of this scanner scope and say no focused false negative found.
