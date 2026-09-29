# Stop 1 clean sizing migration

Authority: Trey, current conversation, September 28, 2026. Branch: astra-era.

Task: construct the two-config migration using supplied Astra documents and CSV as guidance, verified against current source. For each coherent migration use Mercury AST blast radius, connect initialization and actual consumers, prove behavior, adversarially review, show diff, commit and push. Preserve unrelated uncommitted work; do not investigate that pile as a separate task.

Current scope correction from Trey: migrate configuration ownership and all consumers; do not make numerical tuning, a new exposure denominator, or new boost eligibility prerequisites. The three earlier policy questions are withdrawn. See TUNING-NOTES.md for decisions to revisit with running-bot graphs and decision traces. No production sizing change has been authored in this session.

Trey supplied a source-pinned sizing report identifying the base/ceiling conflation, missing aggregate cap and share-minimum bypass. It is a lead checked against the current tree, not an instruction to adopt old floating code wholesale.

No runtime activation, PM2 restart, broker action, or new gate/framework is authorized by this packet.
