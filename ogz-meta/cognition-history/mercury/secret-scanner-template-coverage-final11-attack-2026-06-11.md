Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-31`
- `scripts/scan-secrets.js:85-151`
- `scripts/scan-secrets.js:179-293`
- `test/secret-scanner-template.test.js:13-106`

Recent patches:
- Added test-mode payment token vendor-prefix coverage.
- Added hyphenated credential-assignment names.
- Added bearer-token literal coverage.
- Added credential-query-parameter coverage with placeholder/dynamic-value allowance.
- Added declaration-prefix assignment parsing.
- Fixed code-expression false positives for regex literals, arrays, ternaries, member access, and quote-starting expressions.
- Added JSON credential-property coverage with explicit env-reference allowance for `*Env` property names.

Attack question:
Find one false-negative shape in the scanner. Use placeholders only; do not print any realistic credential value, token literal, private-key block, JWT-like text, or URL with credentials. Describe the bypass as `[NAME]=[SENSITIVE_VALUE]` style placeholders, name the exact branch through `inspectLine`, and give the minimal root-cause fix. If every candidate is only a false positive or a policy tradeoff, say that directly and explain why it is not a false negative.
