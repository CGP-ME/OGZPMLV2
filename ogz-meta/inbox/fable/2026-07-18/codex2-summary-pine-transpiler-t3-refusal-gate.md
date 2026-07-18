# Codex-2 Summary: Pine Transpiler T3 Refusal Gate

Date: 2026-07-18
Lane: Pine Transpiler Certification T3
Status: DIFF READY; commit/push held because full Jest is red in the shared checkout

## Scope

Allowed territory used:
- `pine-transpiler/core/PineFeatureScanner.js`
- `pine-transpiler/tools/pine-import.js`
- `pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js`

No `core/`, `config/`, `foundation/`, `modules/`, or root `test/` files were touched by this lane.

The named spec file `PINE-TRANSPILER-CERT-SPEC.md` was not present in the repo from `find . -path './.git' -prune -o -iname 'PINE-TRANSPILER-CERT-SPEC.md' -print`, so the operator prompt was used as the lane spec.

## Implemented Shape

`PineFeatureScanner` now separates ordinary advanced-feature warnings from import-blocking certification refusals.

Refused at import:
- `request.security()` with `lookahead=barmerge.lookahead_on` or `lookahead=true`
- `calc_on_every_tick=true`
- `varip`
- `array.from`
- recursive arrow functions
- `switch`
- tuple assignments such as `[a, b] = fn()`

The scanner strips comments and string literals before matching refusal tokens, so comments and labels do not trigger false refusal.

`pine-transpiler/tools/pine-import.js` now calls `scanner.assertImportable(source)` before writing any generated module. Refused imports exit with code `2`, print `Pine import refused`, and list each refused feature by name.

## Tests

Green:
- `node --check pine-transpiler/core/PineFeatureScanner.js`
- `node --check pine-transpiler/tools/pine-import.js`
- `npx jest pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js pine-transpiler/__tests__/PineTALib.golden.test.js --runInBand`
- Result: 2 suites passed, 28 tests passed.
- `git diff --check -- pine-transpiler/core/PineFeatureScanner.js pine-transpiler/tools/pine-import.js pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js`

Full Jest:
- Command: `npm test`
- Result: FAIL, 19 failed suites / 159 passed suites, 21 failed tests / 1849 passed tests.
- Observed failures were outside `pine-transpiler/`, including dirty shared platform files, missing `OPENAI_API_KEY`, missing asset-class/broker env for pattern memory tests, stale P0 expectation in `test/multi-runtime-gate-runner-eval-pm2.test.js`, and untracked archived tests under `ogz-meta/inbox/codex/2026-07-14/worktree-collapse/...`.
- Housekeeping note only: Jest currently collects archived tests under `ogz-meta/inbox/`; excluding `ogz-meta` from `testPathIgnorePatterns` belongs to Codex-1 campaign close, not this lane.

## Commit Status

Commit and push approved by Trey under the amended shared-checkout gate: focused pine suites, touched-file syntax checks, and territory-confined diff.
