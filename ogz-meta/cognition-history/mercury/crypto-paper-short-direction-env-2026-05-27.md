Mercury adversarial review - crypto paper short direction PM2 env.

Attack the current uncommitted patch:
- ecosystem.config.js adds DIRECTION_FILTER=both and ENABLE_SHORTS=true to ogz-prime-v2 env.
- CHANGELOG.md documents the runtime config change.

Question:
Can ogz-prime-v2 still inherit a stale .env long-only/short-disabled posture after this patch, or can this config change accidentally affect backtest/P0/live-safety posture outside the PM2 crypto paper app?

Inspect:
- ecosystem.config.js ogz-prime-v2 env block
- core/TradingConfig.js directionFilter and enableShorts readers
- core/TradingLoop.js direction filter gate

Return blockers only. If no blocker, state the exact file:line proof.
