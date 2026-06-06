Mercury, break my fix.

Narrow recheck only: after your previous PASS, the workflow trigger was changed because the repo default branch is main and CI was only targeting PRs to master.

Current target files:

1. .github/workflows/ci.yml lines 3-10:
- push branches now include main, master, mission/**, feature/**, dev.
- pull_request branches now include main and master.
- explicit step still runs `npm run scan:secrets` with no continue-on-error.

2. package.json:
- `scan:secrets` runs `node scripts/scan-secrets.js --tracked`.
- `ci` runs `npm run scan:secrets && npm run lint:dto && npm run scan:dto && npm test`.

Known external setting:
- GitHub reports default branch main.
- GitHub reports main is not branch-protected.
- GitHub reports master is not branch-protected.
- I am not enabling branch protection in this code commit because that changes Trey's documented direct-push workflow and needs explicit operator approval.

Validation rerun after workflow trigger change:
- `npm run scan:secrets` PASS: tracked files scanned=1187, binarySkipped=12, submodulesSkipped=1.
- `npm run test:dashboard-token` PASS on real https://ogzprime.org bare routes.
- syntax checks PASS.
- Jest PASS: dashboard-token-leak-static and frontend-websocket-lifecycle, 13 tests.

Question:
- Does the code/workflow now correctly run the scanner on PRs into main/master and pushes to main/master?
- Is unprotected main still the only blocking prevention gap?

Required answer:
- Verdict: PASS or FAIL.
- If FAIL, exact line/path and concrete fix.
- If PASS, state the remaining branch-protection risk plainly.
