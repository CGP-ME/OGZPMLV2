# Session-risk response removal

Date: 2026-10-13. Source: Trey explicitly rejected all five dormant actions and requested complete removal with Mercury blast radius and no orphan callers.

Kept evidence: blast-before.json (Mercury/Serena dependency callers and AST field references), source-manifest.json (exact candidate and harness identity), fixtures/verify.cjs and fixtures/receipt.json (seven profile constructors and actual paper snapshot/proof), REVIEW.md (adversarial verdict and limits).

Removed the sessionRiskResponse block from all seven launch profiles, required source paths, RiskManager config assembly, runtime proof, both allowed-action declarations, and the object validator used only by its actionParams. Updated existing tests/fixtures to expect absence. Existing venue rails, reconciliation reporting, position sizing, strategy exit/trailing ownership, and operational halts are outside this removal.

The AST property scan before removal found zero production reads; dependency scans identified RiskManager and runner callers of RiskManagerConfig, the runner's RuntimeConfigProof consumer, and ConfigLoader's broader importer set. Those module APIs remain. ConfigLoader's importer count does not imply that all importers read the deleted field.

The fixture loads the exact candidate JS and canonical JSON bytes. All seven profiles construct branded risk config and RiskManager; actual paper ConfigLoader snapshot and RuntimeConfigProof build without the deleted field or source keys. Fixture credentials are explicitly inert inputs and no broker request or PM2 command occurs. No runtime activation is claimed. Historical audit documents and already-pinned evidence remain intact rather than being rewritten.
