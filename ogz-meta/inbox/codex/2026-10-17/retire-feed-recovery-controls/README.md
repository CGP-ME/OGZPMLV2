# Retired unreachable feed-recovery controls

Source: base `595d981f8a67662ed0dd57741b583c91948539d0`, reviewed tree `fabe26e7407217cdef38b310284fb06bed6c1370`. `receipt.json` identifies exact source, harness and review manifest.

`archived-values.json` preserves the two removed values. Neither affected current trading: their branches required `staleFeedPaused=true`, which had no production writer. Real stale-data reporting, backfill/retry and watchdog recovery remain. The separate recovery of historical persisted data-feed pauses remains.

`verification.txt` is an isolated baseline/candidate behavior comparison using actual processor source and the extracted watchdog method, with explicit collaborators. `provenance-results.json` records six role/profile source checks and archived-env injection checks. These do not assert full bot/runtime acceptance.

Mercury blast tracing returned `cannot_verify`; the final candidate review returned `found_break`. Both answers are retained with trailing whitespace normalized; verdict text unchanged. `adjudication.md` records Astra GO under Trey's authorized disagreement adjudication: the cited code is unchanged and the alleged missing WeakSet registration exists. The harness auto-selected three production paths; the complete candidate also removes two literals from each of three test fixtures. No unrelated code was changed to satisfy incorrect review allegations.

To reproduce the focused behavior comparison, export `core/CandleProcessor.js`, `run-empire-v2.js`, and `config/internals.json` with `git show` from the two pinned trees into `fixtures/base-processor.cjs`, `base-runner.cjs`, `base-internals.json` and the matching `candidate-*` names. Run `fixtures/verify.cjs` only through `python3 scripts/test-isolated.py`, explicitly supplying all seven files via `--fixture`. Those generated source copies and private provider evidence are intentionally not committed. Provenance probes reuse the config-closure probe implementation against exact candidate ConfigLoader/settings/internals exports; result checks and fingerprints are recorded here.

No PM2 restart, environment reload, broker operation or learned-state mutation was performed. This closes these two obsolete controls only; it does not claim whole Stop 1 runtime acceptance.
