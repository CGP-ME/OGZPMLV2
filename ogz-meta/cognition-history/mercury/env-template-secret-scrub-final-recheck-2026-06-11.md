Mercury, break my fix.

Target files:
- config/.env.example after replacing credential values, username/password values, wallet-address values, and token-like voice id values with placeholders.
- CHANGELOG.md lines 10-12 for the operator-facing record.
- scripts/scan-secrets.js lines 83-116 as the current scanner limitation, not fixed in this slice.

Attack objective:
Find any remaining public-template assignment that still carries real-looking sensitive material or token-like material instead of a placeholder. Include credential keys, secret keys, auth tokens, passwords, usernames, wallet addresses, private-key blocks, JWT-like strings, vendor token prefixes, and long opaque provider ids that can function as account identifiers.

Known scope boundary:
This slice only scrubs the public template. The scanner hardening is the next separate commit.
