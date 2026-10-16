# Canonical disposition gaps

The 1,693 scoped rows are classified in `canonical-dispositions.json`.

- `tooling.matrixSweep` has two current tool callers: `tools/matrix-sweep.js:94` and `tools/harvest-pattern-pack.js:46`. Its 146 leaves are conditional tool inputs, not inactive descriptors.
- Tuning, launch, and fee profiles have real resolver routes but remain conditionally selected by a tool, descriptor, or `PROFILE`; this static reconciliation does not claim an active selection.
- `deployment.pm2` is read by `ecosystem.config.js`; no PM2 state was inspected.
