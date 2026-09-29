# Inherited and unresolved

- Base/boosted sizing conflation and aggregate allocation remain separate Stop 1 work. Tuning is explicitly deferred by ogz-meta/inbox/codex/2026-09-28/stop1-clean-sizing/TUNING-NOTES.md.
- Existing throws for malformed sizing/exit inputs remain in OrderExecutor; none is introduced by this repair. This packet does not certify all input producers.
- Existing _stockShareRangeFillViolation checks accepted quantity, not fill-price slippage. Its existing handler traces/logs a violation; this repair does not claim broker-side dollar-cap enforcement or symbol quarantine.
- Existing TTP consistency/daily-loss calculations and their enablement semantics are unchanged in the staged source. Different inherited working-tree edits are not silently adopted.
- AST scanned 390 JavaScript files, found one share-range caller, no truncation. ogz-meta/ogz-run.js failed parsing; no universal zero-unknown coverage claim.
- Root settings, StateManager reservations, equity sizing and other dirty work remain untouched by this delivery. No PM2 activation was authorized or performed.
