# Session 2026-06-11 - Eval Flip Final Blocker

## Scope

This note records the final eval-readiness work after the market-hours capture window closed on 2026-06-11. It covers the webhook placeholder containment fix, the PM2 runtime-env gate fix, and the current go/no-go blocker for the next market session.

## Commits Landed

- `5534863 Fixed webhook placeholder URL live guard`
  - Added placeholder URL detection to `foundation/ConfigLoader.js` and `core/WebhookOrderAdapter.js`.
  - Blocks non-dry-run webhook order routing when `SIGNALSTACK_WEBHOOK_URL` still contains placeholder hook identifiers.
  - Covers exact, encoded, double-encoded, and userinfo-hidden `YOUR_UNIQUE_ID` variants.
- `5b92a12 Fixed eval PM2 runtime env gate`
  - Made `ogz-meta/gates/eval-live-posture-gate.js --pm2` read `/proc/<pid>/environ` instead of stale `pm2 jlist` metadata when a PM2 PID exists.
  - Added process identity checks against `pm_id`, `name`, `pm_exec_path`, and `/proc/<pid>/cmdline`.
  - Added regressions for stale metadata, wrong PID/process identity, unreadable proc env, and non-required secret redaction.

## Verification

- `node --check foundation/ConfigLoader.js` - PASS
- `node --check core/WebhookOrderAdapter.js` - PASS
- `npm test -- --runInBand test/config-loader-live-guard.test.js test/webhook-order-adapter.test.js` - PASS, 63/63
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` - PASS
- `node --check ogz-meta/gates/eval-live-posture-gate.js` - PASS
- `npm test -- --runInBand test/eval-live-posture-gate.test.js` - PASS, 29/29
- `node scripts/scan-secrets.js --staged` - PASS for both committed slices
- `git diff --cached --check` - PASS for both committed slices
- Mercury adversarial pass attacked the webhook placeholder guard and found encoded/userinfo/non-live dry-run gaps; those were fixed before commit.
- Mercury adversarial pass attacked PM2 runtime-env extraction and identified wrong-PID/process identity as the real hardening class; identity checks were added before commit.

## Current Runtime Truth

`node ogz-meta/gates/eval-live-posture-gate.js --pm2 ogz-prime-v2` now reads the true PM2 process environment and fails for one blocker:

```text
WEBHOOK_DRY_RUN=false cannot run with WEBHOOK_ORDERS_ENABLED=true and placeholder SIGNALSTACK_WEBHOOK_URL
```

The process currently has:

- `EXECUTION_MODE=live`
- `LIVE_TRADING=true`
- `PAPER_TRADING=false`
- `ALPACA_MODE=paper`
- `WEBHOOK_ORDERS_ENABLED=true`
- `WEBHOOK_DRY_RUN=false`
- `EVAL_RULES_ENABLED=true`
- `TTP_RULES_ENABLED=true`
- `ACCOUNT_DRAWDOWN_BYPASS=false`
- `RISK_MANAGER_BYPASS=false`
- `SIGNALSTACK_WEBHOOK_URL` present but still pointing at the placeholder hook path.

## TTP 5k MAX Rule Check

The loaded runtime values match the current Trade The Pool Day Trade MAX 5k table:

- Initial balance: `$5,000`
- Profit target: `6%` = `$300`
- Daily Pause: `1%` = `$50`
- Max Loss: `3%` = `$150`, threshold equity `$4,850`
- Minimum positions: `20`
- Consistency: `30%`
- Trading period: `60 days`

The earlier `7%` max drawdown number applies to Swing accounts, not Day Trade MAX.

## In-Memory Readiness Probe

I ran `validateEvalLiveReadiness()` against the actual PM2 process env with only `SIGNALSTACK_WEBHOOK_URL` temporarily replaced in memory by a non-placeholder HTTPS URL. No files or env were changed.

Result: PASS.

That means the remaining failed eval gate is the real webhook URL, not state flatness, Alpaca paper flatness, TTP numeric config, symbol scope, or rule flags.

## Tomorrow Flip Checklist

1. Set `SIGNALSTACK_WEBHOOK_URL` to the real SignalStack hook value in the runtime environment.
2. Restart `ogz-prime-v2` only after explicit operator approval.
3. Immediately run:

```bash
node ogz-meta/gates/eval-live-posture-gate.js --pm2 ogz-prime-v2
node ogz-meta/gates/multi-runtime-gate-runner.js --eval --pm2 ogz-prime-v2
```

4. Expected result after real webhook URL: eval posture gate PASS.
5. During market hours, capture one paper broker/webhook ack round trip.
6. Confirm trace chain includes strategy decision, eval rule check, webhook dispatch, broker/webhook result, position/open state, exit reason, PnL, stop loss, and profit-tier behavior.

## Open Items

- Real `SIGNALSTACK_WEBHOOK_URL` is still required; do not print or commit it.
- PM2 has not been restarted onto commits `5534863` or `5b92a12`.
- Market-hours broker/webhook ack capture was not completed on 2026-06-11 because the market was closed by the time this blocker was isolated.
- Existing unrelated dirty work remains in Claude bridge files, track-record data, runtime journals, cognition history, and ledger intake. None of it was staged in these commits.
