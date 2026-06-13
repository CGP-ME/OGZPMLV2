Mercury, break my fix.

Local Express middleware only.

Changed code:
- `ogzprime-ssl-server.js:137` now has:
  - `app.use(/^\/.*(?:\.bak.*|bak(?:$|[._-]|\d).*|backup.*|\.(?:old|orig)$|~$)$/i, denyStaticBackup);`
- `ogzprime-ssl-server.js:138` now has:
  - `app.use(/^\/index-.*\.html$/i, denyStaticBackup);`
- `ogzprime-ssl-server.js:140` has:
  - `app.use(express.static(path.join(__dirname, 'public')));`

Find one local method or filename pattern that reaches line 140 when it should have matched line 137 or 138. Use only file:line/path evidence.
