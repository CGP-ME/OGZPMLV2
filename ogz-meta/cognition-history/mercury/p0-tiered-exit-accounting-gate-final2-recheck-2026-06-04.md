# Mercury Attack Prompt - P0 Tiered Exit Accounting Gate Final Scope Recheck - 2026-06-04

Break the patched P0 tiered-exit accounting gate after the scope-split hardening.

Target:

- `ogz-meta/gates/multi-runtime-gate-runner.js:12-24`
- `ogz-meta/gates/multi-runtime-gate-runner.js:238-316`
- `test/multi-runtime-p0-accounting-gate.test.js:1-91`

Current defenses:

- Normalizes `exitReason` with trim/lowercase before checking tier caps.
- Rejects missing `exitReason`.
- Rejects unrecognized tier-like labels.
- Rejects one entry identity split across runtime scopes.
- Caps grouped tier sizes at original-position fractions: tier1 `0.30`, tier2 `0.30`, tier3 `0.20`, tier4 `0.20`.
- Tests cover corrected fractions, old over-credit, casing/whitespace, missing exit reason, unrecognized tier-like labels, and runtime-scope split.

Find one concrete remaining bypass where a report produced by this code can still over-credit tiered partial exits and pass the P0 gate. Return file:line evidence and a minimal failing report shape. If no blocker exists, say what bypasses you tried and why they fail.
