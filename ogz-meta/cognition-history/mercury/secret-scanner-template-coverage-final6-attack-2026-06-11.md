Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-28`
- `scripts/scan-secrets.js:82-142`
- `scripts/scan-secrets.js:170-264`
- `test/secret-scanner-template.test.js:13-92`

Recent patch:
- Added the missing vendor-prefix branch for test-mode payment tokens.
- Kept the boundary-based credential-name classifier and placeholder-only assignment allowance.

Attack question:
Find one false-negative shape in the scanner. Use placeholders only; do not print any realistic credential value, token literal, private-key block, JWT-like text, or URL with credentials. Describe the bypass as `[NAME]=[SENSITIVE_VALUE]` style placeholders, name the exact branch through `inspectLine`, and give the minimal root-cause fix. If every candidate is only a false positive or a policy tradeoff, say that directly and explain why it is not a false negative.
