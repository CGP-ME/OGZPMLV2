Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-28` token, JWT, private-key, URL, credential-assignment regexes.
- `scripts/scan-secrets.js:82-142` burned-hash loading, assignment normalization, credential-name classifier, dynamic-RHS classifier, placeholder classifier.
- `scripts/scan-secrets.js:170-264` line inspection that rejects copied burned hashes, raw burned values, ws-token meta values, non-placeholder `WEBSOCKET_AUTH_TOKEN`, private-key blocks, JWT literals, vendor-prefixed tokens, URL-embedded credentials, credential-looking assignments, and burned assignment values.
- `test/secret-scanner-template.test.js:13-91` focused scanner regressions.

Attack question:
Find one concrete tracked-file line shape that can still commit a secret-class value while passing this scanner. Focus on false negatives in markdown, docs, config samples, fixtures, shell snippets, and source snippets after the latest boundary-based credential-name classifier. Do not give a general review. Produce the exact bypass line, the exact branch through `inspectLine`, and the minimal root-cause fix. If the only findings are false positives or policy tradeoffs, say that directly and explain why they are not false negatives.
