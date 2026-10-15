# Verification

Candidate ab61c1d211701ccc979a54a2aadcea6b0ec08252 against d9cea81e7c1ccb30a6ebd8a9b8adbc0867cd1571. Removes credential-prefix entry authority, preserving active-trade evidence and error diagnostics. Only saved broker_unverifiable holds are retired; other symbol holds remain. No broker adapter changes or actual request-failure suppression.

Root ran the pinned standalone native fixture once after inspecting the fixture/dependency paths and Astra's static isolation review. ConfigLoader is intercepted before StateManager compilation; dataDir/stateFile point into a fresh fixture directory. Assertions passed: active evidence retained, legacy credential hold/entryBlocking field removed, unrelated exit_monitor_reconciliation_required hold retained, preserved-evidence record produced, and these properties persist through save. The real paper-state file and malformed decision log had identical SHA-256 and mtime before/after this run. This is a narrow observed isolation check, not an OS sandbox or proof that earlier tests were safe.

All five changed JavaScript files passed syntax checks from pinned source, and the scoped diff passed whitespace checks. The source retains existing dependencies; this is not whole-program pinned execution or live-broker acceptance.

Mercury returned no_break_found / nonblocking. It reports examining the two production files, despite five total changed files; no full-five-file Mercury coverage claim is made. Astra independently reviewed the complete candidate and fixture; see REVIEW-ASTRA.md. Mercury's non-crashing/logical concerns about inherited sizing, exit selection and receipt code are not certified harmless or resolved by this change.

The helper's earlier legacy Jest commands were unsafe and wrote the real state. Those failed runs are not acceptance evidence. RESULTS.md and ../verification-state-incident/INCIDENT.md preserve the incident and its unresolved recovery. No PM2 restart, resume, actual broker operation or runtime activation is part of this delivery.
