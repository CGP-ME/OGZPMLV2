# Inherited

foundation/ConfigLoader.js already had unrelated launch-mode, descriptor-path, sizing, fee-validation and exported-receipt changes; all preserved in working tree and excluded from the exact candidate used here. Numerical sizing policy remains deferred. RSI consumer already contains config throws; this change adds none and constrains new settings requests to the existing consumer domain. Direct-file malformed configuration and already inherited loader validation behavior are not repaired by this API exposure.

No enforced relation maxConfidence >= confidenceBase is added: the current consumer deliberately applies Math.min(maxConfidence, computedConfidence), which is mathematically defined for all accepted fractions. The candidate preserves that behavior rather than inventing a tuning policy.

The recovered Stop 1 audit is pinned to old 6ca25ae8 and is guidance. Referenced CSV artifacts were not present in the tracked/astra file search performed here; no exhaustive leaf migration claim.
