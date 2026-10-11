# Per-symbol candle analysis dispatch — deferred 27

The runner used the global timeframe history’s new-candle result, suppressing later symbols that shared the same candle close. It now uses the already-present per-symbol history’s result. Both storage calls and existing duplicate-update handling remain.

Actual AST-extracted OHLC handler and both store methods: baseline dispatches TSLA twice across two closes; exact candidate and working dispatch TSLA/SPY at each close, with no repeat-update retrigger. [Receipt](source-receipt.json) qualifies runner refs, working dependencies and dispatch-only stubs. No network, broker orders, runtime restart or full scanner claim.

[Astra source review](astra-review.json), [fixture review](test-review.json), [Mercury raw answer](delivery-review-answer.txt), [adjudication](mercury-adjudication.json). Mercury found_break alleges unchanged shutdown/startup/dashboard blocks and incorrectly treats the executable runner as uncalled; Astra compares exact base/candidate and executable/PM2 entrypoints. No introduced blocker established. Raw verdict is preserved.

Reproduce: `node ogz-meta/inbox/codex/2026-10-11/mtf-symbol-dispatch/fixtures/runner-symbol-dispatch.cjs "$PWD"`; add `--baseline --ref 4f75871cb28eedc5b3a22f9b55b77e717787952f` to reproduce the baseline. Concurrent configured-timeframe scanning remains open under item 27.
