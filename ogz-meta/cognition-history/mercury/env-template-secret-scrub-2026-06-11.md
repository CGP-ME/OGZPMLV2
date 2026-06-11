Mercury, break my fix.

Target files:
- config/.env.example lines 33, 52, 112-113, 131-133, 143, 151, 167, 182-183, and 197 after the public env template scrub.
- CHANGELOG.md lines 10-12 for the operator-facing record.
- scripts/scan-secrets.js lines 83-116 as the current scanner limitation, not yet fixed in this slice.

Attack objective:
Find a path where this template scrub still leaves real credential material, private-key material, JWT-like material, or non-placeholder credential assignments in the tracked public env template, or where the changed template shape would create a new security failure. Treat this as containment of a public tracked template, not as live runtime env rotation.

Known scope boundary:
This slice does not claim the scanner now catches the class. The next separate slice must harden scripts/scan-secrets.js so template credential fields cannot regress.
