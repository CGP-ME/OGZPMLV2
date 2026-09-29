# Evidence

Command: node ogz-meta/inbox/codex/2026-09-29/next-config-controls/fixtures/observe.cjs

Result: baseline and candidate each produced 23 RSI candidates on the repository's 500 recorded TSLA candles. Baseline rejected all four new save requests. Candidate accepted four one-field changes, each changed actual registered RSI confidence outputs; exit-contract hints remained unchanged. Eight invalid inputs were rejected without disk or revision changes. Zero multiplier stayed zero; zero confidence ceiling reached the existing minimum-confidence comparison and produced no candidates.

OBSERVATION.json records source/data hashes, save receipts, prior and changed confidence vectors. The fixture executes HEAD-tracked JavaScript via a loader and only the sixteen-line candidate addition, with disposable config files under private/. It does not execute inherited dirty runtime implementations. Production config bytes are never written.

Source chain: ConfigLoader SETTINGS_PATH:29, saveSettings validation:2853-2860, disk publication:2919-2927; StrategyOrchestrator requiredRsiConfig:416-450, registered RSI closure:1845-1863. Existing WebSocketManager:125-127 projects the same getSettingsView/saveSettings surface. No actual browser/relay/network, cold process restart, broker, order execution, profitability or deployed behavior proved. This is a settings API/schema delivery, not a rendered browser-button claim.

Root reruns passed after fixture reproduction was pinned to6bcfad8a and its exact checked-in patch, removing dependence on future working-tree contents. See REVIEW.md for both incomplete and final pass runs. TAPES.json identifies redacted raw artifacts and selected-source manifests, retaining original/redacted/compressed SHA256. No broker/PM2/runtime activation.
