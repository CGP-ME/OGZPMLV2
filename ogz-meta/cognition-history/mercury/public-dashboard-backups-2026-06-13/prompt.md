Mercury, break my fix.

Scope: public dashboard backup cleanup.

Current staged change:
- Delete tracked public dashboard backup files:
  - public/unified-dashboard.html.bak-20260214-040443
  - public/unified-dashboard.html.bak-205924
  - public/unified-dashboard.html.bak-214750
- Move all other untracked public backup variants out of the served public tree to:
  - /opt/ogzprime/quarantine/public-backups-2026-06-13T0509Z
- Add .gitignore rules:
  - *.bak-*
  - *.bak.*
- Existing server evidence:
  - ogzprime-ssl-server.js denies .bak routes before express.static.
  - npm run test:dashboard-token passed against https://ogzprime.org.
  - npm run scan:secrets passed after staging deletion.

Attack:
Find a current-code or repo-state path where a public dashboard backup can still be served, committed, or used to leak a dashboard WebSocket token after this change. Check static route bypasses, gitignore false negatives, tracked/staged scanner gaps, and sibling public backup filename patterns.

Do not verify the cleanup. Break it with file:line or path evidence.
