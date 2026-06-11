Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-33`
- `scripts/scan-secrets.js:87-172`
- `scripts/scan-secrets.js:182-320`
- `test/secret-scanner-template.test.js:13-118`

Recent patches:
- Added test-mode payment token vendor-prefix coverage.
- Added split vendor-token literal coverage.
- Added hyphenated credential-assignment names.
- Added bearer-token literal coverage.
- Added credential-query-parameter coverage with placeholder/dynamic-value allowance.
- Added declaration-prefix assignment parsing.
- Fixed code-expression false positives for regex literals, arrays, ternaries, member access, and quote-starting expressions.
- Added JSON credential-property coverage with explicit env-reference allowance for `*Env` property names.
- Added object-property credential coverage with fixture-only dummy allowances and metric-name exclusions.

Attack question:
Find one false-negative shape in the scanner that is concrete enough to add a focused regression without turning the scanner into generic entropy scanning. Use placeholders only; do not print any realistic credential value, token literal, private-key block, JWT-like text, or URL with credentials. Describe the bypass as `[NAME]=[SENSITIVE_VALUE]` style placeholders, name the exact branch through `inspectLine`, and give the minimal root-cause fix. If every candidate is only a false positive, fixture-policy tradeoff, or broad entropy-scanner limitation, say that directly and explain why it is not a focused false negative for this scanner.
