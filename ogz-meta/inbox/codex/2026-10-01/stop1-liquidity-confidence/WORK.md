# Work

Production scope: modules/LiquiditySweepDetector.js, core/StrategyOrchestrator.js, run-empire-v2.js, foundation/ConfigLoader.js and this lane's changelog entry.

The detector's optional confidenceWeightsProvider reads only the existing five weights at signal calculation. It updates weights without replacing accumulated detector/session state. Existing materialized signals remain unchanged; explicitly injected detectors without a provider stay pinned. The three actual constructor paths receive current settings providers. SymbolTradingContext contains no LiquiditySweep instance and is not modified.

ConfigLoader exposes manipCandle, wickSweep, sweepReject, hammerPattern and engulfPattern through existing settings publication. Nonnegative Number-compatible semantics and the existing confidence clamp are preserved. Malformed forced replacement returns through the existing authorized named rejection/owner-restoration route. Canonical weight values, startup semantics, periods, sessions, ATR and exits are unchanged.

Root owns staging, review and delivery. At preparation time no Liquidity commit existed. Packet helper copied unchanged focused fixture sources and clean lane patches, prepared tape packaging/validation, and wrote these docs. No runtime restart or deployment is claimed.

Initial Mercury no_break_found and Kimi pass are preserved. Root identified overbroad reporting claims and Kimi named unexamined settings publication paths; a complete-source/behavior-receipt Kimi evidence closure is running on the identical candidate. This is not a source revision.

Completed review: Mercury no_break_found; Kimi evidence-closure pass, blocking false. Full answers and residual reading limitations recorded in REVIEW.md. No source revision after behavior proof or review.
