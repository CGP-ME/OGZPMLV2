# Secret scan

All77 gzip artifacts were decompressed and scanned with the repository scanner. Two strict findings are the exact metadata literal apiKeySource field with the literal value none; this is an absence label, not a credential. Scanner-input-only normalization of that exact literal leaves zero unresolved findings. Stored redacted tapes and their hashes are unchanged. Full raw scanner dispositions remain private; no secret values are published.
