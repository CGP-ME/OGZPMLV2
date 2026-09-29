# Evidence

Original reproduction: fixtures/reproduce.cjs compares committed OrderExecutor with WORKTREE corpus. Committed cap basis: currentBalance; dirty captured basis: currentEquity. Captured hash matched working file rather than selected commit.

Exact candidate observation command:

`MERCURY_HARNESS_TREE=$(git write-tree) node -r ./ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/observe.cjs`

Implementation tree: 49030f2b4223aab2a29001d1bff7d5a4684a1828. Selected source tree: f82df13265d204849f9ce6a8894a2aeb1c835963 (e6d80e0a). 714 policy-permitted files captured. Checks passed: open_file, positive grep, absent dirty-only grep, AST method callers, blast radius, pinned git_diff, explicit historical git_show, recheck dispatcher. Original dirty OrderExecutor hash unchanged. Recheck observation uses an injected synthetic loop and is not a model verdict.

A first partial-index patch had misplaced insertions; exact-candidate loading rejected it with SyntaxError before any provider invocation. Rebuilt own hunks against HEAD, checked removed bytes and JavaScript parse, then repeated verification. A diff callback shape issue found during local inspection was fixed before provider invocation.

Named absences: no broker interaction, bot execution, PM2 restart, deployment, trading calibration, or performance claim. Actual provider review results are recorded below.

Boundary checks passed on revised implementation tree f93161d39f016be57591dfda72101c3ed5c8da59: invalid/missing refs, explicit mutable-diff refusal, unexposed run_check, captured diff bytes, source-drift detection, deleted baseline identity, original worktree mode, unsupported symlink classification, missing captured blob classification, CLI pins/unlimited default, and explicit excerpt identity. Symlink/deletion boundaries are synthetic collaborator observations, not claims about repository history.

Full tracked secret scan reports 38 pre-existing findings outside this mission; not represented as a passing scan. The staged delivery scan is recorded separately.

Final actual provider review: 2026-09-29T08-42-26-859Z-a087b6e29aa1, pass; Mercury recheck no_break_found, 13 iterations, iterationLimit=null. Both actual provider source views each contain 714 files whose bytes match Git blob identities. First actual recheck delivered 30 source-stamped reads, all at its selected tree; final recheck source stamps are recorded separately. See TAPES.json for original/redacted/compressed hashes.

Final delivery checks: all five staged implementation object IDs equal the reviewed candidate; git diff --cached --check covers the delivery; the final staged text secret scan flags one literal apiKeySource=none pattern in the scan fixture, adjudicated as a non-credential false positive in SECRET-SCAN.md. All 96 compressed tapes were also scanned after decompression, with only the two narrowly proven false-positive classes described in SECRET-SCAN.md.
