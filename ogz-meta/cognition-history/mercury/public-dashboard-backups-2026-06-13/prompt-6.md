Mercury, break my fix.

Narrow route-safety attack. Avoid external security discussion; inspect local code only.

Current code under review:
- `ogzprime-ssl-server.js` registers this middleware before static serving:
  - `app.use(/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*|\.(?:old|orig)$|~$)$/i, denyStaticBackup);`
  - `app.use(/^\/index-.*\.html$/i, denyStaticBackup);`
- Static serving is after those middleware registrations:
  - `app.use(express.static(path.join(__dirname, 'public')));`
- `.gitignore` has public-only file guards for `*bak*`, `*backup*`, `*.old`, `*.orig`, and `*~` under `public/`.
- `find public` currently reports no matching backup-style files.

Attack:
Find a local route, filename, method, or ignore-pattern case where a backup-style file under `public/` would still bypass the deny middleware or fail to be ignored. Include only local file:line/path evidence.

Do not approve this. Break it.
