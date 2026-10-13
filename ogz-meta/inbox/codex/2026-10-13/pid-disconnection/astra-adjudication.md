# Astra PID disconnection adjudication

Date: 2026-10-13
Candidate: `cb07ffc10eb2691644c0ea1d8a08b33e89f6b6c1`
Base: `23b199486aa7d5a77da3ddc340417a0bad4f9696`
Scope: requested PID disconnection in OrderExecutor and StrategyOrchestrator; preserve controller and settings. The operator's newer disconnection instruction supersedes the earlier trailing-output hookup proposal.

Verdict: no reachable introduced regression found within the requested disconnection scope. The exact candidate removes 63 lines from OrderExecutor and 14 from StrategyOrchestrator, with no additions. No production source was edited during this review.

The diff removes the runtime PID imports, sizing multiplier application, regime-ranking adjustment, and both long/short close feedback blocks. Removed helper variables have no remaining references in the candidate. Shared long-result P&L and strategy variables remain and are consumed by risk reporting (`core/OrderExecutor.js:4830-4839`); short-result strategy remains consumed at `5091,5427`. The prior proposed trailing hookup is absent. The preserved controller retains its getters, singleton, reset, and exports (`core/PIDController.js:291-315,365-378`).

Actual verification: ran `behavior-proof.cjs --candidate-ref=cb07ffc10eb2691644c0ea1d8a08b33e89f6b6c1`; PASS. It executes the actual sizing, ranking, and entry excerpts against immutable candidate/base sources, demonstrates removal of PID influence while retaining confidence sizing and configured regime boosting, confirms unchanged ATR contract behavior, scans 154 runtime source files for controller imports/instantiation/getter access, and verifies controller bytes and PID settings are preserved. Additional immutable Git search found no remaining removed-local references or runtime controller callers; the optional `pidPositionMultiplier` DTO schema field is preserved metadata, not a caller.

Mercury's answer remains `found_break`. Its missing-PID-usage allegations describe the explicitly requested outcome, not a failure. Its other cited side/price/receipt/trade-selection/config-guard locations are unchanged by the removal-only diff. Calling existing validation an added throw/guard is contradicted by that diff. No general audit or unrelated fixes were performed.

Limits: excerpt behavior and static caller/reference checks, not complete order execution or full long/short close execution. No broker calls, persistent-state writes, PM2 restart, or runtime activation. This receipt logs the review; delivery still needs the requested changelog entry and must not describe running processes as disconnected without separate activation evidence.
