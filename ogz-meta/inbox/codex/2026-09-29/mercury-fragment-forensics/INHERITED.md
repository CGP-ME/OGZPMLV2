# Inherited work and atomic scope

The worktree already contained a partially authored source-backed claim-adjudication repair. This change completes that same producer/consumer lane; it does not claim authorship of all inherited code.

Included in the exact six-file patch:

- tools/serena-symbol-scanner.js: function scopes in both parsers and source-hash-bound aggregation.
- trai_brain/mercury-bridge/ask.js: scanner scopes into explicit review; claim inventory/source into rechecks.
- trai_brain/mercury-bridge/evidence-ingestion.js: explicit mapper claims, durable IDs, source binding, candidate/final adjudication and quotation, retained-source reduction, per-target filing, receipt persistence. Newly authored completion supplies accepted source without a valid containing AST scope and supplies deduplicated literal source to final adjudication.
- trai_brain/mercury-bridge/adversarial-review.js: preserve original claim inventory and source-backed decisions during critique/recheck.
- trai_brain/mercury-bridge/react-loop.js: validate and preserve candidate/final claim decisions and source evidence through rechecks and merged authority.
- trai_brain/mercury-bridge/run-ledger.js: persist claim identities, decisions, attempts, accepted targets and inventories.

Excluded and preserved in the dirty worktree: tool-adapter.js directory/glob behavior; temperature defaults/options and request-options telemetry; all unrelated trading/configuration changes. The patch and IMPLEMENTATION.json, rather than staging entire dirty files, define delivery scope.

Inherited tests: baseline and repair have the same 25 existing Jest failures and 92 passes. No claim is made that the overall repository or provider chain is green. The exact failed names and log hashes are retained in verification-proof.json.
