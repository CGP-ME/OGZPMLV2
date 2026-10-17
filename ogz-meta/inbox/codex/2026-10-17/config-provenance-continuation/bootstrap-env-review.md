# Bootstrap and role environment provenance review

**Pinned source:** `8d1cf539aecda1de145bd8d7d7924ef74a53643a`. This is a static, bounded review of PM2/bootstrap and the dashboard-relay, checkout, and supervisor startup readers. It does not inspect a live environment, PM2 state, credentials, or process output, and does not certify inherited working-tree changes.

## Result

No independent current bootstrap/environment override or retained archived-environment reader was found in this surface.

- `ecosystem.config.js` gets restart policy only through `ConfigLoader.getInternalsFileValue('deployment.pm2')`. Its PM2 `env` objects declare only process posture (`NODE_ENV`) and the bot launch selector (`PROFILE: 'paper'`); they do not carry strategy, fee, broker, or archived environment values.
- `start-ogzprime.sh:11-36` is only the PM2 launcher. It passes no configuration values, only starts/reloads the four declared process names.
- The bot loads role `bot` before other application initialization at `run-empire-v2.js:118-124`. The dashboard relay loads role `dashboard` at `ogzprime-ssl-server.js:79-82`; checkout loads role `checkout` at `public/stripe-checkout.js:50-52`; supervisor loads role `supervisor` at `scripts/supervisor-daemon.js:69-71`.
- Credentials remain role-scoped rather than copied into canonical settings: `ConfigLoader` only provides an allowed credential to each role through `credentialForRole` (`foundation/ConfigLoader.js:513-518`), with the explicit dashboard, checkout, supervisor, and market-data role projections at `:554-644`. The canonical builder keeps credentials out of the settings/internals owners.
- The supervisor's PM2 process inspection reads status/restart/uptime fields only (`scripts/supervisor-daemon.js:176-227`); it does not inspect or propagate PM2 environment values.

## Archived-key comparison

The existing all-184 archival receipt at `ogz-meta/inbox/codex/2026-10-16/config-closure/provenance/current-all-env-result.json` records six role/profile snapshots with no missing source rows. The associated closure evidence says injecting all archived keys leaves effective configurations, source maps, revisions, and fingerprints unchanged. This review found no startup-surface raw `process.env.<archived-name>` or dotenv reader that would bypass that recorded loader boundary.

## Limit

This is source evidence only. It does not show what an already-running process inherited before a later PM2 reload, nor does it perform a runtime role-start walkthrough. Those are service-reload/runtime questions, not an untraced source override in the inspected bootstrap surface.
