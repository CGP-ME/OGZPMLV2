# Mercury Attack Prompt - P0 Tiered Exit Accounting Gate Final Recheck - 2026-06-04

Break the patched P0 tiered-exit accounting gate. One target only.

Target:

- `ogz-meta/gates/multi-runtime-gate-runner.js:12-24`
- `ogz-meta/gates/multi-runtime-gate-runner.js:238-291`
- `test/multi-runtime-p0-accounting-gate.test.js:1-78`

Patch behavior:

- Normalizes `exitReason` with trim/lowercase before checking tier caps.
- Rejects missing `exitReason`.
- Rejects unrecognized tier-like labels such as `profit_tier_one`.
- Caps grouped tier sizes at the original-position fractions: tier1 `0.30`, tier2 `0.30`, tier3 `0.20`, tier4 `0.20`.
- The focused Jest test now covers corrected fractions, old over-credit, casing/whitespace, missing exit reason, and unrecognized tier-like labels.

Find a concrete remaining bypass where a report produced by this code can still over-credit tiered partial exits and pass the P0 gate. Return file:line evidence and a minimal failing report shape. If no blocker exists, say what bypasses you tried and why they fail.
