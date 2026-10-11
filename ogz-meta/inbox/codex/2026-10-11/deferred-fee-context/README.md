# Deferred 7 — fees after proposed entry sizing

Timeframe discovery no longer compares ATR against fees before a trade exists. OrderExecutor uses its existing FeeModel helper after the real capped/share-adjusted entry plan exists and publishes estimatedEntryFee in ORDER_PLAN. Actual filled-fee accounting is unchanged. No new gate, throw, default, fallback or fee owner.

Reviewed production/test tree: `ddc2ba47fef5b57b0cbe4ea590b4aea1870baa37`, base `604342778287175882c328858773825ada4988e0`. Unrelated dirty executor changes were excluded from the candidate. Working-source proof is additional qualified evidence, not delivery of those edits.

Verification: [behavior receipt](behavior-receipt.json) preserves final exact-source and working-source runs, source hashes, seven ready timeframe results, BUY and SELL_SHORT plans and persisted entry fees. Nonzero percentage charges pass; per-share proof exercises both the minimum and quantity-based charge. Baseline reproduces the absent-feeContext exception. The two existing selector tests pass. The initial broad Jest invocation failed writing its repository cache before tests; bounding roots/cache fixed the runner invocation. Initial zero-fee percent receipts remain local and are superseded for nonzero arithmetic by the final runs.

Review: [Astra source review](astra-review.json), [Mercury raw answer](delivery-review-answer.txt), [source receipt](review-receipt.json), [combined adjudication](mercury-adjudication.json). Mercury returned found_break; both alleged regressions are byte-identical inherited blocks. Astra checked their actual callers and found no introduced blocker. Do not relabel Mercury clean or claim inherited risks exhaustively cleared.

Reproduce from repository root:

```
node ogz-meta/inbox/codex/2026-10-11/deferred-fee-context/fixtures/run.cjs HEAD percent
node ogz-meta/inbox/codex/2026-10-11/deferred-fee-context/fixtures/run.cjs HEAD per_share_minimum
```

Fixture exports execute real isolated ConfigLoader, selector, OrderExecutor, StateManager, FeeModel and TraceSpine, with explicit paper credentials/placeholders, redirected mutable paths, network refusal and controlled strategy inputs. They reuse the previously delivered executor context. Generated exports/logs stay local under runs. Entry estimate is not realized live cost or a roundtrip profitability policy. Concurrent multi-timeframe scanner item 27 remains open. No PM2 restart/resume or production activation.
