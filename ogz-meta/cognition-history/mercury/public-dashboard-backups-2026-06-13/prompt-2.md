Mercury, break my fix.

Follow-up after your first pass found the `.bak2026` bypass.

Current corrected shape:
- `ogzprime-ssl-server.js` now denies any route matching `/^\/.*\.bak.*$/i` before `express.static(public)`.
- `.gitignore` now includes `*.bak*`, `*.bak-*`, and `*.bak.*`.
- Tracked public dashboard backup files are staged for deletion:
  - public/unified-dashboard.html.bak-20260214-040443
  - public/unified-dashboard.html.bak-205924
  - public/unified-dashboard.html.bak-214750
- All untracked public backup files were moved outside the repo served tree to:
  - /opt/ogzprime/quarantine/public-backups-2026-06-13T0509Z
- Focused checks passed:
  - `node --check ogzprime-ssl-server.js`
  - `npm test -- --runInBand test/dashboard-token-leak-static.test.js`
  - `npm run test:dashboard-token`
  - `npm run scan:secrets`
  - `git check-ignore` for `.bak2026`, `.bak.177...`, and `.bak-...` examples.

Attack:
Find any remaining current-code or repo-state path where a public dashboard backup can still be served, committed, or used to leak a dashboard WebSocket token after this corrected `.bak*` cleanup. Check static route bypasses, gitignore false negatives, tracked/staged scanner gaps, and sibling public backup filename patterns.

Do not verify the cleanup. Break it with file:line or path evidence.
