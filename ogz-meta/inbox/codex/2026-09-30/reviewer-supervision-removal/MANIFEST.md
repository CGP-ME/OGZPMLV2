# Evidence manifest

Source: current astra-era at c080995a94d322a61950ee606d4f667c9dfe63c0 and Trey's live instructions, 2026-09-30.

Keep this packet to document the precise removal boundary, static caller/AST census, scoped implementation, behavior verification, external review and atomic delivery. `blast.json` is a policy-filtered static scan, not proof of complete dynamic reachability. It parsed 21 of 21 selected Mercury source files without parser errors. The initial caller target `reviewer-registry.js` does not exist; the actual registry lives in `reviewer-panel.js` and is checked separately. No absence claim is based on that mistaken target.

Raw private provider evidence is not a staging target. Final delivery must include safely redacted tapes with original and redacted hashes, named limitations and the confirmed remote commit.
