# Runtime Config Proof Mercury Adjudication

Date: 2026-06-13

## Accepted

- No tracked duplicate startup proof exists. `git grep` found `RuntimeConfigProof` only in `run-empire-v2.js`, `core/RuntimeConfigProof.js`, `test/runtime-config-proof.test.js`, and this evidence folder.
- The missing-module mechanism is real: `run-empire-v2.js:334-337` already imports `./core/RuntimeConfigProof`, while `git ls-files` did not contain `core/RuntimeConfigProof.js` before this slice.

## Refuted Or Bounded

- Export-shape crash: current module exports both `buildRuntimeConfigProof` and `logRuntimeConfigProof` as named properties, and `node -e` verified both exported functions resolve. The new test imports the same named exports.
- Raw credential leak: credential fields use `redactedPresence()` in `core/RuntimeConfigProof.js`; the focused test asserts broker key, broker secret, webhook host, and webhook path are absent from serialized proof output. Public runtime identity fields such as broker id and trading pair remain intentionally visible because they identify the target path under the repo's verification rules.
- Missing source metadata: missing source ownership remains `null`, not a fabricated label. The focused test now asserts this explicitly.

## Out Of Scope But Preserved

- ConfigLoader vs TradingConfig ownership conflict is a known config-consolidation issue and the reason this proof logs both sections side by side. This slice does not solve config ownership; it prevents the already-wired startup proof from depending on an untracked module.
