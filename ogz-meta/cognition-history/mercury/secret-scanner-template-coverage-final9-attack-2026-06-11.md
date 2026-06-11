Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-30`
- `scripts/scan-secrets.js:84-145`
- `scripts/scan-secrets.js:173-278`
- `test/secret-scanner-template.test.js:13-100`

Recent patches:
- Added test-mode payment token vendor-prefix coverage.
- Added hyphenated credential-assignment names.
- Added bearer-token literal coverage.
- Added credential-query-parameter coverage with placeholder/dynamic-value allowance.
- Kept boundary-based credential-name classification and placeholder-only assignment allowance.

Attack question:
Find one false-negative shape in the scanner. Use placeholders only; do not print any realistic credential value, token literal, private-key block, JWT-like text, or URL with credentials. Describe the bypass as `[NAME]=[SENSITIVE_VALUE]` style placeholders, name the exact branch through `inspectLine`, and give the minimal root-cause fix. If every candidate is only a false positive or a policy tradeoff, say that directly and explain why it is not a false negative.
