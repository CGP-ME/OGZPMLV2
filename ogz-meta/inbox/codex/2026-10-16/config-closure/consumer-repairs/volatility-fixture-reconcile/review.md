# Volatility fixture reconciliation

Pinned HEAD is `44901df4f680374aa607784af053f03fcc81ee61`. The existing test `test/policy-builder.test.js:523-545` exercises the migrated `PolicyBuilder.normalizeVolatilityAdjustment` high-volatility branch, which now reads `raw.highTargetMultiplier` at `core/PolicyBuilder.js:286-293`. Its fixture supplied thresholds and lookback but omitted both newly canonical-owned multipliers, so it no longer provides the contract required by the production normalizer.

The candidate changes exactly one fixture line, adding `lowTargetMultiplier: 0.8` and `highTargetMultiplier: 1.4`. These are the canonical values in the 17 exit-contract owners and preserve the existing assertions (`volatilityTargetFactor: 1.4`, combined target multiplier and tier target). No production source, assertion, or test scope changes.

The exact candidate is `c5fd97774735bd6b59a72e16fffbc37c9b12d98a`. Root ran the existing target test through helper isolation: one passed, 21 skipped by explicit name selection. No full-suite pass is claimed. Exact blobs and reconstruction command are in source-manifest.json and reproduce.py.
