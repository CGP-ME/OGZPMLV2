# Helper isolation verification

Date: 2026-10-15 (operator local date). Source identities: source-manifest.json. This is helper execution isolation, with no trading-path changes or runtime activation.

Passed on the actual host:

- Linux bubblewrap creates separate mount/network/PID namespaces. The Jest global setup verifies those differ from the host identities supplied by the launcher in its read-only marker.
- Native adversarial fixture cannot see the real .env, state snapshot, PM2 socket or an outside host sentinel; neither its own environment nor readable namespace-process environments contain an injected host credential canary.
- A parent-controlled localhost listener cannot be reached. An outside symlink write cannot reach the host. A child process writes only disposable data. Runtime-shaped data/journal/pattern-path canaries never appear on the host.
- With synthetic credentials created only inside the disconnected fixture, actual StateManager saves balance 7500 despite the deliberately obsolete STATE_FILE override, and actual DecisionLedgerLogger writes a rejection. The host state and existing decision logs retain identical SHA-256 and nanosecond mtimes before/after. The outside host sentinel is unchanged.
- Raw `node node_modules/jest/bin/jest.js test/state-manager-load.test.js --runInBand` is rejected by globalSetup before test imports; host state/logs remain unchanged.
- `npm test -- test/track-record-timezone-contract.test.js` passes its existing test inside isolation. This is not a full-suite passing claim.
- Missing bubblewrap refuses execution; there is no unisolated retry. A sandboxed command's exit 23 propagates unchanged. Source syntax and scoped diff whitespace checks pass.
- All package scripts outside the six changed offline-verification scripts are byte-equivalent as values, including start/start:prod and the public HTTP dashboard-token check.

Initial fixture setup lacked the synthetic credential file and correctly stopped on existing ConfigLoader validation. Its host state/log checks passed. The fixture now supplies its own disconnected synthetic .env; no real credentials are copied or validation weakened.

Astra's concrete source-selection finding was corrected: needed ogz-meta code, public proof UI source, .github workflow and deployment script are available without runtime banks, proof datasets or private evidence. Final source review GO is in REVIEW-ASTRA.md; the subsequent final verification passed. This is non-production harness work, reviewed by Astra; no Mercury-clean verdict is claimed.

Limits: source snapshot intentionally excludes runtime data and operator credentials. Tests that relied on these must supply explicit fixture data; this change does not repair all legacy fixture semantics. Linux and bubblewrap are required. The runner protects its commands and descendants, not arbitrary commands deliberately executed outside it with host/operator access. Custom Jest configs could also bypass the repository globalSetup; AGENTS forbids such bypass. No claim of an OS-wide restriction on this desktop agent is made.

Raw output and before/after receipts remain in private/. The native fixture is committed for reproduction. No PM2 restart, trading resume, runtime permission change, network broker request, trading gate or production module edit occurred.
