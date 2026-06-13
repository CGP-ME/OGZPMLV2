Mercury, break my fix.

Final pass after two valid bypasses were fixed:
- First pass found `.bak2026` without a separator after `.bak`.
- Second pass found `htmlbak` / `htmlbak2026` without a dot before `bak`.

Current corrected shape:
- `ogzprime-ssl-server.js` denies backup-style routes before `express.static(public)` with:
  - `/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*)$/i`
- `.gitignore` includes:
  - `*.bak`
  - `*.bak*`
  - `*bak`
  - `*bak[0-9]*`
  - `*bak_*`
  - `*.bak-*`
  - `*.bak.*`
  - `*backup*`
- Tracked public dashboard backups are staged for deletion.
- Public tree scan found no `*bak*`, `*backup*`, `*.old`, `*.orig`, or `*~` files under public.
- Focused checks passed:
  - `node --check ogzprime-ssl-server.js`
  - `npm test -- --runInBand test/dashboard-token-leak-static.test.js`
  - `npm run test:dashboard-token`
  - `npm run scan:secrets`
  - `git check-ignore` for `htmlbak`, `htmlbak2026`, `.bak2026`, and `.backup`.

Attack:
Find any remaining current-code or repo-state path where a public dashboard backup can still be served, committed, or used to leak a dashboard WebSocket token after this final backup-route and ignore hardening. Check static route bypasses, gitignore false negatives, tracked/staged scanner gaps, and sibling public backup filename patterns.

Do not verify the cleanup. Break it with file:line or path evidence.
