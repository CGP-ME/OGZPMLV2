# Historical environment provenance extension

Date: 2026-10-15 UTC. Source: the pre-migration ConfigLoader at `98c84304^`, the existing 184-name archive reconciliation, and its recorded effective source map. Full source identities and hashes are in `verification.json`.

Kept to close a specific evidence gap: the earlier regex map omitted indirect `track()` inputs and legacy `BASE_CONFIG` object properties. The AST extractor retains scoped bindings and distinguishes those two historical mechanisms. It includes all 31 prior mapped names and traces 31 additional names, producing 88 historical route records for 62 names. Of the 184 names, 25 have at least one exact current-path owner; 122 have no route in this one historical source file. Including partial or absent current-path matches leaves 163 unresolved/partial names.

Files:

- `trace-historical-provenance.cjs`: rerunnable read-only source extractor; writes only this evidence JSON.
- `HISTORICAL-SAME-PATH-PROVENANCE.json`: every archived name, its explicit route evidence or named absence, and exact path-owner joins.
- `verification.json`: independent AST checks, counts, source identities and input/output hashes.

These are historical declarations and identical-path ownership matches. A BASE_CONFIG declaration does not prove it won precedence at runtime. No renamed destination, value equivalence, unit conversion, feature retirement, consumer behavior, or historical migration acceptance is inferred. All rows explicitly keep historicalValueMigrationAccepted=false. No credential values are included. This does not replace the existing whole-config consumer audit or establish Stop 1 completion.

No production edit, configuration value change, PM2 restart, paper-state reset, backtest, or runtime activation occurred. Global Mercury index freshness is not claimed.
