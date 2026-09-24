# Evidence

`node .../mercury-reviewer-evidence/observe-delivery.cjs delivery-final.json`: all 32 artifact excerpts reached both real transport entrypoints and their provenance records. Two actual primary tool reads reached both; a recheck tool read also reached Kimi. The long read retains context-compaction metadata. Fable prompt: 207,812 bytes; Kimi prompt: 237,301 bytes. Provider calls: zero. Saved model answers used only as explicitly identified historical input replay.

`node --check trai_brain/mercury-bridge/ask.js` and `node --check trai_brain/mercury-bridge/adversarial-review.js`: exit 0. Scoped `git diff --check`: exit 0. Reviewed source diff contains no bot edits or new throw/gate/authority algorithm.

Why the previous verdict must stay UNVERIFIED: Mercury admitted reading 4/25 candidates and nevertheless said no_break_found. Its citation core/TradingLoop.js:250-350 was manually read and does not contain the claimed exitFraction propagation; it covers ledger-attribution helpers. Relevant ranges in StateManager:1818-1822, OrderExecutor:2542-2560 and ProfitExitPlanner:152-165 match their narrower descriptions but do not prove all producers or behavior. No rejected bot implementation was repaired from these findings.
