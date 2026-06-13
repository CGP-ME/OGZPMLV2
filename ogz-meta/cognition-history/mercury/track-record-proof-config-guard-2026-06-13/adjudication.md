# Track Record Proof Config Guard Mercury Adjudication

Date: 2026-06-13

## Accepted

- Mercury v1 identified the unnecessary `_test` resolver export as an avoidable production surface.
- Mercury v3 identified the exported `_writeTrackRecordNow` object method as an unnecessary direct writer surface.
- Both surfaces were removed. The writer is now module-private and reachable through `publishTrackRecord()` and shutdown flush only.

## Bounded

- Mercury v5 noted that `STARTING_BALANCE === TTP_MAX_LOSS_THRESHOLD_EQUITY` is rejected because the derived max drawdown is zero. This is intentional for the public proof contract; a zero max-drawdown line would be fake or misleading for eval proof.
- Generic direct use of `writeJsonAtomic` by unrelated future code is not a bypass of this logger. Sibling search did not find another current writer for `public/proof/track-record/data/accounts/*.json`.

## Closed Mechanism

- `ogz-meta/claudito-logger.js` no longer falls back to `default`, `10000`, `0`, or `unknown` for public track-record account proof config.
- `test/claudito-track-record-config.test.js` drives the exported `TradingProofLogger.publishTrackRecord()` path with mocked atomic writes and proves valid TTP values write `profit_target: 300` and `max_drawdown: 150`, while missing/invalid values do not call `writeJsonAtomic`.
