# Mercury Attack Prompt: SessionRouter OHLC Epoch Fencing

Attack one mechanism only: SessionRouter OHLC callback fencing.

Changed files:
- `core/SessionRouter.js`
- `test/session-router-epoch-fencing.test.js`
- `CHANGELOG.md`

Relevant code ranges:
- `core/SessionRouter.js:72-84` adds active callback epoch/session/broker/status counters.
- `core/SessionRouter.js:375-478` adds `_nowIso`, `_recordOhlcFenceRejection`, `_ohlcFenceRejectReason`, `_buildOhlcFence`, and `_attachActiveOhlcCallback`.
- `core/SessionRouter.js:750-759` activates stocks and attaches fenced Alpaca OHLC callback after target activation.
- `core/SessionRouter.js:901-910` activates crypto and attaches fenced Kraken OHLC callback after target activation.
- `core/SessionRouter.js:949-954` initial crypto activation attaches fenced Kraken callback.
- `core/SessionRouter.js:981-986` initial stocks activation attaches fenced Alpaca callback.
- `core/SessionRouter.js:1026-1036` exposes callback fence status.
- `test/session-router-epoch-fencing.test.js:103-211` covers stale source callback rejection, transition-in-progress rejection, failed-safe rejection, status projection, and missing broker identity rejection.

Architecture requirement:
Any stale OHLC callback from an older transition epoch, wrong broker, wrong session, transition-in-progress window, or failed-safe state must be rejected before it reaches the bot's `onOhlcCallback`. Accepted events must be stamped with `sessionRouterEpoch`, `sessionRouterTransitionId`, `sessionRouterSession`, and `sessionRouterBrokerId`.

Attack framing:
Find a concrete current-code path where stale, wrong-session, wrong-broker, or wrong-epoch OHLC data can still reach `onOhlcCallback` after this change, or where the fence silently lies about the active broker/session/epoch. Include exact file:line evidence and an input/event sequence. Also attack whether the fix only blocks the symptom while leaving a source listener lifecycle or status-state failure that can still mutate candle/state data.

Do not review unrelated dashboard/front-end or pattern-memory code. Do not give style feedback. If no bypass exists in these ranges, say that and name the assumptions that remain.
