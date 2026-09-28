# Stop 1 sizing connection

Status: Trey stopped implementation, then explicitly requested a complete handoff and committing relevant completed work. HANDOFF.md and STATE.json are that deliverable. This does not resume production implementation, indexing, providers, or deployment.

Trey: use Mercury's blast-radius tooling for the configuration being moved, move the producer and consumers together, check actual behavior against the existing checklist, review the change, then one atomic commit and push. No new census, verification framework, bot stop, or unrelated architecture.

Scope: existing positionSizing.basePositionSize and maxPositionSize delivery. Preserve explicit backtest profiles. The existing C018 finding is the reading pointer, not proof of implementation. Aggregate exposure is not certified by a per-entry connection. Preserve all inherited edits; no bulk staging or runtime activation.
