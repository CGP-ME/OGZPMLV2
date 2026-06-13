Mercury, break my fix.

Local Express middleware and file-state check only.

Current code:
- `ogzprime-ssl-server.js:137` uses method-agnostic middleware:
  - `app.use(/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*|\.(?:old|orig)$|~$)$/i, denyStaticBackup);`
- `ogzprime-ssl-server.js:138` uses method-agnostic middleware:
  - `app.use(/^\/index-.*\.html$/i, denyStaticBackup);`
- `ogzprime-ssl-server.js:140` serves `public` statically.
- Staged deletions include:
  - `public/index-RECOVERED.html`
  - `public/unified-dashboard.html.bak-20260214-040443`
  - `public/unified-dashboard.html.bak-205924`
  - `public/unified-dashboard.html.bak-214750`
- `.gitignore` has public-only guards for `*bak*`, `*backup*`, `*.old`, `*.orig`, `*~`, and `public/index-*.html`.

Find one local method or filename pattern under `public/` that reaches static serving when it should match the deny middleware or ignore rules. Use only file:line/path evidence.
