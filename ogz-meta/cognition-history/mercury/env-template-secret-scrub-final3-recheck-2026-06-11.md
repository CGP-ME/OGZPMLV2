Mercury, break my fix.

Target files:
- config/.env.example after replacing credential values, username/password values, wallet-address values, provider id values, database/redis connection strings, and URL/domain/host environment identifiers with placeholders.
- CHANGELOG.md lines 10-12 for the operator-facing record.
- scripts/scan-secrets.js lines 83-116 as the current scanner limitation, not fixed in this slice.

Attack objective:
Find any remaining public-template value that still carries real-looking sensitive material, account-identifying token-like material, or old environment-specific identifiers instead of a placeholder. Include credential keys, usernames, passwords, wallet addresses, database or redis URLs, public endpoint URLs, domains, hosts, private-key blocks, JWT-like strings, vendor token prefixes, and opaque provider ids.

Known scope boundary:
This slice only scrubs the public template. The scanner hardening is the next separate commit.
