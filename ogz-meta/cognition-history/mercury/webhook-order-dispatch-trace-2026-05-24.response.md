# Mercury response: webhook order dispatch trace

Mercury ran with:

```bash
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "$(cat ogz-meta/cognition-history/mercury/webhook-order-dispatch-trace-2026-05-24.md)"
```

Result:

- `_emitWebhookOrder` catches synchronous adapter exceptions and promise rejections, then emits failure traces and returns a resolved promise. Rejections cannot bubble into the trading loop.
- `success` is true only when `result?.sent === true`; dry-run, non-2xx, malformed, missing, or thrown adapter results are not reported as successful.
- The helper reads adapter result fields and emits sanitized trace payloads; it does not write adapter data into trading state.
- BUY, SELL_SHORT, SELL, and COVER call sites preserve the same webhook payload fields and side semantics as before.
- `WEBHOOK_ORDER_DISPATCH` and `WEBHOOK_ORDER_RESULT` close the observability gap without claiming broker acceptance.
- The only new side effect identified is a pending fire-and-forget promise if the adapter never resolves; this does not block the trading loop and emits no false success.

Mercury verdict:

> The change safely adds non-blocking observability without introducing stalls, false-positive success reports, state corruption, or new crash paths. The only practical side-effect is a lingering, fire-and-forgotten promise if the webhook never resolves, which does not affect live trading.

Iterations: 10
Termination: answer_given
