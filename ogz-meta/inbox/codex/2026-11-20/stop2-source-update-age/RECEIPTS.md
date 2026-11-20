# Candle source-update age — evidence

The detailed change record is the November 19 PST entry in `CHANGELOG.md`. Evidence paths use November 20 UTC. This source repair has not been activated in PM2.

| Evidence | File |
| --- | --- |
| Four-file production change shown before commit | [source.diff](source.diff) |
| Baseline reproduction | [baseline-final.json](baseline-final.json) |
| Working candidate replay | [candidate-final.json](candidate-final.json) |
| Exact staged candidate replay | [pinned.json](pinned.json) |
| Executed helper and explicit limitations | [source-update.cjs](fixtures/source-update.cjs) |
| Real, public seven-frame Kraken capture | [kraken-public.json](fixtures/kraken-public.json) |
| Pinned tree, file hashes and inherited harness identity | [source-identity.json](source-identity.json) |
| Single neutral review question and arguments | [review-command.json](review-command.json) |
| Complete Mercury answer | [mercury-answer.md](mercury-answer.md) |
| Review result, costs and named gaps | [review.json](review.json) |
| Source/config/process preservation before activation | [preflight.json](preflight.json) |

Verification command:

```bash
python3 scripts/test-isolated.py \
  --fixture ogz-meta/inbox/codex/2026-11-20/stop2-source-update-age/fixtures/source-update.cjs \
  --fixture ogz-meta/inbox/codex/2026-11-20/stop2-source-update-age/fixtures/kraken-public.json \
  -- node ogz-meta/inbox/codex/2026-11-20/stop2-source-update-age/fixtures/source-update.cjs
```

Original and staged-source overrides were supplied as additional explicit fixtures; their full source snapshots and the complete launch logs remain private. They contain no copied runtime state or credentials. The checked source hashes are in each execution receipt.

The helper's external stock protocol examples are synthetic fixtures. The Kraken capture is real public data. Both execute the actual changed production paths in an isolated process; neither is represented as a restarted bot or real order execution. Stock candle values match the baseline across all three scenarios. The receipt preserves update age, interval-end age and their source separately.

Protocol references independently opened during this repair: [Kraken v1 OHLC](https://docs.kraken.com/exchange/api-reference/spot-websocket-v1/ohlc) defines the last-update and interval-end fields separately. [Alpaca stock stream](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data) documents previous-minute bars and subsequent revisions. Mercury's own external lookup failed; that gap is preserved in its answer and review receipt.
