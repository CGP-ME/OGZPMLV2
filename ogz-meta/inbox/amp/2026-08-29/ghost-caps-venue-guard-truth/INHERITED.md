# Inherited doctrine violations

These findings pre-existed Part C and remain unfixed because they are outside the ruled mission.

- `ecosystem.config.js`: large mixed-responsibility PM2 configuration and absolute VPS paths remain.
- `config/.env.example`: legacy broad configuration surface and placeholder credential examples remain.
- `deploy/create-package.sh`: legacy package generator emits a large `.env.template`, uses unquoted path variables, and retains placeholder credentials.
- `profiles/*.env`: usage comments name root `.env.*` paths rather than the tracked `profiles/*` paths; legacy direct strategy toggles remain.
- `backtest.sh` and `backtest.ps1`: duplicated platform-specific launch logic and legacy env-driven strategy controls remain.
- `scripts/generate-live-proof.js`: direct process-env reads, local sidecar loading, external reachability probes, and fallback presentation values remain; only the ruled dead-cap claim was removed.
- `ogz-meta/gates/eval-live-posture-gate.js`: large mixed posture/readiness module and legacy env/profile plumbing remain.
- `ENV-VAR-AUDIT.md` and `ogz-meta/ENV-VAR-AUDIT.md`: historical line references and broader stale tuning claims remain outside the six ruled caps.
- `test/ecosystem-eval-profile.test.js`: mutates process-global environment and couples many PM2 concerns in one suite. Its expected object contains two inherited `STATE_FILE` properties (`data/state.json` followed by `data/state-paper.json`), so JavaScript silently discards the first expectation; both properties predate Part C and the active PM2 value is the latter.
- `test/eval-live-posture-gate.test.js`: large environment fixture duplicates launch posture details.
- `ogz-meta/inbox/amp/2026-08-29/venue-guard-chain-audit.md`: records, but does not repair, the named venue-guard gaps required by the read-only mission.
- Repository-wide dashboard-token/secret scanning reports inherited fixtures and findings outside the Part C diff; this mission did not alter or suppress them.

No inherited violation was silently repaired or expanded into new scope.
