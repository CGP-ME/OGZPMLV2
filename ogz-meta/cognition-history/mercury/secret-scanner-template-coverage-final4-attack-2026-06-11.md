Mercury, break my fix.

Target slice:
- `scripts/scan-secrets.js:23-28` token, JWT, private-key, URL, credential-assignment regexes.
- `scripts/scan-secrets.js:82-142` hash loading, assignment normalization, credential-name classifier, dynamic-RHS classifier, placeholder classifier.
- `scripts/scan-secrets.js:170-264` line inspection that rejects copied denylist hashes, denylisted raw values, ws-token meta values, non-placeholder WebSocket auth assignments, private-key blocks, JWT literals, vendor-prefixed token shapes, URL userinfo, credential-looking assignments, and denylisted assignment values.
- `test/secret-scanner-template.test.js:13-91` focused scanner regressions.

Attack question:
Find one concrete tracked-file line shape that can still place a non-placeholder sensitive configuration value in markdown, docs, config samples, fixtures, shell snippets, or source snippets while passing this scanner. Produce the exact bypass line, the exact branch through `inspectLine`, and the minimal root-cause fix. Do not give a general review. If every candidate you find is only a false positive or policy tradeoff, say that directly and explain why it is not a false negative.
