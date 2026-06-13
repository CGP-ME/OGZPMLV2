Mercury, break my fix.

Final pass after the method and suffix gaps were fixed.

Current corrected shape:
- `ogzprime-ssl-server.js` uses method-agnostic backup deny middleware before `express.static(public)`:
  - `app.use(/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*|\.(?:old|orig)$|~$)$/i, denyStaticBackup);`
  - `app.use(/^\/index-.*\.html$/i, denyStaticBackup);`
- `.gitignore` keeps exact global `*.bak`, and adds public-only backup guards:
  - `public/*bak*`
  - `public/**/*bak*`
  - `public/*backup*`
  - `public/**/*backup*`
  - `public/*.old`
  - `public/**/*.old`
  - `public/*.orig`
  - `public/**/*.orig`
  - `public/*~`
  - `public/**/*~`
- Tracked public dashboard backups are staged for deletion.
- Public tree scan found no `*bak*`, `*backup*`, `*.old`, `*.orig`, or `*~` files under public.
- Focused checks passed:
  - `node --check ogzprime-ssl-server.js`
  - `npm test -- --runInBand test/dashboard-token-leak-static.test.js`
  - `npm run test:dashboard-token`
  - `npm run scan:secrets`
  - `git check-ignore` for public `htmlbak`, `htmlbak2026`, `.bak2026`, `.backup`, `.old`, `.orig`, and `~`.

Attack:
Find any remaining current-code or repo-state path where a public dashboard backup can still be served, committed, or used to leak a dashboard WebSocket token after this final method-agnostic backup-route and public-only ignore hardening. Check static route bypasses including HEAD, gitignore false negatives, tracked/staged scanner gaps, sibling public backup filename patterns, explicit sendFile routes, and whether public-only ignore scope reopens the public risk.

Do not verify the cleanup. Break it with file:line or path evidence.
