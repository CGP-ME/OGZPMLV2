# Evidence

Executed `node ogz-meta/inbox/codex/2026-09-24/mercury-evidence-handoff/verify-handoff.cjs` against the actual current-change scanner, writer, file tool and context serializer. Output:

```json
{"handoffMatches":true,"sections":42,"bytes":185408,"lines":5241,"scanErrors":0,"toolReads":133,"fixtureRoot":"/opt/ogzprime/OGZPMLV2/ogz-meta/inbox/codex/2026-09-24/mercury-evidence-handoff/receipt-files-XZyKMW","ledgerPointerMatches":true,"collisionCode":"EEXIST"}
```

`handoff-receipt.json` retains all section hashes, actual read ranges, serialized lengths/hashes, source hashes, scan targets and truncation metadata. All 42/42 captured sections match producer, disk and delivered tool bytes. All selected reads fit the existing context serializer. The diagnostic explicitly narrows oversized reads; this is not evidence a model chose to do so.

The existing dirty tree was scanned only as evidence, not endorsed, transplanted or executed. Ten of sixteen returned reference scans report truncation; zero scan exceptions does not mean complete discovery. Those flags and verdict requirements are unchanged.

Original artifact SHA-256: `c20ca06fa2460d2b66d80b9b8ec287cbe3a01775c88ed40416018e96ed6d848f`; manifest SHA-256: `4f2fc296ce398616d8182d38990e02c86387eac9adbe35b3a6bb4cba9b2226ba`. Both are preserved beneath the exact fixtureRoot above and the relative bundle paths in the receipt. Both files have mode 0600. A repeated write reports EEXIST and preserves original bytes.

`redactSensitiveText` changes the raw source-reference artifact; it is retained privately and deliberately not staged. No raw artifact text or alleged secret value is printed or published. The manifest contains only hashes/ranges/targets. No provider tape exists for this local diagnostic; no paid reviewer or provider request was made. The raw artifact is not represented as a redacted published tape.

Recovered source hashes: run-ledger.js `b5f9537ddb69f3c6bb09a01d79566c06c9f316d88ce51d189a7d8255cd62a06f`; ask.js `c4a05363721f2672936deaaa689402591a84e4587cf91e46b977f0bb9b8f0fb9`. Recovery clone was read only.

`node --check` on both changed JS files and path-limited `git diff --check` completed without errors. No Jest, DB access, bot boot, PM2, broker operation, reindex or activation occurred. Prompt/terminal wiring is source-inspected, not a completed live provider dispatch. Model consumption, independent cold review, full Mercury acceptance and config-migration completeness remain unproved.
