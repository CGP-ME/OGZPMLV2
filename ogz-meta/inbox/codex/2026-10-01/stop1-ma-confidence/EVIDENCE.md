# Exact-source behavior evidence

Selected source tree: d574b566eb8d3a869c9490af5723b90724b191ba. Base commit: 8824e64161cb630903724f311389aee90c9fd60a. Both exact fixtures returned PASS with patchesApplied=false. Complete JSON receipts, source hashes and unchanged fixture copies are in delivery/.

Integration exercises durable saves, forced replacement, retained state and four owners: runner root, SymbolTradingContext, orchestrator root and lazily created orchestrator symbol. It records 43 saves, 18 invalid save rejections, 24 invalid forced replacements, pinned injected configuration and positive finite base/weight behavior. Cap proof executes the actual orchestrator evaluator at accepted boundaries and validates rejection above one before replacement publication.

Limits: runner assignment/context expressions execute with real constructors rather than booting the entire runner; no complete TradingLoop, order, broker, dashboard relay, PM2 restart or deployment proof. Strategy profitability and calibration are not asserted.

BLAST-BEFORE.json retains the initial static import census. The live review also ran Serena across the five changed production files; ConfigLoader has broad callers. This is static evidence, not proof of all dynamic execution.

Initial quota failure, absent Fable account and original Mercury finding are preserved rather than counted as passes. The user selected Mercury + Kimi. Final adjudication is pending at this writing.

Final: Kimi adjudication passed with no required rechecks after receiving both complete receipts and all five complete production files. See REVIEW.md and hash-bound tapes.
