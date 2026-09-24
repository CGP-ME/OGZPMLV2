# Evidence

- transport-observation.json and observe-transport.cjs: actual OS argv/pipe outcomes, byte/hash comparison and unchanged failure propagation; zero provider calls.
- fable-replay-start.json: historical source run, exact 190,403-byte prompt SHA c114e3d3debdd322b4049c58dd43228af9ca0586cdd53861f676410d5eb3aa02, source hash before dispatch.
- fable-replay-receipt.json: actual one-seat provider replay. Output raw bytes 28,079, SHA 4cf0f0f627d8dc0e79f56777dc60e31d4f97c7204019579eb8c849303c5b817e. Original raw and private metadata stay local, not staged.
- Previous full-run source/index and live database were rechecked unchanged after completion; see ../mercury-full-chain/reviewer-evidence/post-review-verification.json. Those index receipts predate this transport edit.

New throw count: zero. New bot gates/fallbacks/behavior: zero. Pipe errors are reported, not silently swallowed. No model verdict or evidence absence was altered.
