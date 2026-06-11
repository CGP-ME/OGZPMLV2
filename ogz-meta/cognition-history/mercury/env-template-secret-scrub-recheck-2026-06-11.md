Mercury, break my fix.

Target files:
- config/.env.example after the corrected public env template scrub.
- CHANGELOG.md lines 10-12 for the operator-facing record.
- scripts/scan-secrets.js lines 83-116 as the current scanner limitation, not fixed in this slice.

Attack objective:
Find any remaining real-looking sensitive value in the tracked public env template, including credential-named assignments, username/password fields, wallet-address fields, private-key material, JWT-like material, vendor token prefixes, or multiline spillover from a prior secret. Also find any new failure caused by replacing the old example values with placeholders.

Known scope boundary:
This slice only scrubs the public template. The scanner hardening is the next separate commit.
