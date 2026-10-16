# Helper isolation adversarial review

Reviewed 2026-10-16 UTC on `codex/archive-legacy-env`, HEAD `26b846ac`, by the delegated read-only reviewer. Scope: launcher, Jest precondition, package scripts, bootstrap instructions, and supplied isolation probe. No tests, imports, runtime commands, credential reads, production edits, commits, or pushes were performed. Read the applicable root instructions, full agent doctrine, and alignment entry/doctrine; the explicit current scope supersedes older branch and approval wording.

## Finding requiring correction

**P1: The source snapshot removes required tracked helper inputs.** `scripts/test-isolated.py:13-29` only permits selected top-level directories and rejects every path component named `proof`. Since `package.json:8` now routes all Jest tests through this snapshot, existing tests fail before their assertions:

- `test/claudito-track-record-config.test.js:9` requires tracked `ogz-meta/claudito-logger.js`, and `test/multi-runtime-gate-runner-eval-pm2.test.js:10` requires tracked `ogz-meta/gates/multi-runtime-gate-runner.js`. Neither can enter the snapshot.
- `test/track-record-timezone-contract.test.js:6-7` reads tracked `public/proof/track-record/app.js` and `index.html`, both rejected by the blanket `proof` exclusion.
- `test/ecosystem-eval-profile.test.js:321,324` reads tracked `.github/workflows/deploy.yml` and `deploy/create-package.sh`, also omitted.

Retain required source and source-contract inputs with precise selection while excluding runtime data, proof datasets, receipts, private evidence, and credentials. Do not repair this by mounting real state or broadly copying `ogz-meta`. Re-run representative affected suites through the launcher after correcting the selector.

## Boundary assessment

No concrete filesystem, process, environment, or network escape was identified in this static review. The launcher uses a separate snapshot, rejects source symlinks, unshares namespaces, disables nested user namespaces, drops capabilities, clears the child environment, provides fresh proc/dev/tmp, and mounts dependencies read-only (`scripts/test-isolated.py:32-40,64-93`). The Jest guard checks the marker and distinct mount/network/PID namespaces before test imports. Source review is not runtime proof; parent-owned isolated probes must establish actual host behavior.

The package change only rewires helper entry points and installs Jest global setup; `start` and `start:prod` remain unchanged (`package.json:7-14`). No trading-path runtime guard or production module edit is introduced by this scoped patch. The boundary does not contain raw operator commands outside the launcher, and does not promise CPU, memory, or storage resource quotas. The marker is a misuse check, not an authenticity boundary against an operator who can deliberately alter host launch conditions.

Disposition: **changes required** for the snapshot consumer break above. Trading/runtime activation remains outside this review and was not performed.

## Follow-up review: corrected selector

Re-read all five scoped files after the parent correction, still without executing tests, imports, or runtime commands. The original source-selection finding is resolved in the reviewed source: `scripts/test-isolated.py:13-42` includes the six specifically identified inputs, retains only source suffixes under ordinary `ogz-meta` paths, excludes its private/intake/archive/report directories, permits public proof UI source while excluding proof datasets, and permits tracked `.github` and deployment source. Parent reports a six-path presence probe passing; this reviewer did not execute or independently observe that probe.

Namespace, mount, environment, and capability restrictions remain present at `scripts/test-isolated.py:94-106`. The fixture now creates its synthetic credentials within the disposable source snapshot, after the isolation guard and absence assertions (`test/fixtures/helper-isolation-probe.cjs:8-16,38-44`). Production startup commands remain unchanged, and the scoped changes introduce no trading runtime condition or halt.

Follow-up disposition: **no unresolved concrete findings in the reviewed scope**. This is a static review, not a full-suite pass, proof of resource isolation, or permission to activate runtime changes. Parent-owned behavior verification remains necessary. The initial finding and disposition above are retained as review history.

## Final source-only qualification

Reviewed the final environment hardening at `scripts/test-isolated.py:106-108`: the bubblewrap supervisor now receives only explicit PATH/LANG, in addition to the existing sandbox-command environment clearing. This closes the inherited supervisor-environment exposure without adding a production/trading path dependency. The probe checks readable namespace process environments for the injected host canary and only tolerates process disappearance or permission denial (`test/fixtures/helper-isolation-probe.cjs:12-18`). No new concrete finding.

**GO for the reviewed helper-only source change, conditional on the parent's final behavior verification passing.** This does not authorize deployment, runtime changes, or unrelated staged work. The parent reports prior actual-StateManager and ledger isolation, unchanged host state/decision-log hashes and mtimes, raw-Jest rejection before imports, and a passing existing track-record timezone suite. Those are parent-reported results, not executions performed by this reviewer; the final hardening rerun was still pending at this review.

Reviewed SHA-256 identities:

| File | SHA-256 |
| --- | --- |
| `scripts/test-isolated.py` | `c9687d810c4116ec610d2dd99e04f0a9d853b7892f489e0246c67324484d7915` |
| `test/helpers/require-isolation.cjs` | `00d1527890e1658f67d40af562fd7397f7e3dd53fb37d41e08bf7480560672ee` |
| `test/fixtures/helper-isolation-probe.cjs` | `43578d6b945c3b8d03fed7ef1ab5aff589bf63031e31a68752840f4b17f6e318` |
| `package.json` | `eb9038d2fcbf61fc38af4c46346679ff92e0c05bed58f929c17bcdc8b1e62f3d` |
| `AGENTS.md` | `f3798d9bfdf04b5303f6187eb8a13abf2226c6621484553725c4f086095964ec` |
