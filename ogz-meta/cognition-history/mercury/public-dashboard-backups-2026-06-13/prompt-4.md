Mercury, break my fix.

Final pass after narrowing the ignore rules to the real risk surface.

Current corrected shape:
- `ogzprime-ssl-server.js` denies backup-style routes before `express.static(public)` with:
  - `/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*)$/i`
- `.gitignore` keeps exact global `*.bak`, and adds public-only backup guards:
  - `public/*bak*`
  - `public/**/*bak*`
  - `public/*backup*`
  - `public/**/*backup*`
- Tracked public dashboard backups are staged for deletion.
- Public tree scan found no `*bak*`, `*backup*`, `*.old`, `*.orig`, or `*~` files under public.
- Focused checks passed:
  - `node --check ogzprime-ssl-server.js`
  - `npm test -- --runInBand test/dashboard-token-leak-static.test.js`
  - `npm run test:dashboard-token`
  - `npm run scan:secrets`
  - `git check-ignore` for public `htmlbak`, `htmlbak2026`, `.bak2026`, and `.backup`.
  - `git check-ignore` does not ignore this Mercury evidence path.

Attack:
Find any remaining current-code or repo-state path where a public dashboard backup can still be served, committed, or used to leak a dashboard WebSocket token after this final public-only backup-route and ignore hardening. Check static route bypasses, gitignore false negatives, tracked/staged scanner gaps, sibling public backup filename patterns, and whether narrowing from global `*backup*` to public-only reopens the public risk.

Do not verify the cleanup. Break it with file:line or path evidence.
