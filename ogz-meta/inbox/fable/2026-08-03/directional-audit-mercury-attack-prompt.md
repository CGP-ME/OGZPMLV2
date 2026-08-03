# Directional Runtime Audit — Mercury Attack Prompt (2026-08-03)

Dispatched via: node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750

## Question (verbatim)

Break my fix. The directional (long/short) work on this bot claims the runtime
is direction-aware end to end: decisions speak buy/sell/hold, open trades speak
long/short, broker actions speak BUY/SELL/SELL_SHORT/COVER, and lifecycle labels
come from core/PositionEffect.js (open_long/close_long/open_short/close_short/
unknown_effect). ENABLE_SHORTS=false and DIRECTION_FILTER=long_only today, but
the claim is that flipping them on is safe plumbing-wise.

Attack that claim. Construct ONE concrete short-trade state — entry, partial
close, trailing exit, restart-restore, or webhook exit — that the current code
mishandles SILENTLY: a defaulted direction, a swallowed unknown, a wrong-sign
P&L, or a long-vocabulary action emitted for a short. Known suspicious anchors
you may start from (re-derive each against current HEAD, do not trust this list):
core/PatternBasedExitModel.js:105 (direction || 'buy' inside an exit model),
core/PositionTracker.js:412 (trade.side || 'long'),
core/PipelineSnapshot.js:306,315 (t.direction || 'long'),
core/TradingLoop.js:599-628 (_directionGateStatus + _entryPositionEffect;
enableShorts arrives as default-param null at line 452),
core/OrderExecutor.js:56 (String(trade?.direction || '')).

Walk the state to the wrong output. Name the exact file:line chain, the state
that triggers it, and what the operator sees versus what actually happened. If
you cannot construct a silent mishandling, say exactly which guard stopped each
attempt — do not soften the attack into a review.
