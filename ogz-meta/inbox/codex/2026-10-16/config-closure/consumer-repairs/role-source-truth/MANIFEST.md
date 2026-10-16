# Role source-truth repair packet

- Source: baseline `097ef8c3ff3fa2af3c7c90795e215d094003f206`, candidate `ee46b4a51723f1d712876de0bee883ec66461678`.
- Date: 2026-10-16.
- Why kept: reproducible correction of misleading canonical source labels without changing resolved configuration values.
- Exact source blobs: source-manifest.json; reproduce.py reconstructs them from git.
- Verification: actual copied Loader in helper isolation, synthetic credentials only; no runtime activation.
