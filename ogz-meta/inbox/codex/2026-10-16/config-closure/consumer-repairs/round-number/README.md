# Active round-number trailing consumer

See source-manifest.json for exact blobs and review identity, verification.log for executed results, REVIEW-ASTRA.md and final-delivery-review-answer.txt for the independent and Mercury review records. The later fixture extension executes percent trailing, channel exclusion and the zero-factor minimum clamp; those are additional to the reviewer's earlier static examination.

Reconstruct fixtures/source-baseline/ExitContractManager.js and DynamicTrailingStop.js from manifest.base (paths core/ExitContractManager.js and core/exit/DynamicTrailingStop.js), and fixtures/source-candidate/ExitContractManager.js from reviewCandidate. Invoke the repository isolation launcher with all four fixture paths:

```sh
python3 scripts/test-isolated.py \
  --fixture ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/verify-round-number.cjs \
  --fixture ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-baseline/ExitContractManager.js \
  --fixture ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-baseline/DynamicTrailingStop.js \
  --fixture ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-candidate/ExitContractManager.js \
  -- node ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/verify-round-number.cjs
```

No real orders, learned banks or process state are used.
